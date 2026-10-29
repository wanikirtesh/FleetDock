package com.fleetdock.service;

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

    /**
     * Checks if the host should be accessed via SSH (port 22 or SSH/Password auth)
     */
    public boolean isSshHost(VmHost host) {
        if (host.getAuthType() == VmHost.AuthType.SSH_KEY || host.getAuthType() == VmHost.AuthType.PASSWORD) {
            return true;
        }
        return host.getPort() == 22;
    }

    /**
     * Executes a raw docker subcommand over SSH, applying 'sudo' if configured
     */
    public String executeCommandWithFallback(VmHost host, String dockerSubCommand) throws Exception {
        try {
            return executeSshCommand(host, dockerSubCommand, host.isUseSudo());
        } catch (Exception e) {
            // If sudo failed with password required or syntax, attempt fallback without sudo or log
            if (host.isUseSudo()) {
                log.warn("Execution with sudo failed on {}: {}, attempting fallback without sudo", host.getIp(), e.getMessage());
                try {
                    return executeSshCommand(host, dockerSubCommand, false);
                } catch (Exception ignored) {}
            }
            throw e;
        }
    }

    public Map<String, Object> execHostCommand(VmHost host, String shellCommand, boolean withSudo) {
        long start = System.currentTimeMillis();
        try {
            String fullCommand = withSudo ? "sudo -S -p '' " + shellCommand : shellCommand;
            String output = executeRawCommandOnHost(host, fullCommand, withSudo);
            long latency = Math.max(1, System.currentTimeMillis() - start);
            return Map.of(
                    "output", output.isEmpty() ? "[Process completed with exit code 0]" : output,
                    "exitCode", 0,
                    "latencyMs", latency
            );
        } catch (Exception e) {
            long latency = Math.max(1, System.currentTimeMillis() - start);
            log.error("SSH Host exec failed on {} for command '{}': {}", host.getIp(), shellCommand, e.getMessage());
            return Map.of(
                    "output", "Execution error: " + e.getMessage(),
                    "exitCode", 1,
                    "latencyMs", latency
            );
        }
    }

    /** Runs a command as one turn of a persistent-feeling shell session (keeps cwd, real exit code). */
    public Map<String, Object> execHostShellCommand(VmHost host, String shellCommand, boolean withSudo, String cwd) {
        String wrapped = "sh -c " + ShellSessionWrapper.quote(ShellSessionWrapper.wrap(shellCommand, cwd));
        Map<String, Object> raw = execHostCommand(host, wrapped, withSudo);
        Map<String, Object> parsed = ShellSessionWrapper.parse(String.valueOf(raw.get("output")), cwd);
        if (!String.valueOf(raw.get("output")).contains("__FD_CWD__")) {
            return raw;
        }
        parsed.put("latencyMs", raw.getOrDefault("latencyMs", 0));
        return parsed;
    }

    private String executeSshCommand(VmHost host, String dockerSubCommand, boolean withSudo) throws Exception {
        String fullCommand = withSudo ? "sudo -S -p '' docker " + dockerSubCommand : "docker " + dockerSubCommand;
        return executeRawCommandOnHost(host, fullCommand, withSudo);
    }

    private String executeRawCommandOnHost(VmHost host, String fullCommand, boolean withSudo) throws Exception {
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

        if (privateKey != null && (privateKey.isBlank() || privateKey.contains("ENCRYPTED_IN_SPRING_BOOT_VAULT")
                || privateKey.contains("CONFIGURED_IN_VAULT"))) {
            privateKey = null; // placeholder saved by older UI versions, not a real key
        }
        if (privateKey != null && !privateKey.isBlank()) {
            String cleanedKey = privateKey.trim();
            if (cleanedKey.contains("\\n")) {
                cleanedKey = cleanedKey.replace("\\r\\n", "\n").replace("\\n", "\n");
            }
            if (!cleanedKey.endsWith("\n")) {
                cleanedKey += "\n";
            }

            try {
                java.io.File keyFile = new java.io.File(cleanedKey.trim());
                if (keyFile.exists() && keyFile.isFile()) {
                    if (passphrase != null && !passphrase.isBlank()) {
                        jsch.addIdentity(keyFile.getAbsolutePath(), passphrase.trim());
                    } else {
                        jsch.addIdentity(keyFile.getAbsolutePath());
                    }
                    log.info("Loaded SSH identity from local file: {}", keyFile.getAbsolutePath());
                } else {
                    byte[] keyBytes = cleanedKey.getBytes(StandardCharsets.UTF_8);
                    byte[] passBytes = (passphrase != null && !passphrase.isBlank()) 
                            ? passphrase.trim().getBytes(StandardCharsets.UTF_8) : null;
                    jsch.addIdentity("key-" + host.getId(), keyBytes, null, passBytes);
                    log.info("Loaded in-memory SSH private key for host: {}", host.getIp());
                }
            } catch (Exception keyEx) {
                log.warn("Could not parse private key for host {}: {}", host.getIp(), keyEx.getMessage());
                if (password != null && !password.isBlank()) {
                    log.info("Falling back to password authentication for host {}", host.getIp());
                } else {
                    throw new RuntimeException("Invalid SSH Private Key for " + host.getIp() + ": " + keyEx.getMessage()
                            + ". Ensure key is in OpenSSH or PEM format, or configure password authentication.", keyEx);
                }
            }
        }

        int port = host.getPort() > 0 ? host.getPort() : 22;
        Session session = jsch.getSession(username, host.getIp().trim(), port);

        if (password != null && !password.isBlank()) {
            session.setPassword(password);
        }

        Properties config = new Properties();
        config.put("StrictHostKeyChecking", "no");
        config.put("PreferredAuthentications", "publickey,password,keyboard-interactive");
        config.put("server_host_key", "ssh-ed25519,ecdsa-sha2-nistp256,ecdsa-sha2-nistp384,ecdsa-sha2-nistp521,rsa-sha2-512,rsa-sha2-256,ssh-rsa");
        config.put("PubkeyAcceptedAlgorithms", "ssh-ed25519,ecdsa-sha2-nistp256,ecdsa-sha2-nistp384,ecdsa-sha2-nistp521,rsa-sha2-512,rsa-sha2-256,ssh-rsa");
        session.setConfig(config);
        session.setTimeout(15000);
        session.connect(15000);

        ChannelExec channel = null;
        try {
            channel = (ChannelExec) session.openChannel("exec");

            log.info("Executing over SSH on {}:{}: {}", host.getIp(), port, fullCommand);
            channel.setCommand(fullCommand);

            InputStream in = channel.getInputStream();
            InputStream err = channel.getErrStream();
            OutputStream out = channel.getOutputStream();

            channel.connect(10000);

            // Feed password to sudo standard input in case sudo prompts
            if (withSudo && password != null && !password.isBlank()) {
                try {
                    out.write((password + "\n").getBytes(StandardCharsets.UTF_8));
                    out.flush();
                } catch (Exception ignored) {}
            }

            StringBuilder stdout = new StringBuilder();
            StringBuilder stderr = new StringBuilder();

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                 BufferedReader errReader = new BufferedReader(new InputStreamReader(err, StandardCharsets.UTF_8))) {
                
                String line;
                while ((line = reader.readLine()) != null) {
                    stdout.append(line).append("\n");
                }
                while ((line = errReader.readLine()) != null) {
                    stderr.append(line).append("\n");
                }
            }

            while (!channel.isClosed()) {
                Thread.sleep(40);
            }

            int exitStatus = channel.getExitStatus();
            String combined = stdout.length() > 0 
                    ? (stderr.length() > 0 ? stdout.toString() + "\n" + stderr.toString() : stdout.toString())
                    : stderr.toString();

            if (exitStatus != 0 && combined.trim().isEmpty()) {
                String errorMsg = stderr.toString().trim();
                if (errorMsg.isEmpty()) errorMsg = "Exit code " + exitStatus;
                throw new RuntimeException("Docker command failed over SSH (" + fullCommand + "): " + errorMsg);
            }

            return combined.trim();

        } finally {
            if (channel != null && channel.isConnected()) {
                channel.disconnect();
            }
            if (session.isConnected()) {
                session.disconnect();
            }
        }
    }

    /**
     * Lists live containers using 'docker ps -a --format {{json .}}'
     */
    public List<ContainerDto> listContainers(VmHost host, String filter) {
        try {
            String output = executeCommandWithFallback(host, "ps -a --format '{{json .}}'");
            if (output.isBlank()) {
                return Collections.emptyList();
            }

            List<ContainerDto> result = new ArrayList<>();
            String[] lines = output.split("\\r?\\n");

            for (String line : lines) {
                line = line.trim();
                if (line.isEmpty() || !line.startsWith("{")) continue;

                try {
                    JsonNode node = objectMapper.readTree(line);
                    String id = node.path("ID").asText("");
                    String names = node.path("Names").asText("");
                    String image = node.path("Image").asText("");
                    String state = node.path("State").asText("stopped").toLowerCase();
                    String status = node.path("Status").asText("");
                    String createdAt = node.path("CreatedAt").asText("");
                    String command = node.path("Command").asText("");
                    String portsStr = node.path("Ports").asText("");
                    String labelsStr = node.path("Labels").asText("");

                    if ("running".equalsIgnoreCase(filter) && !"running".equalsIgnoreCase(state)) {
                        continue;
                    }
                    if (("stopped".equalsIgnoreCase(filter) || "exited".equalsIgnoreCase(filter)) && "running".equalsIgnoreCase(state)) {
                        continue;
                    }

                    String name = names.replaceFirst("^/", "");
                    if (name.isEmpty()) name = id;

                    List<ContainerDto.PortMapping> ports = parsePorts(portsStr);

                    String composeProject = null;
                    if (!labelsStr.isEmpty()) {
                        for (String part : labelsStr.split(",")) {
                            if (part.startsWith("com.docker.compose.project=")) {
                                composeProject = part.substring("com.docker.compose.project=".length());
                                break;
                            }
                        }
                    }

                    result.add(ContainerDto.builder()
                            .id(id.substring(0, Math.min(12, id.length())))
                            .vmId(host.getId())
                            .name(name)
                            .image(image)
                            .state(state)
                            .statusText(status.isEmpty() ? state : status)
                            .created(createdAt)
                            .command(command)
                            .cpuPercent(0.0)
                            .memUsageMb(0)
                            .memLimitMb(0)
                            .ports(ports)
                            .envVars(new HashMap<>())
                            .composeStack(composeProject)
                            .restartPolicy("unless-stopped")
                            .build());

                } catch (Exception ex) {
                    log.warn("Failed to parse container json line from {}: {}", host.getIp(), line, ex);
                }
            }

            log.info("Fetched {} live containers over SSH (sudo={}) from {} ({})", 
                    result.size(), host.isUseSudo(), host.getName(), host.getIp());
            return result;

        } catch (Exception e) {
            log.error("SSH Docker listContainers failed on {}: {}", host.getIp(), e.getMessage());
            throw new RuntimeException("Failed to query Docker daemon via SSH on " + host.getIp() + ":" + host.getPort() + " -> " + e.getMessage(), e);
        }
    }

    /**
     * Executes 'docker info' over SSH to verify connection and update host metadata
     */
    public Map<String, Object> testConnection(VmHost host, VmHostService vmHostService) {
        long start = System.currentTimeMillis();
        try {
            String infoJson = executeCommandWithFallback(host, "info --format '{{json .}}'");
            long latency = Math.max(1, System.currentTimeMillis() - start);

            String dockerVersion = "Docker (SSH/sudo)";
            int nCpu = host.getCpuCores();
            int memGb = host.getMemoryGb();
            int containers = 0;
            int running = 0;
            int stopped = 0;
            String os = host.getOs();
            String arch = host.getArch();

            try {
                JsonNode node = objectMapper.readTree(infoJson);
                if (node.hasNonNull("ServerVersion")) dockerVersion = "Docker " + node.get("ServerVersion").asText();
                if (node.hasNonNull("NCPU")) nCpu = node.get("NCPU").asInt();
                if (node.hasNonNull("MemTotal")) memGb = (int) (node.get("MemTotal").asLong() / (1024L * 1024L * 1024L));
                if (node.hasNonNull("OperatingSystem")) os = node.get("OperatingSystem").asText();
                if (node.hasNonNull("Architecture")) arch = node.get("Architecture").asText();
                if (node.hasNonNull("Containers")) containers = node.get("Containers").asInt();
                if (node.hasNonNull("ContainersRunning")) running = node.get("ContainersRunning").asInt();
                if (node.hasNonNull("ContainersStopped")) stopped = node.get("ContainersStopped").asInt();
            } catch (Exception parseEx) {
                try {
                    String ver = executeCommandWithFallback(host, "--version");
                    if (!ver.isBlank()) dockerVersion = ver.trim();
                } catch (Exception ignored) {}
            }

            host.setStatus("online");
            host.setPingMs((int) latency);
            host.setDockerVersion(dockerVersion);
            host.setCpuCores(nCpu);
            if (memGb > 0) host.setMemoryGb(memGb);
            host.setOs(os);
            host.setArch(arch);
            vmHostService.save(host);

            return Map.of(
                    "status", "online",
                    "latencyMs", latency,
                    "dockerVersion", dockerVersion,
                    "containersTotal", containers,
                    "containersRunning", running,
                    "containersStopped", stopped,
                    "os", os,
                    "sudo", host.isUseSudo(),
                    "message", "SSH Handshake & " + (host.isUseSudo() ? "sudo docker" : "docker") + " succeeded on " + host.getIp() + ":" + host.getPort()
            );

        } catch (Exception e) {
            log.warn("SSH Docker test failed for host {} ({}) -> {}", host.getName(), host.getIp(), e.getMessage());
            host.setStatus("error");
            vmHostService.save(host);
            return Map.of(
                    "status", "error",
                    "sudo", host.isUseSudo(),
                    "message", "SSH Docker connection failed on " + host.getIp() + ":" + host.getPort() + " -> " + e.getMessage()
            );
        }
    }

    public void startContainer(VmHost host, String containerId) {
        try {
            executeCommandWithFallback(host, "start " + containerId);
        } catch (Exception e) {
            throw new RuntimeException("Failed to start container " + containerId + " via SSH: " + e.getMessage(), e);
        }
    }

    public void stopContainer(VmHost host, String containerId, int timeoutSeconds) {
        try {
            executeCommandWithFallback(host, "stop -t " + timeoutSeconds + " " + containerId);
        } catch (Exception e) {
            throw new RuntimeException("Failed to stop container " + containerId + " via SSH: " + e.getMessage(), e);
        }
    }

    public void restartContainer(VmHost host, String containerId) {
        try {
            executeCommandWithFallback(host, "restart " + containerId);
        } catch (Exception e) {
            throw new RuntimeException("Failed to restart container " + containerId + " via SSH: " + e.getMessage(), e);
        }
    }

    public void removeContainer(VmHost host, String containerId, boolean force) {
        try {
            executeCommandWithFallback(host, "rm " + (force ? "-f " : "") + containerId);
        } catch (Exception e) {
            throw new RuntimeException("Failed to remove container " + containerId + " via SSH: " + e.getMessage(), e);
        }
    }

    public List<Map<String, Object>> listVolumes(VmHost host) {
        try {
            String output = executeCommandWithFallback(host, "volume ls --format '{{json .}}'");
            if (output.isBlank()) return Collections.emptyList();

            List<Map<String, Object>> result = new ArrayList<>();
            for (String line : output.split("\\r?\\n")) {
                line = line.trim();
                if (line.isEmpty() || !line.startsWith("{")) continue;
                try {
                    JsonNode node = objectMapper.readTree(line);
                    Map<String, Object> map = new HashMap<>();
                    map.put("name", node.path("Name").asText(""));
                    map.put("driver", node.path("Driver").asText("local"));
                    map.put("mountpoint", node.path("Mountpoint").asText(""));
                    map.put("scope", node.path("Scope").asText("local"));
                    result.add(map);
                } catch (Exception ignored) {}
            }
            return result;
        } catch (Exception e) {
            log.warn("Failed to list volumes via SSH on {}: {}", host.getIp(), e.getMessage());
            return Collections.emptyList();
        }
    }

    public List<Map<String, Object>> listNetworks(VmHost host) {
        try {
            String output = executeCommandWithFallback(host, "network ls --format '{{json .}}'");
            if (output.isBlank()) return Collections.emptyList();

            List<Map<String, Object>> result = new ArrayList<>();
            for (String line : output.split("\\r?\\n")) {
                line = line.trim();
                if (line.isEmpty() || !line.startsWith("{")) continue;
                try {
                    JsonNode node = objectMapper.readTree(line);
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", node.path("ID").asText(""));
                    map.put("name", node.path("Name").asText(""));
                    map.put("driver", node.path("Driver").asText(""));
                    map.put("scope", node.path("Scope").asText("local"));
                    result.add(map);
                } catch (Exception ignored) {}
            }
            return result;
        } catch (Exception e) {
            log.warn("Failed to list networks via SSH on {}: {}", host.getIp(), e.getMessage());
            return Collections.emptyList();
        }
    }

    public String getLogs(VmHost host, String containerId, int tail) {
        try {
            return executeCommandWithFallback(host, "logs --tail " + tail + " --timestamps " + containerId + " 2>&1");
        } catch (Exception e) {
            return "[ERROR] Failed to fetch logs from Docker daemon: " + e.getMessage();
        }
    }

    public Map<String, Object> execCommand(VmHost host, String containerId, String command, String cwd) {
        try {
            String wrapped = ShellSessionWrapper.wrap(command, cwd);
            String output = executeCommandWithFallback(host,
                    "exec " + containerId + " sh -c " + ShellSessionWrapper.quote(wrapped) + " 2>&1");
            return ShellSessionWrapper.parse(output, cwd);
        } catch (Exception e) {
            log.error("SSH Docker exec failed on {} for container {}: {}", host.getIp(), containerId, e.getMessage());
            return Map.of("output", "Execution error: " + e.getMessage(), "exitCode", 1);
        }
    }

    public String inspectContainerRaw(VmHost host, String containerId) {
        try {
            return executeCommandWithFallback(host, "inspect " + containerId);
        } catch (Exception e) {
            log.error("SSH Docker inspect failed for container {} on {}: {}", containerId, host.getIp(), e.getMessage());
            throw new RuntimeException("SSH inspect failed for " + containerId + ": " + e.getMessage(), e);
        }
    }

    public Object inspectContainer(VmHost host, String containerId) {
        try {
            String rawJson = inspectContainerRaw(host, containerId);
            JsonNode root = objectMapper.readTree(rawJson);
            if (root.isArray() && root.size() > 0) {
                return objectMapper.convertValue(root.get(0), Object.class);
            }
            return objectMapper.convertValue(root, Object.class);
        } catch (Exception e) {
            log.warn("Failed to parse inspect JSON for container {} on {}: {}", containerId, host.getIp(), e.getMessage());
            throw new RuntimeException("Inspect parse failed: " + e.getMessage(), e);
        }
    }

    private List<ContainerDto.PortMapping> parsePorts(String portsStr) {
        List<ContainerDto.PortMapping> ports = new ArrayList<>();
        if (portsStr == null || portsStr.isBlank()) return ports;

        for (String item : portsStr.split(",")) {
            item = item.trim();
            try {
                int arrow = item.indexOf("->");
                if (arrow > 0) {
                    String hostSide = item.substring(0, arrow).trim();
                    String containerSide = item.substring(arrow + 2).trim();

                    int colon = hostSide.lastIndexOf(':');
                    int hostPort = colon >= 0 ? Integer.parseInt(hostSide.substring(colon + 1)) : Integer.parseInt(hostSide);

                    int slash = containerSide.indexOf('/');
                    int containerPort = slash >= 0 ? Integer.parseInt(containerSide.substring(0, slash)) : Integer.parseInt(containerSide);
                    String proto = slash >= 0 ? containerSide.substring(slash + 1) : "tcp";

                    ports.add(new ContainerDto.PortMapping(hostPort, containerPort, proto));
                } else if (item.contains("/")) {
                    int slash = item.indexOf('/');
                    int containerPort = Integer.parseInt(item.substring(0, slash));
                    String proto = item.substring(slash + 1);
                    ports.add(new ContainerDto.PortMapping(0, containerPort, proto));
                }
            } catch (Exception ignored) {}
        }
        return ports;
    }
}
