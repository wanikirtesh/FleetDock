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
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
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
                    .awaitCompletion(90L, TimeUnit.SECONDS);
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

    public Object inspectContainer(String vmId, String containerId) {
        VmHost host = vmHostService.getHostById(vmId);
        if (sshDockerExecutorService.isSshHost(host)) {
            return sshDockerExecutorService.inspectContainer(host, containerId);
        }
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

                if (!follow) {
                    emitter.complete();
                    return emitter;
                }

                // If follow=true, periodically fetch new runtime logs
                ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
                AtomicReference<String> lastLineRef = new AtomicReference<>("");
                String[] split = logs.split("\\r?\\n");
                if (split.length > 0) {
                    lastLineRef.set(split[split.length - 1].trim());
                }

                ScheduledFuture<?> task = scheduler.scheduleAtFixedRate(() -> {
                    try {
                        String recent = sshDockerExecutorService.getLogs(host, containerId, 10);
                        for (String rLine : recent.split("\\r?\\n")) {
                            String trimmed = rLine.trim();
                            if (!trimmed.isEmpty() && !trimmed.equals(lastLineRef.get())) {
                                lastLineRef.set(trimmed);
                                emitter.send(SseEmitter.event().data(trimmed));
                            }
                        }
                    } catch (Exception pollEx) {
                        log.debug("SSE log polling stopped: {}", pollEx.getMessage());
                    }
                }, 2, 2, TimeUnit.SECONDS);

                emitter.onCompletion(() -> {
                    task.cancel(true);
                    scheduler.shutdown();
                });
                emitter.onTimeout(() -> {
                    task.cancel(true);
                    scheduler.shutdown();
                });
                emitter.onError((t) -> {
                    task.cancel(true);
                    scheduler.shutdown();
                });

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

    public List<String> getLogsList(String vmId, String containerId, int tail) {
        VmHost host = vmHostService.getHostById(vmId);
        List<String> result = new ArrayList<>();

        if (sshDockerExecutorService.isSshHost(host)) {
            try {
                String rawLogs = sshDockerExecutorService.getLogs(host, containerId, tail);
                if (rawLogs != null && !rawLogs.isBlank()) {
                    for (String line : rawLogs.split("\\r?\\n")) {
                        if (!line.trim().isEmpty()) {
                            result.add(line);
                        }
                    }
                }
            } catch (Exception e) {
                log.error("Failed to fetch logs via SSH for container {}: {}", containerId, e.getMessage());
                result.add("[ERROR] Failed to fetch container logs over SSH: " + e.getMessage());
            }
            return result;
        }

        try {
            DockerClient client = dockerClientFactory.getClientForHost(host);
            List<String> logLines = new ArrayList<>();
            CountDownLatch latch = new CountDownLatch(1);

            client.logContainerCmd(containerId)
                    .withStdOut(true)
                    .withStdErr(true)
                    .withFollowStream(false)
                    .withTail(tail)
                    .withTimestamps(true)
                    .exec(new ResultCallback<Frame>() {
                        @Override
                        public void onStart(Closeable closeable) {}

                        @Override
                        public void onNext(Frame frame) {
                            String line = new String(frame.getPayload(), StandardCharsets.UTF_8).trim();
                            if (!line.isEmpty()) {
                                logLines.add(line);
                            }
                        }

                        @Override
                        public void onError(Throwable throwable) {
                            log.warn("Log fetch error for {}: {}", containerId, throwable.getMessage());
                            latch.countDown();
                        }

                        @Override
                        public void onComplete() {
                            latch.countDown();
                        }

                        @Override
                        public void close() {}
                    });

            latch.await(10L, TimeUnit.SECONDS);
            return logLines;
        } catch (Exception e) {
            log.error("Failed to fetch live logs from Docker client for {}: {}", containerId, e.getMessage());
            result.add("[ERROR] Could not fetch live container logs: " + e.getMessage());
            return result;
        }
    }

    public Map<String, Object> execCommand(String vmId, String containerId, String command) {
        VmHost host = vmHostService.getHostById(vmId);
        if (sshDockerExecutorService.isSshHost(host)) {
            return sshDockerExecutorService.execCommand(host, containerId, command);
        }

        try {
            DockerClient client = dockerClientFactory.getClientForHost(host);
            ExecCreateCmdResponse execCreate = client.execCreateCmd(containerId)
                    .withAttachStdout(true)
                    .withAttachStderr(true)
                    .withCmd("sh", "-c", command)
                    .exec();

            StringBuilder output = new StringBuilder();
            CountDownLatch latch = new CountDownLatch(1);

            client.execStartCmd(execCreate.getId())
                    .exec(new ResultCallback<Frame>() {
                        @Override
                        public void onStart(Closeable closeable) {}

                        @Override
                        public void onNext(Frame frame) {
                            output.append(new String(frame.getPayload(), StandardCharsets.UTF_8));
                        }

                        @Override
                        public void onError(Throwable throwable) {
                            output.append("\nError: ").append(throwable.getMessage());
                            latch.countDown();
                        }

                        @Override
                        public void onComplete() {
                            latch.countDown();
                        }

                        @Override
                        public void close() {}
                    });

            latch.await(30L, TimeUnit.SECONDS);

            InspectExecResponse inspect = client.inspectExecCmd(execCreate.getId()).exec();
            int exitCode = inspect.getExitCode() != null ? inspect.getExitCode() : 0;

            return Map.of("output", output.toString(), "exitCode", exitCode);
        } catch (Exception e) {
            log.error("Docker client exec failed for {}: {}", containerId, e.getMessage());
            return Map.of("output", "Exec failed: " + e.getMessage(), "exitCode", 1);
        }
    }

    public Map<String, Object> execHostCommand(String vmId, String command, boolean useSudo) {
        VmHost host = vmHostService.getHostById(vmId);
        if (sshDockerExecutorService.isSshHost(host)) {
            return sshDockerExecutorService.execHostCommand(host, command, useSudo || host.isUseSudo());
        }
        return Map.of(
                "output", "Host " + host.getName() + " (" + host.getIp() + ") does not have direct SSH terminal access configured.",
                "exitCode", 1
        );
    }

    /**
     * Fetches real-time CPU, memory, and disk metrics from the target VM.
     * - For SSH hosts: uses shell commands (top, free, df).
     * - For Docker socket hosts: uses Docker system info + container stats.
     */
    public Map<String, Object> getHostMetrics(String vmId) {
        VmHost host = vmHostService.getHostById(vmId);

        if (sshDockerExecutorService.isSshHost(host)) {
            return getMetricsViaSsh(host);
        }
        return getMetricsViaDockerSocket(host);
    }

    private Map<String, Object> getMetricsViaSsh(VmHost host) {
        Map<String, Object> result = new HashMap<>();
        result.put("vmId", host.getId());
        result.put("source", "ssh");

        try {
            // CPU usage: get idle% from top -bn1, subtract from 100
            String cpuOutput = sshDockerExecutorService.execHostCommand(host,
                    "top -bn1 | grep 'Cpu(s)' | awk '{print $8}' | tr -d '%id,'", false)
                    .get("output").toString().trim();

            double cpuIdle = 0;
            try {
                // Try to extract numeric idle value; fallback to mpstat approach
                cpuIdle = Double.parseDouble(cpuOutput.replaceAll("[^0-9.]", "").trim());
            } catch (NumberFormatException e) {
                // Fallback: use vmstat
                try {
                    String vmstatOut = sshDockerExecutorService.execHostCommand(host,
                            "vmstat 1 1 | awk 'NR==3{print $15}'", false)
                            .get("output").toString().trim();
                    cpuIdle = Double.parseDouble(vmstatOut.trim());
                } catch (Exception ignored) {}
            }
            double cpuPercent = Math.max(0, Math.min(100, 100.0 - cpuIdle));
            result.put("cpuPercent", Math.round(cpuPercent * 10.0) / 10.0);

            // Memory: use free -m
            String memOutput = sshDockerExecutorService.execHostCommand(host,
                    "free -m | awk '/^Mem:/{printf \"%s %s\", $2, $3}'", false)
                    .get("output").toString().trim();
            String[] memParts = memOutput.split("\\s+");
            if (memParts.length >= 2) {
                long totalMb = Long.parseLong(memParts[0].replaceAll("[^0-9]", "").trim());
                long usedMb  = Long.parseLong(memParts[1].replaceAll("[^0-9]", "").trim());
                double memPercent = totalMb > 0 ? (usedMb * 100.0 / totalMb) : 0;
                result.put("memTotalMb", totalMb);
                result.put("memUsedMb", usedMb);
                result.put("memPercent", Math.round(memPercent * 10.0) / 10.0);
            } else {
                result.put("memTotalMb", host.getMemoryGb() * 1024L);
                result.put("memUsedMb", 0);
                result.put("memPercent", host.getMemoryUsedPercent());
            }

            // Disk: df -h /
            String dfOutput = sshDockerExecutorService.execHostCommand(host,
                    "df / | awk 'NR==2{gsub(\"%\",\"\",$5); printf \"%s %s %s\", $2, $3, $5}'", false)
                    .get("output").toString().trim();
            String[] dfParts = dfOutput.split("\\s+");
            if (dfParts.length >= 3) {
                result.put("diskTotalMb", dfParts[0]);
                result.put("diskUsedMb", dfParts[1]);
                result.put("diskPercent", Double.parseDouble(dfParts[2].replaceAll("[^0-9.]", "")));
            } else {
                result.put("diskPercent", host.getDiskUsedPercent());
            }

            // Update stored values in DB
            host.setCpuUsagePercent(cpuPercent);
            if (result.containsKey("memPercent")) {
                host.setMemoryUsedPercent(((Number) result.get("memPercent")).doubleValue());
            }
            vmHostService.save(host);

        } catch (Exception e) {
            log.warn("Failed to fetch SSH metrics for host {}: {}", host.getIp(), e.getMessage());
            result.put("cpuPercent", host.getCpuUsagePercent());
            result.put("memPercent", host.getMemoryUsedPercent());
            result.put("diskPercent", host.getDiskUsedPercent());
            result.put("memTotalMb", host.getMemoryGb() * 1024L);
            result.put("memUsedMb", (long)(host.getMemoryGb() * 1024 * host.getMemoryUsedPercent() / 100));
            result.put("error", e.getMessage());
        }

        return result;
    }

    private Map<String, Object> getMetricsViaDockerSocket(VmHost host) {
        Map<String, Object> result = new HashMap<>();
        result.put("vmId", host.getId());
        result.put("source", "docker_socket");

        try {
            DockerClient client = dockerClientFactory.getClientForHost(host);
            Info info = client.infoCmd().exec();

            // Aggregate CPU/memory across all running containers via stats
            List<Container> running = client.listContainersCmd()
                    .withStatusFilter(Collections.singletonList("running"))
                    .exec();

            double totalCpu = 0;
            long totalMemUsed = 0;
            long totalMemLimit = 0;

            for (Container c : running) {
                try {
                    AtomicReference<Statistics> statsRef = new AtomicReference<>();
                    CountDownLatch latch = new CountDownLatch(1);

                    client.statsCmd(c.getId()).withNoStream(true)
                            .exec(new ResultCallback<Statistics>() {
                                @Override public void onStart(Closeable closeable) {}
                                @Override public void onNext(Statistics stats) {
                                    statsRef.set(stats);
                                    latch.countDown();
                                }
                                @Override public void onError(Throwable t) { latch.countDown(); }
                                @Override public void onComplete() { latch.countDown(); }
                                @Override public void close() {}
                            });

                    latch.await(5L, TimeUnit.SECONDS);
                    Statistics stats = statsRef.get();

                    if (stats != null && stats.getCpuStats() != null && stats.getPreCpuStats() != null) {
                        Long cpuDelta = stats.getCpuStats().getCpuUsage() != null && stats.getPreCpuStats().getCpuUsage() != null
                                ? stats.getCpuStats().getCpuUsage().getTotalUsage() - stats.getPreCpuStats().getCpuUsage().getTotalUsage()
                                : 0L;
                        Long sysDelta = stats.getCpuStats().getSystemCpuUsage() != null && stats.getPreCpuStats().getSystemCpuUsage() != null
                                ? stats.getCpuStats().getSystemCpuUsage() - stats.getPreCpuStats().getSystemCpuUsage()
                                : 0L;
                        int numCpus = stats.getCpuStats().getOnlineCpus() != null ? stats.getCpuStats().getOnlineCpus() : 1;
                        if (sysDelta > 0 && cpuDelta >= 0) {
                            totalCpu += (cpuDelta * 100.0 / sysDelta) * numCpus;
                        }
                        if (stats.getMemoryStats() != null) {
                            Long usage = stats.getMemoryStats().getUsage();
                            Long limit = stats.getMemoryStats().getLimit();
                            if (usage != null) totalMemUsed += usage;
                            if (limit != null && limit > 0 && limit < Long.MAX_VALUE) totalMemLimit = Math.max(totalMemLimit, limit);
                        }
                    }
                } catch (Exception ignored) {}
            }

            // Fallback: use Docker info for total memory
            long systemMemBytes = info.getMemTotal() != null ? info.getMemTotal() : (long) host.getMemoryGb() * 1024 * 1024 * 1024;
            int numCpus = info.getNCPU() != null ? info.getNCPU() : host.getCpuCores();
            double cpuPercent = Math.min(100, totalCpu);
            double memPercent = systemMemBytes > 0 ? (totalMemUsed * 100.0 / systemMemBytes) : 0;
            long memTotalMb = systemMemBytes / (1024 * 1024);
            long memUsedMb = totalMemUsed / (1024 * 1024);

            result.put("cpuPercent", Math.round(cpuPercent * 10.0) / 10.0);
            result.put("memPercent", Math.round(memPercent * 10.0) / 10.0);
            result.put("memTotalMb", memTotalMb);
            result.put("memUsedMb", memUsedMb);
            result.put("diskPercent", host.getDiskUsedPercent());
            result.put("cpuCores", numCpus);

            host.setCpuUsagePercent(cpuPercent);
            host.setMemoryUsedPercent(memPercent);
            vmHostService.save(host);

        } catch (Exception e) {
            log.warn("Failed to fetch Docker socket metrics for host {}: {}", host.getIp(), e.getMessage());
            result.put("cpuPercent", host.getCpuUsagePercent());
            result.put("memPercent", host.getMemoryUsedPercent());
            result.put("diskPercent", host.getDiskUsedPercent());
            result.put("memTotalMb", host.getMemoryGb() * 1024L);
            result.put("memUsedMb", (long)(host.getMemoryGb() * 1024 * host.getMemoryUsedPercent() / 100));
            result.put("error", e.getMessage());
        }

        return result;
    }
}
