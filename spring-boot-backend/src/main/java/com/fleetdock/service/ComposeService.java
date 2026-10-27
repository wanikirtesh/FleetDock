package com.fleetdock.service;

import com.fleetdock.config.DockerClientFactory;
import com.fleetdock.dto.ComposeVariableDto;
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

    /**
     * Lists actual Docker Compose stacks by querying the database AND discovering
     * real compose projects from live containers on the Docker daemon (via com.docker.compose.project label)
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
                    stack = ComposeStackEntity.builder()
                            .id("stack-" + UUID.randomUUID().toString().substring(0, 8))
                            .vmId(vmId)
                            .name(projectName)
                            .status(status)
                            .serviceCount(total)
                            .runningCount(running)
                            .rawYaml("# Auto-discovered from live Docker daemon on " + host.getName() + "\nversion: '3.8'\nservices:\n" +
                                    projectContainers.stream()
                                            .map(c -> "  " + (c.getNames() != null && c.getNames().length > 0 ? c.getNames()[0].replaceFirst("^/", "") : c.getId().substring(0, 8)) + ":\n    image: " + c.getImage() + "\n")
                                            .collect(Collectors.joining()))
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
            log.warn("Could not query live Docker compose labels from host {}: {}", host.getName(), e.getMessage());
        }

        // Return real discovered and saved stacks, or empty list if none exist
        return new ArrayList<>(stackMap.values());
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

            stack.setStatus("running");
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
    public ComposeStackEntity updateVariables(String vmId, String stackId, List<ComposeVariableDto> variables) {
        ComposeStackEntity stack = composeStackRepository.findById(stackId)
                .orElseThrow(() -> new IllegalArgumentException("Stack not found: " + stackId));
        return composeStackRepository.save(stack);
    }

    @Transactional
    public ComposeStackEntity updateYaml(String vmId, String stackId, String rawYaml) {
        ComposeStackEntity stack = composeStackRepository.findById(stackId)
                .orElseThrow(() -> new IllegalArgumentException("Stack not found: " + stackId));
        stack.setRawYaml(rawYaml);
        return composeStackRepository.save(stack);
    }
}
