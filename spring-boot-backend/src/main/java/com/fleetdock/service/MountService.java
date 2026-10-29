package com.fleetdock.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fleetdock.config.DockerClientFactory;
import com.fleetdock.entity.VmHost;
import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.command.InspectContainerResponse;
import com.github.dockerjava.api.model.Container;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

/** Lists container mounts of a host together with their disk usage. */
@Slf4j
@Service
@RequiredArgsConstructor
public class MountService {

    // Disk usage for the sources passed as positional args: "<du kb>|<fs total>~<used>~<avail>~<mountpoint>|<path>"
    private static final String USAGE_SCRIPT = String.join("\n",
            "T=''; command -v timeout >/dev/null 2>&1 && T='timeout 10'",
            "for p in \"$@\"; do",
            "  u=$($T du -sk -- \"$p\" 2>/dev/null | cut -f1)",
            "  f=$(df -Pk -- \"$p\" 2>/dev/null | tail -1 | awk '{print $2\"~\"$3\"~\"$4\"~\"$6}')",
            "  echo \"$u|$f|$p\"",
            "done");

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final VmHostService vmHostService;
    private final DockerClientFactory dockerClientFactory;
    private final SshDockerExecutorService sshDockerExecutorService;

    public List<Map<String, Object>> listMounts(String vmId) {
        VmHost host = vmHostService.getHostById(vmId);
        try {
            if (sshDockerExecutorService.isSshHost(host)) {
                return listViaSsh(host);
            }
            return listViaDockerApi(host);
        } catch (Exception e) {
            log.warn("Could not list mounts for host {}: {}", host.getIp(), e.getMessage());
            return Collections.emptyList();
        }
    }

    private List<Map<String, Object>> listViaSsh(VmHost host) throws Exception {
        // Same docker calls the container inspect popup uses, so results always agree with it
        String idsOut = sshDockerExecutorService.executeCommandWithFallback(host, "ps -aq");
        List<String> ids = new ArrayList<>();
        for (String id : idsOut.split("\\s+")) {
            if (id.matches("[0-9a-fA-F]+")) ids.add(id);
        }
        if (ids.isEmpty()) return Collections.emptyList();

        String json = sshDockerExecutorService.executeCommandWithFallback(host, "inspect " + String.join(" ", ids));
        int start = json.indexOf('[');
        JsonNode root = MAPPER.readTree(start >= 0 ? json.substring(start) : json);

        List<String[]> found = new ArrayList<>();
        Set<String> sources = new LinkedHashSet<>();
        for (JsonNode c : root) {
            String id = c.path("Id").asText("");
            String containerId = id.length() > 12 ? id.substring(0, 12) : id;
            String name = c.path("Name").asText("").replaceFirst("^/", "");
            for (JsonNode m : c.path("Mounts")) {
                String source = m.path("Source").asText("");
                found.add(new String[]{containerId, name, m.path("Type").asText("bind"), m.path("Name").asText(""),
                        source, m.path("Destination").asText(""), m.path("RW").asBoolean(true) ? "true" : "false"});
                if (!source.isBlank()) sources.add(source);
            }
        }

        Map<String, long[]> usageBySource = new HashMap<>();
        Map<String, String> fsMountPoints = new HashMap<>();
        if (!sources.isEmpty()) {
            try {
                collectUsage(host, sources, usageBySource, fsMountPoints);
            } catch (Exception e) {
                log.warn("Could not measure mount usage on {}: {}", host.getIp(), e.getMessage());
            }
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        for (String[] f : found) {
            rows.add(row(f[0], f[1], f[2], f[3], f[4], f[5], "true".equals(f[6]),
                    usageBySource.get(f[4]), fsMountPoints.get(f[4])));
        }
        return rows;
    }

    private void collectUsage(VmHost host, Set<String> sources, Map<String, long[]> usageBySource,
                              Map<String, String> fsMountPoints) {
        StringBuilder command = new StringBuilder("sh -c ").append(ShellSessionWrapper.quote(USAGE_SCRIPT)).append(" sh");
        for (String s : sources) command.append(' ').append(ShellSessionWrapper.quote(s));

        // du/df on bind paths usually needs no sudo; try plain first, then the host's sudo setting
        String output = String.valueOf(sshDockerExecutorService.execHostCommand(host, command.toString(), false).get("output"));
        if (host.isUseSudo() && output.lines().noneMatch(l -> l.contains("|") && l.split("\\|", 3).length == 3)) {
            output = String.valueOf(sshDockerExecutorService.execHostCommand(host, command.toString(), true).get("output"));
        }

        for (String line : output.split("\\R")) {
            if (line.isBlank()) continue;
            String[] top = line.split("\\|", 3);
            if (top.length < 3) continue;
            long[] values = {-1, -1, -1, -1};
            String[] fs = top[1].split("~");
            values[0] = parseLong(top[0]);
            if (fs.length >= 3) {
                values[1] = parseLong(fs[0]);
                values[2] = parseLong(fs[1]);
                values[3] = parseLong(fs[2]);
            }
            usageBySource.put(top[2], values);
            if (fs.length >= 4) {
                fsMountPoints.put(top[2], fs[3]);
            }
        }
    }

    private List<Map<String, Object>> listViaDockerApi(VmHost host) {
        DockerClient client = dockerClientFactory.getClientForHost(host);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Container c : client.listContainersCmd().withShowAll(true).exec()) {
            InspectContainerResponse info = client.inspectContainerCmd(c.getId()).exec();
            if (info.getMounts() == null) continue;
            String name = info.getName() != null ? info.getName().replaceFirst("^/", "") : c.getId();
            for (InspectContainerResponse.Mount m : info.getMounts()) {
                rows.add(row(c.getId().substring(0, 12), name,
                        m.getName() != null ? "volume" : "bind",
                        m.getName() != null ? m.getName() : "",
                        m.getSource() != null ? m.getSource() : "",
                        m.getDestination() != null ? m.getDestination().getPath() : "",
                        m.getRW() == null || m.getRW(), null, null));
            }
        }
        return rows;
    }

    private Map<String, Object> row(String containerId, String containerName, String type, String volumeName,
                                    String source, String destination, boolean rw, long[] usage, String fsMount) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("containerId", containerId);
        map.put("containerName", containerName);
        map.put("type", type);
        map.put("name", volumeName);
        map.put("source", source);
        map.put("target", destination);
        map.put("mode", rw ? "rw" : "ro");
        map.put("usedKb", usage != null && usage[0] >= 0 ? usage[0] : null);
        map.put("fsTotalKb", usage != null && usage[1] >= 0 ? usage[1] : null);
        map.put("fsUsedKb", usage != null && usage[2] >= 0 ? usage[2] : null);
        map.put("fsAvailKb", usage != null && usage[3] >= 0 ? usage[3] : null);
        map.put("fsMount", fsMount);
        return map;
    }

    private long parseLong(String s) {
        try {
            return Long.parseLong(s.trim());
        } catch (Exception e) {
            return -1;
        }
    }
}
