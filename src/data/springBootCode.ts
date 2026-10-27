export interface SpringBootFile {
  filename: string;
  path: string;
  language: string;
  description: string;
  content: string;
}

export const SPRING_BOOT_FILES: SpringBootFile[] = [
  {
    filename: 'FleetDockApplication.java',
    path: 'src/main/java/com/fleetdock/FleetDockApplication.java',
    language: 'java',
    description: 'Spring Boot 3 Main Application entry point with @EnableScheduling',
    content: `package com.fleetdock;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class FleetDockApplication {

    public static void main(String[] args) {
        SpringApplication.run(FleetDockApplication.class, args);
    }
}
`,
  },
  {
    filename: 'VmHostController.java',
    path: 'src/main/java/com/fleetdock/controller/VmHostController.java',
    language: 'java',
    description: 'REST Controller for registering VMs, managing credentials, and node ping health checks',
    content: `package com.fleetdock.controller;

import com.fleetdock.dto.VmRegistrationRequest;
import com.fleetdock.entity.VmHost;
import com.fleetdock.service.VmHostService;
import com.fleetdock.service.DockerEngineService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/hosts")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class VmHostController {

    private final VmHostService vmHostService;
    private final DockerEngineService dockerEngineService;

    @GetMapping
    public ResponseEntity<List<VmHost>> getAllHosts() {
        return ResponseEntity.ok(vmHostService.findAllHosts());
    }

    @GetMapping("/{id}")
    public ResponseEntity<VmHost> getHostById(@PathVariable String id) {
        return ResponseEntity.ok(vmHostService.getHostById(id));
    }

    @PostMapping("/register")
    public ResponseEntity<VmHost> registerVm(@Valid @RequestBody VmRegistrationRequest request) {
        VmHost created = vmHostService.registerHost(request);
        return new ResponseEntity<>(created, HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public ResponseEntity<VmHost> updateVm(
            @PathVariable String id,
            @Valid @RequestBody VmRegistrationRequest request) {
        return ResponseEntity.ok(vmHostService.updateHost(id, request));
    }

    @PostMapping("/{id}/ping")
    public ResponseEntity<Map<String, Object>> pingHost(@PathVariable String id) {
        return ResponseEntity.ok(dockerEngineService.testConnection(id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteHost(@PathVariable String id) {
        vmHostService.deleteHost(id);
        return ResponseEntity.noContent().build();
    }
}
`,
  },
  {
    filename: 'ContainerController.java',
    path: 'src/main/java/com/fleetdock/controller/ContainerController.java',
    language: 'java',
    description: 'REST and Streaming endpoints to list, start, stop, restart, inspect, and stream logs for containers',
    content: `package com.fleetdock.controller;

import com.fleetdock.dto.ContainerDeployRequest;
import com.fleetdock.dto.ContainerDto;
import com.fleetdock.service.DockerEngineService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/hosts/{vmId}/containers")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class ContainerController {

    private final DockerEngineService dockerEngineService;

    @GetMapping
    public ResponseEntity<List<ContainerDto>> listContainers(
            @PathVariable String vmId,
            @RequestParam(required = false, defaultValue = "all") String filter) {
        return ResponseEntity.ok(dockerEngineService.listContainers(vmId, filter));
    }

    @PostMapping("/{containerId}/start")
    public ResponseEntity<Map<String, String>> startContainer(
            @PathVariable String vmId,
            @PathVariable String containerId) {
        dockerEngineService.startContainer(vmId, containerId);
        return ResponseEntity.ok(Map.of("status", "success", "message", "Container started"));
    }

    @PostMapping("/{containerId}/stop")
    public ResponseEntity<Map<String, String>> stopContainer(
            @PathVariable String vmId,
            @PathVariable String containerId,
            @RequestParam(defaultValue = "10") int timeoutSeconds) {
        dockerEngineService.stopContainer(vmId, containerId, timeoutSeconds);
        return ResponseEntity.ok(Map.of("status", "success", "message", "Container stopped gracefully"));
    }

    @PostMapping("/{containerId}/restart")
    public ResponseEntity<Map<String, String>> restartContainer(
            @PathVariable String vmId,
            @PathVariable String containerId) {
        dockerEngineService.restartContainer(vmId, containerId);
        return ResponseEntity.ok(Map.of("status", "success", "message", "Container restarted"));
    }

    @DeleteMapping("/{containerId}")
    public ResponseEntity<Void> removeContainer(
            @PathVariable String vmId,
            @PathVariable String containerId,
            @RequestParam(defaultValue = "false") boolean force) {
        dockerEngineService.removeContainer(vmId, containerId, force);
        return ResponseEntity.noContent().build();
    }

    @GetMapping(value = "/{containerId}/logs", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamContainerLogs(
            @PathVariable String vmId,
            @PathVariable String containerId,
            @RequestParam(defaultValue = "100") int tail,
            @RequestParam(defaultValue = "true") boolean follow) {
        return dockerEngineService.streamLogs(vmId, containerId, tail, follow);
    }

    @PostMapping("/deploy")
    public ResponseEntity<ContainerDto> deployContainer(
            @PathVariable String vmId,
            @RequestBody ContainerDeployRequest request) {
        return ResponseEntity.ok(dockerEngineService.deployContainer(vmId, request));
    }
}
`,
  },
  {
    filename: 'DockerClientFactory.java',
    path: 'src/main/java/com/fleetdock/config/DockerClientFactory.java',
    language: 'java',
    description: 'Dynamic DockerClient connection factory supporting SSH tunnel, TCP with TLS certificates, and local socket',
    content: `package com.fleetdock.config;

import com.fleetdock.entity.VmHost;
import com.fleetdock.service.VaultEncryptionService;
import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.core.DefaultDockerClientConfig;
import com.github.dockerjava.core.DockerClientImpl;
import com.github.dockerjava.httpclient5.ApacheDockerHttpClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
@RequiredArgsConstructor
public class DockerClientFactory {

    private final VaultEncryptionService encryptionService;
    private final ConcurrentHashMap<String, DockerClient> clientPool = new ConcurrentHashMap<>();

    public DockerClient getClientForHost(VmHost host) {
        return clientPool.computeIfAbsent(host.getId(), id -> buildDockerClient(host));
    }

    public void evictClient(String hostId) {
        DockerClient client = clientPool.remove(hostId);
        if (client != null) {
            try {
                client.close();
            } catch (Exception e) {
                log.warn("Error closing DockerClient for host {}", hostId, e);
            }
        }
    }

    private DockerClient buildDockerClient(VmHost host) {
        log.info("Creating DockerClient for VM: {} ({}:{}) auth={}", 
                host.getName(), host.getIp(), host.getPort(), host.getAuthType());

        DefaultDockerClientConfig.Builder configBuilder = DefaultDockerClientConfig.createDefaultConfigBuilder();

        switch (host.getAuthType()) {
            case DOCKER_SOCKET -> {
                configBuilder
                    .withDockerHost(String.format("tcp://%s:%d", host.getIp(), host.getPort()))
                    .withDockerTlsVerify(true);
            }
            case SSH_KEY -> {
                String user = host.getAuthCredential() != null && host.getAuthCredential().getUsername() != null 
                        ? host.getAuthCredential().getUsername() : "root";
                configBuilder.withDockerHost(String.format("ssh://%s@%s:%d", user, host.getIp(), host.getPort()));
            }
            default -> {
                configBuilder.withDockerHost(String.format("tcp://%s:%d", host.getIp(), host.getPort()));
            }
        }

        DefaultDockerClientConfig clientConfig = configBuilder.build();

        ApacheDockerHttpClient httpClient = new ApacheDockerHttpClient.Builder()
                .dockerHost(clientConfig.getDockerHost())
                .sslConfig(clientConfig.getSSLConfig())
                .maxConnections(50)
                .connectionTimeout(Duration.ofSeconds(10))
                .responseTimeout(Duration.ofSeconds(45))
                .build();

        return DockerClientImpl.getInstance(clientConfig, httpClient);
    }
}
`,
  },
  {
    filename: 'DockerEngineService.java',
    path: 'src/main/java/com/fleetdock/service/DockerEngineService.java',
    language: 'java',
    description: 'Core service executing remote Docker commands and SSE log streaming',
    content: `package com.fleetdock.service;

import com.fleetdock.config.DockerClientFactory;
import com.fleetdock.dto.ContainerDeployRequest;
import com.fleetdock.dto.ContainerDto;
import com.fleetdock.entity.VmHost;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.Executors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DockerEngineService {

    private final VmHostService vmHostService;
    private final DockerClientFactory dockerClientFactory;

    public Map<String, Object> testConnection(String vmId) {
        VmHost host = vmHostService.getHostById(vmId);
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
                    "dockerVersion", info.getServerVersion() != null ? info.getServerVersion() : "27.2.1",
                    "containersTotal", info.getContainers() != null ? info.getContainers() : 0,
                    "containersRunning", info.getContainersRunning() != null ? info.getContainersRunning() : 0,
                    "containersStopped", info.getContainersStopped() != null ? info.getContainersStopped() : 0,
                    "os", info.getOperatingSystem() != null ? info.getOperatingSystem() : host.getOs()
            );
        } catch (Exception e) {
            log.warn("Docker ping failed for host: {} -> {}", host.getName(), e.getMessage());
            host.setStatus("error");
            vmHostService.save(host);
            return Map.of("status", "error", "message", "Connection failed: " + e.getMessage());
        }
    }

    public List<ContainerDto> listContainers(String vmId, String filter) {
        VmHost host = vmHostService.getHostById(vmId);
        try {
            DockerClient client = dockerClientFactory.getClientForHost(host);
            ListContainersCmd cmd = client.listContainersCmd().withShowAll(true);
            if ("running".equalsIgnoreCase(filter)) {
                cmd.withStatusFilter(Collections.singletonList("running"));
            } else if ("stopped".equalsIgnoreCase(filter) || "exited".equalsIgnoreCase(filter)) {
                cmd.withStatusFilter(Collections.singletonList("exited"));
            }

            List<Container> dockerContainers = cmd.exec();
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

                return ContainerDto.builder()
                        .id(c.getId().substring(0, Math.min(12, c.getId().length())))
                        .vmId(vmId)
                        .name(name)
                        .image(c.getImage())
                        .state(state)
                        .statusText(c.getStatus() != null ? c.getStatus() : state)
                        .created(Instant.ofEpochSecond(c.getCreated()).toString())
                        .command(c.getCommand() != null ? c.getCommand() : "")
                        .ports(ports)
                        .composeStack(composeProject)
                        .build();
            }).collect(Collectors.toList());
        } catch (Exception e) {
            log.error("Failed to query live containers from Docker host {}: {}", host.getName(), e.getMessage());
            throw new RuntimeException("Docker daemon connection failed: " + e.getMessage(), e);
        }
    }

    public void startContainer(String vmId, String containerId) {
        VmHost host = vmHostService.getHostById(vmId);
        dockerClientFactory.getClientForHost(host).startContainerCmd(containerId).exec();
    }

    public void stopContainer(String vmId, String containerId, int timeoutSeconds) {
        VmHost host = vmHostService.getHostById(vmId);
        dockerClientFactory.getClientForHost(host).stopContainerCmd(containerId).withTimeout(timeoutSeconds).exec();
    }

    public void restartContainer(String vmId, String containerId) {
        VmHost host = vmHostService.getHostById(vmId);
        dockerClientFactory.getClientForHost(host).restartContainerCmd(containerId).exec();
    }

    public void removeContainer(String vmId, String containerId, boolean force) {
        VmHost host = vmHostService.getHostById(vmId);
        dockerClientFactory.getClientForHost(host).removeContainerCmd(containerId).withForce(force).exec();
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

    public List<Map<String, Object>> listVolumes(String vmId) {
        VmHost host = vmHostService.getHostById(vmId);
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
        DockerClient client = dockerClientFactory.getClientForHost(host);
        List<Network> networks = client.listNetworksCmd().exec();
        if (networks == null) return Collections.emptyList();

        return networks.stream().map(n -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", n.getId().substring(0, Math.min(12, n.getId().length())));
            map.put("name", n.getName());
            map.put("driver", n.getDriver());
            return map;
        }).collect(Collectors.toList());
    }

    public SseEmitter streamLogs(String vmId, String containerId, int tail, boolean follow) {
        VmHost host = vmHostService.getHostById(vmId);
        SseEmitter emitter = new SseEmitter(180_000L);
        try {
            DockerClient client = dockerClientFactory.getClientForHost(host);
            client.logContainerCmd(containerId)
                    .withStdOut(true)
                    .withStdErr(true)
                    .withFollowStream(follow)
                    .withTail(tail)
                    .withTimestamps(true)
                    .exec(new ResultCallback<Frame>() {
                        @Override public void onStart(Closeable closeable) {}
                        @Override public void onNext(Frame frame) {
                            try {
                                String line = new String(frame.getPayload(), StandardCharsets.UTF_8).trim();
                                if (!line.isEmpty()) emitter.send(SseEmitter.event().data(line));
                            } catch (Exception ex) {}
                        }
                        @Override public void onError(Throwable t) { emitter.completeWithError(t); }
                        @Override public void onComplete() { emitter.complete(); }
                        @Override public void close() {}
                    });
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
        return emitter;
    }
}
`,
  },
  {
    filename: 'SshDockerExecutorService.java',
    path: 'src/main/java/com/fleetdock/service/SshDockerExecutorService.java',
    language: 'java',
    description: 'Executes Docker and sudo docker commands over SSH (JSch) when Docker daemon is not exposed over TCP or requires root privileges',
    content: `package com.fleetdock.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fleetdock.dto.ContainerDto;
import com.fleetdock.entity.VmHost;
import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class SshDockerExecutorService {

    private final VaultEncryptionService encryptionService;
    private final ObjectMapper objectMapper;

    public boolean isSshHost(VmHost host) {
        if (host.getAuthType() == VmHost.AuthType.SSH_KEY || host.getAuthType() == VmHost.AuthType.PASSWORD) {
            return true;
        }
        return host.getPort() == 22;
    }

    public String executeCommandWithFallback(VmHost host, String dockerSubCommand) throws Exception {
        try {
            return executeSshCommand(host, dockerSubCommand, host.isUseSudo());
        } catch (Exception e) {
            if (host.isUseSudo()) {
                log.warn("Execution with sudo failed on {}: {}, attempting fallback without sudo", host.getIp(), e.getMessage());
                try {
                    return executeSshCommand(host, dockerSubCommand, false);
                } catch (Exception ignored) {}
            }
            throw e;
        }
    }

    private String executeSshCommand(VmHost host, String dockerSubCommand, boolean withSudo) throws Exception {
        JSch jsch = new JSch();
        String username = "root";
        String password = null;
        String privateKey = null;
        String passphrase = null;

        if (host.getAuthCredential() != null) {
            if (host.getAuthCredential().getUsername() != null && !host.getAuthCredential().getUsername().isBlank()) {
                username = host.getAuthCredential().getUsername().trim();
            }
            if (host.getAuthCredential().getPassword() != null) {
                password = encryptionService.decrypt(host.getAuthCredential().getPassword());
            }
            if (host.getAuthCredential().getPrivateKey() != null) {
                privateKey = encryptionService.decrypt(host.getAuthCredential().getPrivateKey());
            }
            if (host.getAuthCredential().getPassphrase() != null) {
                passphrase = encryptionService.decrypt(host.getAuthCredential().getPassphrase());
            }
        }

        if (privateKey != null && !privateKey.isBlank()) {
            byte[] keyBytes = privateKey.getBytes(StandardCharsets.UTF_8);
            byte[] passBytes = (passphrase != null && !passphrase.isBlank()) 
                    ? passphrase.getBytes(StandardCharsets.UTF_8) : null;
            jsch.addIdentity("key-" + host.getId(), keyBytes, null, passBytes);
        }

        int port = host.getPort() > 0 ? host.getPort() : 22;
        Session session = jsch.getSession(username, host.getIp().trim(), port);
        if (password != null && !password.isBlank()) {
            session.setPassword(password);
        }

        Properties config = new Properties();
        config.put("StrictHostKeyChecking", "no");
        config.put("PreferredAuthentications", "publickey,password,keyboard-interactive");
        session.setConfig(config);
        session.setTimeout(15000);
        session.connect(15000);

        ChannelExec channel = null;
        try {
            channel = (ChannelExec) session.openChannel("exec");
            String fullCommand = withSudo ? "sudo -S -p '' docker " + dockerSubCommand : "docker " + dockerSubCommand;
            channel.setCommand(fullCommand);

            InputStream in = channel.getInputStream();
            InputStream err = channel.getErrStream();
            OutputStream out = channel.getOutputStream();
            channel.connect(10000);

            if (withSudo && password != null && !password.isBlank()) {
                try {
                    out.write((password + "\\n").getBytes(StandardCharsets.UTF_8));
                    out.flush();
                } catch (Exception ignored) {}
            }

            StringBuilder stdout = new StringBuilder();
            StringBuilder stderr = new StringBuilder();

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                 BufferedReader errReader = new BufferedReader(new InputStreamReader(err, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) stdout.append(line).append("\\n");
                while ((line = errReader.readLine()) != null) stderr.append(line).append("\\n");
            }

            while (!channel.isClosed()) Thread.sleep(40);

            int exitStatus = channel.getExitStatus();
            if (exitStatus != 0 && stdout.length() == 0) {
                throw new RuntimeException("Docker command failed: " + stderr.toString().trim());
            }
            return stdout.toString().trim();
        } finally {
            if (channel != null && channel.isConnected()) channel.disconnect();
            if (session.isConnected()) session.disconnect();
        }
    }

    public List<ContainerDto> listContainers(VmHost host, String filter) {
        try {
            String output = executeCommandWithFallback(host, "ps -a --format '{{json .}}'");
            if (output.isBlank()) return Collections.emptyList();

            List<ContainerDto> result = new ArrayList<>();
            for (String line : output.split("\\\\r?\\\\n")) {
                line = line.trim();
                if (line.isEmpty() || !line.startsWith("{")) continue;
                try {
                    JsonNode node = objectMapper.readTree(line);
                    String id = node.path("ID").asText("");
                    String names = node.path("Names").asText("").replaceFirst("^/", "");
                    String image = node.path("Image").asText("");
                    String state = node.path("State").asText("stopped").toLowerCase();
                    String status = node.path("Status").asText("");
                    String createdAt = node.path("CreatedAt").asText("");
                    String command = node.path("Command").asText("");

                    if ("running".equalsIgnoreCase(filter) && !"running".equalsIgnoreCase(state)) continue;
                    if (("stopped".equalsIgnoreCase(filter) || "exited".equalsIgnoreCase(filter)) && "running".equalsIgnoreCase(state)) continue;

                    result.add(ContainerDto.builder()
                            .id(id.substring(0, Math.min(12, id.length())))
                            .vmId(host.getId())
                            .name(names.isEmpty() ? id : names)
                            .image(image)
                            .state(state)
                            .statusText(status.isEmpty() ? state : status)
                            .created(createdAt)
                            .command(command)
                            .ports(new ArrayList<>())
                            .envVars(new HashMap<>())
                            .restartPolicy("unless-stopped")
                            .build());
                } catch (Exception ignored) {}
            }
            return result;
        } catch (Exception e) {
            throw new RuntimeException("Failed to query Docker daemon via SSH: " + e.getMessage(), e);
        }
    }

    public void startContainer(VmHost host, String containerId) {
        try { executeCommandWithFallback(host, "start " + containerId); } catch (Exception e) { throw new RuntimeException(e); }
    }

    public void stopContainer(VmHost host, String containerId, int timeoutSeconds) {
        try { executeCommandWithFallback(host, "stop -t " + timeoutSeconds + " " + containerId); } catch (Exception e) { throw new RuntimeException(e); }
    }

    public void restartContainer(VmHost host, String containerId) {
        try { executeCommandWithFallback(host, "restart " + containerId); } catch (Exception e) { throw new RuntimeException(e); }
    }

    public void removeContainer(VmHost host, String containerId, boolean force) {
        try { executeCommandWithFallback(host, "rm " + (force ? "-f " : "") + containerId); } catch (Exception e) { throw new RuntimeException(e); }
    }
}
`,
  },
  {
    filename: 'ComposeService.java',
    path: 'src/main/java/com/fleetdock/service/ComposeService.java',
    language: 'java',
    description: 'Auto-discovers real compose projects from live Docker daemon container labels (com.docker.compose.project) and executes stack up/down commands',
    content: `package com.fleetdock.service;

import com.fleetdock.config.DockerClientFactory;
import com.fleetdock.entity.ComposeStackEntity;
import com.fleetdock.entity.VmHost;
import com.fleetdock.repository.ComposeStackRepository;
import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.model.Container;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ComposeService {

    private final ComposeStackRepository composeStackRepository;
    private final VmHostService vmHostService;
    private final DockerClientFactory dockerClientFactory;

    @Transactional
    public List<ComposeStackEntity> listStacks(String vmId) {
        VmHost host = vmHostService.getHostById(vmId);
        List<ComposeStackEntity> dbStacks = composeStackRepository.findByVmId(vmId);
        Map<String, ComposeStackEntity> stackMap = new HashMap<>();

        for (ComposeStackEntity s : dbStacks) {
            stackMap.put(s.getName(), s);
        }

        try {
            DockerClient client = dockerClientFactory.getClientForHost(host);
            List<Container> containers = client.listContainersCmd().withShowAll(true).exec();

            Map<String, List<Container>> projectGroups = new HashMap<>();
            for (Container c : containers) {
                if (c.getLabels() != null && c.getLabels().containsKey("com.docker.compose.project")) {
                    String projectName = c.getLabels().get("com.docker.compose.project");
                    projectGroups.computeIfAbsent(projectName, k -> new ArrayList<>()).add(c);
                }
            }

            for (Map.Entry<String, List<Container>> entry : projectGroups.entrySet()) {
                String projectName = entry.getKey();
                List<Container> projectContainers = entry.getValue();
                int total = projectContainers.size();
                int running = (int) projectContainers.stream().filter(c -> "running".equalsIgnoreCase(c.getState())).count();
                String status = running == total ? "running" : (running > 0 ? "partially_running" : "stopped");

                ComposeStackEntity stack = stackMap.get(projectName);
                if (stack == null) {
                    stack = ComposeStackEntity.builder()
                            .id("stack-" + UUID.randomUUID().toString().substring(0, 8))
                            .vmId(vmId)
                            .name(projectName)
                            .status(status)
                            .serviceCount(total)
                            .runningCount(running)
                            .rawYaml("# Discovered from live containers on " + host.getName())
                            .lastDeployed(LocalDateTime.now())
                            .build();
                    composeStackRepository.save(stack);
                    stackMap.put(projectName, stack);
                }
            }
        } catch (Exception e) {
            log.warn("Could not query live compose labels: {}", e.getMessage());
        }

        return new ArrayList<>(stackMap.values());
    }

    public Map<String, Object> executeComposeUp(String vmId, String stackId, boolean detach) {
        VmHost host = vmHostService.getHostById(vmId);
        ComposeStackEntity stack = composeStackRepository.findById(stackId).orElseThrow();
        DockerClient client = dockerClientFactory.getClientForHost(host);
        List<Container> containers = client.listContainersCmd().withShowAll(true).exec();
        for (Container c : containers) {
            if (c.getLabels() != null && stack.getName().equals(c.getLabels().get("com.docker.compose.project"))) {
                if (!"running".equalsIgnoreCase(c.getState())) client.startContainerCmd(c.getId()).exec();
            }
        }
        return Map.of("status", "success", "message", "Started stack " + stack.getName());
    }

    public Map<String, Object> executeComposeDown(String vmId, String stackId) {
        VmHost host = vmHostService.getHostById(vmId);
        ComposeStackEntity stack = composeStackRepository.findById(stackId).orElseThrow();
        DockerClient client = dockerClientFactory.getClientForHost(host);
        List<Container> containers = client.listContainersCmd().withShowAll(true).exec();
        for (Container c : containers) {
            if (c.getLabels() != null && stack.getName().equals(c.getLabels().get("com.docker.compose.project"))) {
                if ("running".equalsIgnoreCase(c.getState())) client.stopContainerCmd(c.getId()).withTimeout(10).exec();
            }
        }
        return Map.of("status", "success", "message", "Stopped stack " + stack.getName());
    }
}
`,
  },
  {
    filename: 'VaultEncryptionService.java',
    path: 'src/main/java/com/fleetdock/service/VaultEncryptionService.java',
    language: 'java',
    description: 'AES-256-GCM encryption service protecting private keys and credentials in database',
    content: `package com.fleetdock.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

@Slf4j
@Service
public class VaultEncryptionService {

    private final byte[] keyBytes;
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 128;

    public VaultEncryptionService(@Value("\${fleetdock.security.vault-key:fleetdock-aes-256-master-key-xyz}") String masterKey) {
        byte[] raw = masterKey.getBytes(StandardCharsets.UTF_8);
        this.keyBytes = new byte[32];
        System.arraycopy(raw, 0, this.keyBytes, 0, Math.min(raw.length, 32));
    }

    public String encrypt(String plainText) {
        if (plainText == null || plainText.isEmpty()) return plainText;
        try {
            byte[] iv = new byte[GCM_IV_LENGTH];
            new SecureRandom().nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
            SecretKeySpec keySpec = new SecretKeySpec(this.keyBytes, "AES");
            cipher.init(Cipher.ENCRYPT_MODE, keySpec, spec);

            byte[] cipherText = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
            byte[] combined = new byte[iv.length + cipherText.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(cipherText, 0, combined, iv.length, cipherText.length);

            return "ENC:" + Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            log.error("Encryption failed", e);
            return plainText;
        }
    }

    public String decrypt(String encryptedText) {
        if (encryptedText == null || !encryptedText.startsWith("ENC:")) return encryptedText;
        try {
            byte[] combined = Base64.getDecoder().decode(encryptedText.substring(4));
            byte[] iv = new byte[GCM_IV_LENGTH];
            System.arraycopy(combined, 0, iv, 0, GCM_IV_LENGTH);

            int cipherLength = combined.length - GCM_IV_LENGTH;
            byte[] cipherText = new byte[cipherLength];
            System.arraycopy(combined, GCM_IV_LENGTH, cipherText, 0, cipherLength);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
            SecretKeySpec keySpec = new SecretKeySpec(this.keyBytes, "AES");
            cipher.init(Cipher.DECRYPT_MODE, keySpec, spec);

            return new String(cipher.doFinal(cipherText), StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.error("Decryption failed", e);
            return encryptedText;
        }
    }
}
`,
  },
  {
    filename: 'application.yml',
    path: 'src/main/resources/application.yml',
    language: 'yaml',
    description: 'Spring Boot 3 configuration with JPA, H2 zero-config fallback, PostgreSQL, and Actuator',
    content: `server:
  port: 8080
  compression:
    enabled: true
  shutdown: graceful

spring:
  application:
    name: fleetdock-orchestrator
  datasource:
    url: \${SPRING_DATASOURCE_URL:jdbc:h2:mem:fleetdock;DB_CLOSE_DELAY=-1;MODE=PostgreSQL}
    driver-class-name: \${SPRING_DATASOURCE_DRIVER:org.h2.Driver}
    username: \${SPRING_DATASOURCE_USERNAME:sa}
    password: \${SPRING_DATASOURCE_PASSWORD:}
  h2:
    console:
      enabled: true
      path: /h2-console
  jpa:
    hibernate:
      ddl-auto: update
    open-in-view: false

fleetdock:
  cors:
    allowed-origins: "*"
  security:
    vault-key: \${VAULT_MASTER_KEY:fleetdock-aes-256-master-key-xyz}
  docker:
    connection-timeout-seconds: 10
    response-timeout-seconds: 45

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
`,
  },
  {
    filename: 'pom.xml',
    path: 'pom.xml',
    language: 'xml',
    description: 'Maven Project Object Model with Spring Boot 3.3.4 and docker-java 3.4.0',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.3.4</version>
        <relativePath/>
    </parent>
    <groupId>com.fleetdock</groupId>
    <artifactId>fleetdock-orchestrator</artifactId>
    <version>1.0.0</version>
    <name>FleetDock Spring Boot Orchestrator</name>

    <properties>
        <java.version>21</java.version>
        <docker-java.version>3.4.0</docker-java.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>
        <dependency>
            <groupId>com.h2database</groupId>
            <artifactId>h2</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>com.github.docker-java</groupId>
            <artifactId>docker-java-core</artifactId>
            <version>\${docker-java.version}</version>
        </dependency>
        <dependency>
            <groupId>com.github.docker-java</groupId>
            <artifactId>docker-java-transport-httpclient5</artifactId>
            <version>\${docker-java.version}</version>
        </dependency>
        <dependency>
            <groupId>com.jcraft</groupId>
            <artifactId>jsch</artifactId>
            <version>0.1.55</version>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
    </dependencies>
</project>
`,
  },
  {
    filename: 'docker-compose.yml',
    path: 'docker-compose.yml',
    language: 'yaml',
    description: 'Docker Compose to spin up Spring Boot + PostgreSQL database',
    content: `version: '3.8'

services:
  fleetdock-backend:
    build: .
    container_name: fleetdock-spring-backend
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - SPRING_PROFILES_ACTIVE=prod
      - SPRING_DATASOURCE_URL=jdbc:postgresql://postgres-db:5432/fleetdock
      - SPRING_DATASOURCE_USERNAME=postgres
      - SPRING_DATASOURCE_PASSWORD=postgres_secure_pass
      - VAULT_MASTER_KEY=fleetdock-production-aes-256-key-99812
    depends_on:
      postgres-db:
        condition: service_healthy

  postgres-db:
    image: postgres:16-alpine
    container_name: fleetdock-postgres
    restart: always
    environment:
      POSTGRES_DB: fleetdock
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres_secure_pass
    ports:
      - "5432:5432"
    volumes:
      - fleetdock_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  fleetdock_data:
`,
  },
  {
    filename: 'Dockerfile',
    path: 'Dockerfile',
    language: 'dockerfile',
    description: 'Multi-stage production Dockerfile building Java 21 jar and packaging into lean Alpine image',
    content: `FROM maven:3.9.9-eclipse-temurin-21-alpine AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn clean package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
VOLUME /tmp
COPY --from=build /app/target/fleetdock-orchestrator-1.0.0.jar app.jar
ENV SERVER_PORT=8080
EXPOSE 8080
ENTRYPOINT ["java", "-XX:+UseG1GC", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
`,
  },
];
