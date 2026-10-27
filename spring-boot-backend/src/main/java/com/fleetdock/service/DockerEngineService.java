package com.fleetdock.service;

import com.fleetdock.config.DockerClientFactory;
import com.fleetdock.dto.ContainerDeployRequest;
import com.fleetdock.dto.ContainerDto;
import com.fleetdock.entity.VmHost;
import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.async.ResultCallback;
import com.github.dockerjava.api.command.*;
import com.github.dockerjava.api.model.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.Closeable;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DockerEngineService {

    private final VmHostService vmHostService;
    private final DockerClientFactory dockerClientFactory;
    private final SshDockerExecutorService sshDockerExecutorService;

    /**
     * Queries real Docker system info and latency from target VM
     */
    public Map<String, Object> testConnection(String vmId) {
        VmHost host = vmHostService.getHostById(vmId);
        if (sshDockerExecutorService.isSshHost(host)) {
            return sshDockerExecutorService.testConnection(host, vmHostService);
        }

        long start = System.currentTimeMillis();
        try {
            DockerClient client = dockerClientFactory.getClientForHost(host);
            client.pingCmd().exec();
            long latency = Math.max(1, System.currentTimeMillis() - start);

            Info info = client.infoCmd().exec();

            host.setStatus("online");
            host.setPingMs((int) latency);
            if (info.getServerVersion() != null) host.setDockerVersion("Docker " + info.getServerVersion());
            if (info.getNCPU() != null) host.setCpuCores(info.getNCPU());
            if (info.getMemTotal() != null) host.setMemoryGb((int) (info.getMemTotal() / (1024 * 1024 * 1024)));
            if (info.getOperatingSystem() != null) host.setOs(info.getOperatingSystem());
            if (info.getArchitecture() != null) host.setArch(info.getArchitecture());
            vmHostService.save(host);

            return Map.of(
                    "status", "online",
                    "latencyMs", latency,
                    "dockerVersion", info.getServerVersion() != null ? info.getServerVersion() : "unknown",
                    "containersTotal", info.getContainers() != null ? info.getContainers() : 0,
                    "containersRunning", info.getContainersRunning() != null ? info.getContainersRunning() : 0,
                    "containersStopped", info.getContainersStopped() != null ? info.getContainersStopped() : 0,
                    "os", info.getOperatingSystem() != null ? info.getOperatingSystem() : host.getOs(),
                    "message", "Handshake succeeded with Docker Engine on " + host.getIp() + ":" + host.getPort()
            );
        } catch (Exception e) {
            log.warn("Docker ping failed for host: {} ({}) -> {}", host.getName(), host.getIp(), e.getMessage());
            // If connection was reset on port 22, attempt SSH fallback
            if (host.getPort() == 22 || e.getMessage().contains("Connection reset")) {
                log.info("Attempting SSH fallback test for host {}", host.getIp());
                return sshDockerExecutorService.testConnection(host, vmHostService);
            }
            host.setStatus("error");
            vmHostService.save(host);
            return Map.of(
                    "status", "error",
                    "message", "Connection failed on " + host.getIp() + ":" + host.getPort() + " -> " + e.getMessage()
            );
        }
    }

    /**
     * Queries actual running and stopped containers directly from the VM's Docker daemon
     */
    public List<ContainerDto> listContainers(String vmId, String filter) {
        VmHost host = vmHostService.getHostById(vmId);
        if (sshDockerExecutorService.isSshHost(host)) {
            return sshDockerExecutorService.listContainers(host, filter);
        }

        try {
            DockerClient client = dockerClientFactory.getClientForHost(host);

            ListContainersCmd cmd = client.listContainersCmd().withShowAll(true);
            if ("running".equalsIgnoreCase(filter)) {
                cmd.withStatusFilter(Collections.singletonList("running"));
            } else if ("stopped".equalsIgnoreCase(filter) || "exited".equalsIgnoreCase(filter)) {
                cmd.withStatusFilter(Collections.singletonList("exited"));
            }

            List<Container> dockerContainers = cmd.exec();
            log.info("Fetched {} live containers from host {} ({})", dockerContainers.size(), host.getName(), host.getIp());

            return dockerContainers.stream().map(c -> {
                String name = (c.getNames() != null && c.getNames().length > 0)
                        ? c.getNames()[0].replaceFirst("^/", "")
                        : c.getId().substring(0, Math.min(12, c.getId().length()));

                List<ContainerDto.PortMapping> ports = new ArrayList<>();
                if (c.getPorts() != null) {
                    for (ContainerPort p : c.getPorts()) {
                        if (p.getPublicPort() != null) {
                            ports.add(new ContainerDto.PortMapping(
                                    p.getPublicPort(),
                                    p.getPrivatePort() != null ? p.getPrivatePort() : 0,
                                    p.getType() != null ? p.getType() : "tcp"
                            ));
                        }
                    }
                }

                String state = c.getState() != null ? c.getState().toLowerCase() : "stopped";
                String composeProject = c.getLabels() != null ? c.getLabels().get("com.docker.compose.project") : null;
                String createdTime = Instant.ofEpochSecond(c.getCreated()).toString().replace("T", " ").substring(0, 19);

                // Fetch real container inspect config
                long memLimitMb = 0;
                String restartPolicy = "no";
                Map<String, String> envMap = new HashMap<>();
                try {
                    InspectContainerResponse inspect = client.inspectContainerCmd(c.getId()).exec();
                    if (inspect.getHostConfig() != null) {
                        if (inspect.getHostConfig().getMemory() != null && inspect.getHostConfig().getMemory() > 0) {
                            memLimitMb = inspect.getHostConfig().getMemory() / (1024 * 1024);
                        }
                        if (inspect.getHostConfig().getRestartPolicy() != null) {
                            restartPolicy = inspect.getHostConfig().getRestartPolicy().getName();
                        }
                    }
                    if (inspect.getConfig() != null && inspect.getConfig().getEnv() != null) {
                        for (String envStr : inspect.getConfig().getEnv()) {
                            int idx = envStr.indexOf('=');
                            if (idx > 0) {
                                envMap.put(envStr.substring(0, idx), envStr.substring(idx + 1));
                            }
                        }
                    }
                } catch (Exception ex) {
                    // Fallback to defaults if inspect times out
                }

                return ContainerDto.builder()
                        .id(c.getId().substring(0, Math.min(12, c.getId().length())))
                        .vmId(vmId)
                        .name(name)
                        .image(c.getImage())
                        .state(state)
                        .statusText(c.getStatus() != null ? c.getStatus() : state)
                        .created(createdTime)
                        .command(c.getCommand() != null ? c.getCommand() : "")
                        .cpuPercent(0.0)
                        .memUsageMb(0)
                        .memLimitMb(memLimitMb)
                        .ports(ports)
                        .envVars(envMap)
                        .composeStack(composeProject)
                        .restartPolicy(restartPolicy)
                        .build();
            }).collect(Collectors.toList());

        } catch (Exception e) {
            log.error("Could not fetch live containers from Docker daemon on host {} ({}): {}", 
                    host.getName(), host.getIp(), e.getMessage());
            throw new RuntimeException("Failed to query Docker daemon on " + host.getIp() + ":" + host.getPort() + " -> " + e.getMessage(), e);
        }
    }

    public void startContainer(String vmId, String containerId) {
        VmHost host = vmHostService.getHostById(vmId);
        if (sshDockerExecutorService.isSshHost(host)) {
            sshDockerExecutorService.startContainer(host, containerId);
            return;
        }
        DockerClient client = dockerClientFactory.getClientForHost(host);
        client.startContainerCmd(containerId).exec();
    }

    public void stopContainer(String vmId, String containerId, int timeoutSeconds) {
        VmHost host = vmHostService.getHostById(vmId);
        if (sshDockerExecutorService.isSshHost(host)) {
            sshDockerExecutorService.stopContainer(host, containerId, timeoutSeconds);
            return;
        }
        DockerClient client = dockerClientFactory.getClientForHost(host);
        client.stopContainerCmd(containerId).withTimeout(timeoutSeconds).exec();
    }

    public void restartContainer(String vmId, String containerId) {
        VmHost host = vmHostService.getHostById(vmId);
        if (sshDockerExecutorService.isSshHost(host)) {
            sshDockerExecutorService.restartContainer(host, containerId);
            return;
        }
        DockerClient client = dockerClientFactory.getClientForHost(host);
        client.restartContainerCmd(containerId).exec();
    }

    public void removeContainer(String vmId, String containerId, boolean force) {
        VmHost host = vmHostService.getHostById(vmId);
        if (sshDockerExecutorService.isSshHost(host)) {
            sshDockerExecutorService.removeContainer(host, containerId, force);
            return;
        }
        DockerClient client = dockerClientFactory.getClientForHost(host);
        client.removeContainerCmd(containerId).withForce(force).exec();
    }

    public ContainerDto deployContainer(String vmId, ContainerDeployRequest request) {
        VmHost host = vmHostService.getHostById(vmId);
        DockerClient client = dockerClientFactory.getClientForHost(host);

        try {
            client.pullImageCmd(request.getImage())
                    .exec(new PullImageResultCallback())
                    .awaitCompletion(90, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.warn("Image pull notice: {}", e.getMessage());
        }

        Ports portBindings = new Ports();
        List<ExposedPort> exposedPorts = new ArrayList<>();
        if (request.getPorts() != null) {
            for (ContainerDto.PortMapping pm : request.getPorts()) {
                ExposedPort ep = ExposedPort.tcp(pm.getContainerPort());
                exposedPorts.add(ep);
                portBindings.bind(ep, Ports.Binding.bindPort(pm.getHostPort()));
            }
        }

        HostConfig hostConfig = HostConfig.newHostConfig()
                .withPortBindings(portBindings)
                .withRestartPolicy(RestartPolicy.parse(request.getRestartPolicy()));

        if (request.getMemLimitMb() > 0) {
            hostConfig.withMemory(request.getMemLimitMb() * 1024 * 1024);
        }

        List<String> envList = new ArrayList<>();
        if (request.getEnvVars() != null) {
            request.getEnvVars().forEach((k, v) -> envList.add(k + "=" + v));
        }

        CreateContainerCmd createCmd = client.createContainerCmd(request.getImage())
                .withName(request.getName())
                .withHostConfig(hostConfig)
                .withExposedPorts(exposedPorts)
                .withEnv(envList);

        if (request.getCommand() != null && !request.getCommand().isBlank()) {
            createCmd.withCmd(request.getCommand().split(" "));
        }

        CreateContainerResponse resp = createCmd.exec();
        String newId = resp.getId();

        client.startContainerCmd(newId).exec();

        return ContainerDto.builder()
                .id(newId.substring(0, Math.min(12, newId.length())))
                .vmId(vmId)
                .name(request.getName())
                .image(request.getImage())
                .state("running")
                .statusText("Up Just now")
                .created(Instant.now().toString())
                .ports(request.getPorts())
                .envVars(request.getEnvVars())
                .restartPolicy(request.getRestartPolicy())
                .build();
    }

    public InspectContainerResponse inspectContainer(String vmId, String containerId) {
        VmHost host = vmHostService.getHostById(vmId);
        DockerClient client = dockerClientFactory.getClientForHost(host);
        return client.inspectContainerCmd(containerId).exec();
    }

    public List<Map<String, Object>> listVolumes(String vmId) {
        VmHost host = vmHostService.getHostById(vmId);
        if (sshDockerExecutorService.isSshHost(host)) {
            return sshDockerExecutorService.listVolumes(host);
        }
        DockerClient client = dockerClientFactory.getClientForHost(host);
        ListVolumesResponse resp = client.listVolumesCmd().exec();
        if (resp.getVolumes() == null) return Collections.emptyList();

        return resp.getVolumes().stream().map(v -> {
            Map<String, Object> map = new HashMap<>();
            map.put("name", v.getName());
            map.put("driver", v.getDriver() != null ? v.getDriver() : "local");
            map.put("scope", "local");
            map.put("mountpoint", v.getMountpoint() != null ? v.getMountpoint() : "");
            return map;
        }).collect(Collectors.toList());
    }

    public List<Map<String, Object>> listNetworks(String vmId) {
        VmHost host = vmHostService.getHostById(vmId);
        if (sshDockerExecutorService.isSshHost(host)) {
            return sshDockerExecutorService.listNetworks(host);
        }
        DockerClient client = dockerClientFactory.getClientForHost(host);
        List<Network> networks = client.listNetworksCmd().exec();
        if (networks == null) return Collections.emptyList();

        return networks.stream().map(n -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", n.getId().substring(0, Math.min(12, n.getId().length())));
            map.put("name", n.getName());
            map.put("driver", n.getDriver());
            map.put("scope", n.getScope() != null ? n.getScope() : "local");
            return map;
        }).collect(Collectors.toList());
    }

    public SseEmitter streamLogs(String vmId, String containerId, int tail, boolean follow) {
        VmHost host = vmHostService.getHostById(vmId);
        SseEmitter emitter = new SseEmitter(180_000L);

        if (sshDockerExecutorService.isSshHost(host)) {
            try {
                String logs = sshDockerExecutorService.getLogs(host, containerId, tail);
                for (String line : logs.split("\\r?\\n")) {
                    if (!line.trim().isEmpty()) {
                        emitter.send(SseEmitter.event().data(line));
                    }
                }
                emitter.complete();
            } catch (Exception e) {
                log.error("Failed to fetch logs via SSH for container {}: {}", containerId, e.getMessage());
                emitter.completeWithError(e);
            }
            return emitter;
        }

        try {
            DockerClient client = dockerClientFactory.getClientForHost(host);

            client.logContainerCmd(containerId)
                    .withStdOut(true)
                    .withStdErr(true)
                    .withFollowStream(follow)
                    .withTail(tail)
                    .withTimestamps(true)
                    .exec(new ResultCallback<Frame>() {
                        @Override
                        public void onStart(Closeable closeable) {}

                        @Override
                        public void onNext(Frame frame) {
                            try {
                                String line = new String(frame.getPayload(), StandardCharsets.UTF_8).trim();
                                if (!line.isEmpty()) {
                                    emitter.send(SseEmitter.event().data(line));
                                }
                            } catch (Exception ex) {
                                log.debug("SSE stream write closed");
                            }
                        }

                        @Override
                        public void onError(Throwable throwable) {
                            emitter.completeWithError(throwable);
                        }

                        @Override
                        public void onComplete() {
                            emitter.complete();
                        }

                        @Override
                        public void close() {}
                    });

        } catch (Exception e) {
            log.error("Failed to attach log stream to container {}: {}", containerId, e.getMessage());
            emitter.completeWithError(e);
        }

        return emitter;
    }
}
