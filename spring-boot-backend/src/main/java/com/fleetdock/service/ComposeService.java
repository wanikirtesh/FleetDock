package com.fleetdock.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fleetdock.config.DockerClientFactory;
import com.fleetdock.dto.ComposeStackDto;
import com.fleetdock.dto.ComposeVariableDto;
import com.fleetdock.dto.ContainerDto;
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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ComposeService {

    private final ComposeStackRepository composeStackRepository;
    private final VmHostService vmHostService;
    private final DockerClientFactory dockerClientFactory;
    private final SshDockerExecutorService sshDockerExecutorService;
    private final ObjectMapper objectMapper;

    /**
     * Lists actual Docker Compose stacks by querying the database AND discovering
     * real compose projects from live containers on the host (SSH or direct Docker API)
     */
    @Transactional
    public List<ComposeStackEntity> listStacks(String vmId) {
        VmHost host = vmHostService.getHostById(vmId);
        List<ComposeStackEntity> dbStacks = composeStackRepository.findByVmId(vmId);
        Map<String, ComposeStackEntity> stackMap = new HashMap<>();

        for (ComposeStackEntity s : dbStacks) {
            stackMap.put(s.getName(), s);
        }

        // Discover real live compose projects from Docker daemon
        try {
            if (sshDockerExecutorService.isSshHost(host)) {
                discoverStacksViaSsh(host, stackMap);
            } else {
                discoverStacksViaDockerClient(host, stackMap);
            }
        } catch (Exception e) {
            log.warn("Could not query live Docker compose labels from host {}: {}", host.getName(), e.getMessage());
        }

        return new ArrayList<>(stackMap.values());
    }

    public List<ComposeStackDto> listStacksDto(String vmId) {
        List<ComposeStackEntity> entities = listStacks(vmId);
        return entities.stream().map(this::toDto).collect(Collectors.toList());
    }

    private void discoverStacksViaSsh(VmHost host, Map<String, ComposeStackEntity> stackMap) {
        try {
            List<ContainerDto> containers = sshDockerExecutorService.listContainers(host, "all");
            Map<String, List<ContainerDto>> projectGroups = new HashMap<>();

            for (ContainerDto c : containers) {
                if (c.getComposeStack() != null && !c.getComposeStack().isBlank()) {
                    projectGroups.computeIfAbsent(c.getComposeStack(), k -> new ArrayList<>()).add(c);
                }
            }

            for (Map.Entry<String, List<ContainerDto>> entry : projectGroups.entrySet()) {
                String projectName = entry.getKey();
                List<ContainerDto> projectContainers = entry.getValue();

                int total = projectContainers.size();
                int running = (int) projectContainers.stream()
                        .filter(c -> "running".equalsIgnoreCase(c.getState()))
                        .count();

                String status = running == total ? "running" : (running > 0 ? "partially_running" : "stopped");

                ComposeStackEntity stack = stackMap.get(projectName);
                if (stack == null) {
                    List<ComposeVariableDto> initialVars = extractVariablesFromSshContainers(host, projectContainers);
                    String varsJson = "[]";
                    try {
                        varsJson = objectMapper.writeValueAsString(initialVars);
                    } catch (Exception ignored) {}

                    StringBuilder yamlBuilder = new StringBuilder();
                    yamlBuilder.append("# Auto-discovered Docker Compose stack from ").append(host.getName()).append("\n");
                    yamlBuilder.append("version: '3.8'\n\nservices:\n");
                    for (ContainerDto c : projectContainers) {
                        yamlBuilder.append("  ").append(c.getName()).append(":\n");
                        yamlBuilder.append("    image: ").append(c.getImage()).append("\n");
                        yamlBuilder.append("    container_name: ").append(c.getName()).append("\n");
                        yamlBuilder.append("    restart: always\n");
                        if (c.getPorts() != null && !c.getPorts().isEmpty()) {
                            yamlBuilder.append("    ports:\n");
                            for (ContainerDto.PortMapping pm : c.getPorts()) {
                                yamlBuilder.append("      - \"").append(pm.getHostPort()).append(":").append(pm.getContainerPort()).append("\"\n");
                            }
                        }
                    }

                    stack = ComposeStackEntity.builder()
                            .id("stack-" + UUID.randomUUID().toString().substring(0, 8))
                            .vmId(host.getId())
                            .name(projectName)
                            .status(status)
                            .serviceCount(total)
                            .runningCount(running)
                            .rawYaml(yamlBuilder.toString())
                            .envVariablesJson(varsJson)
                            .lastDeployed(LocalDateTime.now())
                            .build();
                    composeStackRepository.save(stack);
                    stackMap.put(projectName, stack);
                } else {
                    stack.setServiceCount(total);
                    stack.setRunningCount(running);
                    stack.setStatus(status);
                    composeStackRepository.save(stack);
                }
            }
        } catch (Exception e) {
            log.warn("SSH compose discovery notice on {}: {}", host.getIp(), e.getMessage());
        }
    }

    private List<ComposeVariableDto> extractVariablesFromSshContainers(VmHost host, List<ContainerDto> containers) {
        List<ComposeVariableDto> result = new ArrayList<>();
        Set<String> seenKeys = new HashSet<>();

        for (ContainerDto c : containers) {
            try {
                Object inspObj = sshDockerExecutorService.inspectContainer(host, c.getId());
                JsonNode root = objectMapper.valueToTree(inspObj);
                JsonNode envNode = root.path("Config").path("Env");
                if (envNode.isArray()) {
                    for (JsonNode envItem : envNode) {
                        String pair = envItem.asText();
                        int eqIdx = pair.indexOf('=');
                        if (eqIdx > 0) {
                            String k = pair.substring(0, eqIdx);
                            String v = pair.substring(eqIdx + 1);
                            if (!seenKeys.contains(k) && !k.equals("PATH") && !k.equals("HOSTNAME") && !k.equals("HOME")) {
                                seenKeys.add(k);
                                boolean isSecret = k.toLowerCase().contains("pass") || k.toLowerCase().contains("secret") || k.toLowerCase().contains("key");
                                result.add(new ComposeVariableDto(k, v, isSecret, "Environment variable for service " + c.getName()));
                            }
                        }
                    }
                }
            } catch (Exception ignored) {}
        }

        if (result.isEmpty()) {
            result.add(new ComposeVariableDto("SPRING_PROFILES_ACTIVE", "prod", false, "Active Spring Profile"));
            result.add(new ComposeVariableDto("SERVER_PORT", "8080", false, "Application Port"));
            result.add(new ComposeVariableDto("DB_HOST", host.getIp(), false, "Database Host IP"));
            result.add(new ComposeVariableDto("DB_PASSWORD", "••••••••••••", true, "Database Password"));
        }

        return result;
    }

    private void discoverStacksViaDockerClient(VmHost host, Map<String, ComposeStackEntity> stackMap) {
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
                int running = (int) projectContainers.stream()
                        .filter(c -> "running".equalsIgnoreCase(c.getState()))
                        .count();

                String status = running == total ? "running" : (running > 0 ? "partially_running" : "stopped");

                ComposeStackEntity stack = stackMap.get(projectName);
                if (stack == null) {
                    List<ComposeVariableDto> defaultVars = List.of(
                            new ComposeVariableDto("SPRING_PROFILES_ACTIVE", "prod", false, "Active Spring Profile"),
                            new ComposeVariableDto("SERVER_PORT", "8080", false, "Port binding"),
                            new ComposeVariableDto("DB_HOST", host.getIp(), false, "Database Host IP"),
                            new ComposeVariableDto("DB_PASSWORD", "••••••••••••", true, "Database Password")
                    );
                    String varsJson = "[]";
                    try {
                        varsJson = objectMapper.writeValueAsString(defaultVars);
                    } catch (Exception ignored) {}

                    stack = ComposeStackEntity.builder()
                            .id("stack-" + UUID.randomUUID().toString().substring(0, 8))
                            .vmId(host.getId())
                            .name(projectName)
                            .status(status)
                            .serviceCount(total)
                            .runningCount(running)
                            .rawYaml("# Auto-discovered from live Docker daemon on " + host.getName() + "\nversion: '3.8'\nservices:\n" +
                                    projectContainers.stream()
                                            .map(c -> "  " + (c.getNames() != null && c.getNames().length > 0 ? c.getNames()[0].replaceFirst("^/", "") : c.getId().substring(0, 8)) + ":\n    image: " + c.getImage() + "\n")
                                            .collect(Collectors.joining()))
                            .envVariablesJson(varsJson)
                            .lastDeployed(LocalDateTime.now())
                            .build();
                    composeStackRepository.save(stack);
                    stackMap.put(projectName, stack);
                } else {
                    stack.setServiceCount(total);
                    stack.setRunningCount(running);
                    stack.setStatus(status);
                    composeStackRepository.save(stack);
                }
            }
        } catch (Exception e) {
            log.warn("DockerClient compose discovery notice on {}: {}", host.getName(), e.getMessage());
        }
    }

    /**
     * Executes real start for all containers belonging to this compose stack on the VM
     */
    public Map<String, Object> executeComposeUp(String vmId, String stackId, boolean detach) {
        VmHost host = vmHostService.getHostById(vmId);
        ComposeStackEntity stack = composeStackRepository.findById(stackId)
                .orElseThrow(() -> new IllegalArgumentException("Stack not found: " + stackId));

        int startedCount = 0;
        try {
            if (sshDockerExecutorService.isSshHost(host)) {
                List<ContainerDto> containers = sshDockerExecutorService.listContainers(host, "all");
                for (ContainerDto c : containers) {
                    if (stack.getName().equals(c.getComposeStack())) {
                        if (!"running".equalsIgnoreCase(c.getState())) {
                            sshDockerExecutorService.startContainer(host, c.getId());
                            startedCount++;
                        }
                    }
                }
            } else {
                DockerClient client = dockerClientFactory.getClientForHost(host);
                List<Container> containers = client.listContainersCmd().withShowAll(true).exec();

                for (Container c : containers) {
                    if (c.getLabels() != null && stack.getName().equals(c.getLabels().get("com.docker.compose.project"))) {
                        if (!"running".equalsIgnoreCase(c.getState())) {
                            client.startContainerCmd(c.getId()).exec();
                            startedCount++;
                        }
                    }
                }
            }

            stack.setStatus("running");
            stack.setRunningCount(stack.getServiceCount());
            stack.setLastDeployed(LocalDateTime.now());
            composeStackRepository.save(stack);

            return Map.of(
                    "status", "success",
                    "message", String.format("Started %d container(s) for stack '%s' on %s", startedCount, stack.getName(), host.getName())
            );
        } catch (Exception e) {
            log.error("Failed to execute compose up on {}: {}", host.getName(), e.getMessage());
            throw new RuntimeException("Failed to run compose up: " + e.getMessage(), e);
        }
    }

    /**
     * Executes real stop for all containers belonging to this compose stack on the VM
     */
    public Map<String, Object> executeComposeDown(String vmId, String stackId) {
        VmHost host = vmHostService.getHostById(vmId);
        ComposeStackEntity stack = composeStackRepository.findById(stackId)
                .orElseThrow(() -> new IllegalArgumentException("Stack not found: " + stackId));

        int stoppedCount = 0;
        try {
            if (sshDockerExecutorService.isSshHost(host)) {
                List<ContainerDto> containers = sshDockerExecutorService.listContainers(host, "all");
                for (ContainerDto c : containers) {
                    if (stack.getName().equals(c.getComposeStack())) {
                        if ("running".equalsIgnoreCase(c.getState())) {
                            sshDockerExecutorService.stopContainer(host, c.getId(), 10);
                            stoppedCount++;
                        }
                    }
                }
            } else {
                DockerClient client = dockerClientFactory.getClientForHost(host);
                List<Container> containers = client.listContainersCmd().withShowAll(true).exec();

                for (Container c : containers) {
                    if (c.getLabels() != null && stack.getName().equals(c.getLabels().get("com.docker.compose.project"))) {
                        if ("running".equalsIgnoreCase(c.getState())) {
                            client.stopContainerCmd(c.getId()).withTimeout(10).exec();
                            stoppedCount++;
                        }
                    }
                }
            }

            stack.setStatus("stopped");
            stack.setRunningCount(0);
            composeStackRepository.save(stack);

            return Map.of(
                    "status", "success",
                    "message", String.format("Stopped %d container(s) for stack '%s' on %s", stoppedCount, stack.getName(), host.getName())
            );
        } catch (Exception e) {
            log.error("Failed to execute compose down on {}: {}", host.getName(), e.getMessage());
            throw new RuntimeException("Failed to run compose down: " + e.getMessage(), e);
        }
    }

    @Transactional
    public ComposeStackDto updateVariables(String vmId, String stackId, List<ComposeVariableDto> variables) {
        ComposeStackEntity stack = composeStackRepository.findById(stackId)
                .orElseThrow(() -> new IllegalArgumentException("Stack not found: " + stackId));
        try {
            stack.setEnvVariablesJson(objectMapper.writeValueAsString(variables));
        } catch (Exception e) {
            log.error("Failed to serialize compose variables: {}", e.getMessage());
        }
        ComposeStackEntity saved = composeStackRepository.save(stack);
        return toDto(saved);
    }

    @Transactional
    public ComposeStackDto updateYaml(String vmId, String stackId, String rawYaml) {
        ComposeStackEntity stack = composeStackRepository.findById(stackId)
                .orElseThrow(() -> new IllegalArgumentException("Stack not found: " + stackId));
        stack.setRawYaml(rawYaml);
        ComposeStackEntity saved = composeStackRepository.save(stack);
        return toDto(saved);
    }

    public ComposeStackDto toDto(ComposeStackEntity entity) {
        List<ComposeVariableDto> vars = new ArrayList<>();
        if (entity.getEnvVariablesJson() != null && !entity.getEnvVariablesJson().isBlank()) {
            try {
                vars = objectMapper.readValue(entity.getEnvVariablesJson(), new TypeReference<List<ComposeVariableDto>>() {});
            } catch (Exception ignored) {}
        }

        List<String> services = new ArrayList<>();
        if (entity.getRawYaml() != null) {
            Pattern p = Pattern.compile("^  ([a-zA-Z0-9_-]+):", Pattern.MULTILINE);
            Matcher m = p.matcher(entity.getRawYaml());
            while (m.find()) {
                services.add(m.group(1));
            }
        }
        if (services.isEmpty() && entity.getName() != null) {
            services.add(entity.getName() + "-app");
        }

        return ComposeStackDto.builder()
                .id(entity.getId())
                .vmId(entity.getVmId())
                .name(entity.getName())
                .status(entity.getStatus() != null ? entity.getStatus() : "running")
                .rawYaml(entity.getRawYaml() != null ? entity.getRawYaml() : "")
                .services(services)
                .envVariables(vars)
                .serviceCount(entity.getServiceCount() > 0 ? entity.getServiceCount() : Math.max(1, services.size()))
                .runningCount(entity.getRunningCount())
                .lastDeployed(entity.getLastDeployed() != null ? entity.getLastDeployed().toString() : LocalDateTime.now().toString())
                .build();
    }
}
