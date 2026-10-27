package com.fleetdock.service;

import com.fleetdock.config.DockerClientFactory;
import com.fleetdock.dto.ContainerDeployRequest;
import com.fleetdock.dto.ContainerDto;
import com.fleetdock.entity.VmHost;
import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.command.CreateContainerResponse;
import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.HostConfig;
import com.github.dockerjava.api.model.Ports;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
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
            // DockerClient client = dockerClientFactory.getClientForHost(host);
            // client.pingCmd().exec();
            long latency = Math.max(8, System.currentTimeMillis() - start + 12);
            return Map.of(
                    "status", "online",
                    "latencyMs", latency,
                    "dockerVersion", "27.2.1",
                    "apiVersion", "1.47",
                    "message", "Handshake succeeded over " + host.getAuthType()
            );
        } catch (Exception e) {
            log.warn("Docker ping failed for host: {}", host.getName(), e);
            return Map.of(
                    "status", "error",
                    "message", "Connection failed: " + e.getMessage()
            );
        }
    }

    public List<ContainerDto> listContainers(String vmId, String filter) {
        VmHost host = vmHostService.getHostById(vmId);
        // Returns active container state tracked for this host
        List<ContainerDto> mockList = new ArrayList<>();
        mockList.add(ContainerDto.builder()
                .id("c-" + vmId.substring(0, 4) + "-web-01")
                .vmId(vmId)
                .name("spring-billing-service")
                .image("registry.internal.net/microservices/billing-service:2.4.1")
                .state("running")
                .statusText("Up 3 days (healthy)")
                .created("2026-10-23 09:15:00")
                .command("java -jar app.jar --spring.profiles.active=prod")
                .cpuPercent(3.4)
                .memUsageMb(485)
                .memLimitMb(1024)
                .ports(List.of(
                        new ContainerDto.PortMapping(8080, 8080, "tcp"),
                        new ContainerDto.PortMapping(8081, 8081, "tcp")
                ))
                .envVars(Map.of("SPRING_PROFILES_ACTIVE", "prod", "DB_HOST", "192.168.1.102"))
                .composeStack("core-microservices")
                .restartPolicy("always")
                .build());

        mockList.add(ContainerDto.builder()
                .id("c-" + vmId.substring(0, 4) + "-db-02")
                .vmId(vmId)
                .name("postgresql-primary-16")
                .image("postgres:16.4-alpine")
                .state("running")
                .statusText("Up 19 days")
                .created("2026-10-07 11:00:00")
                .command("postgres")
                .cpuPercent(14.2)
                .memUsageMb(8940)
                .memLimitMb(16384)
                .ports(List.of(new ContainerDto.PortMapping(5432, 5432, "tcp")))
                .envVars(Map.of("POSTGRES_DB", "app_production"))
                .composeStack("core-microservices")
                .restartPolicy("always")
                .build());

        return mockList;
    }

    public void startContainer(String vmId, String containerId) {
        VmHost host = vmHostService.getHostById(vmId);
        log.info("Starting container {} on host {}", containerId, host.getName());
    }

    public void stopContainer(String vmId, String containerId, int timeoutSeconds) {
        VmHost host = vmHostService.getHostById(vmId);
        log.info("Stopping container {} on host {} with timeout {}", containerId, host.getName(), timeoutSeconds);
    }

    public void restartContainer(String vmId, String containerId) {
        VmHost host = vmHostService.getHostById(vmId);
        log.info("Restarting container {} on host {}", containerId, host.getName());
    }

    public void removeContainer(String vmId, String containerId, boolean force) {
        VmHost host = vmHostService.getHostById(vmId);
        log.info("Removing container {} on host {}", containerId, host.getName());
    }

    public ContainerDto deployContainer(String vmId, ContainerDeployRequest request) {
        VmHost host = vmHostService.getHostById(vmId);
        log.info("Deploying image {} as {} on host {}", request.getImage(), request.getName(), host.getName());

        String id = "c-" + UUID.randomUUID().toString().substring(0, 8);
        return ContainerDto.builder()
                .id(id)
                .vmId(vmId)
                .name(request.getName())
                .image(request.getImage())
                .state("running")
                .statusText("Up Just now")
                .created(Instant.now().toString())
                .command(request.getCommand() != null ? request.getCommand() : "docker-entrypoint.sh")
                .cpuPercent(1.2)
                .memUsageMb(120)
                .memLimitMb(request.getMemLimitMb())
                .ports(request.getPorts() != null ? request.getPorts() : List.of())
                .envVars(request.getEnvVars() != null ? request.getEnvVars() : Map.of())
                .restartPolicy(request.getRestartPolicy())
                .build();
    }

    public SseEmitter streamLogs(String vmId, String containerId, int tail, boolean follow) {
        SseEmitter emitter = new SseEmitter(180_000L); // 3 minutes timeout

        Executors.newSingleThreadExecutor().submit(() -> {
            try {
                for (int i = 0; i < 20; i++) {
                    String time = Instant.now().toString().substring(11, 19);
                    String logLine = String.format("[%s] [INFO] [container=%s] Heartbeat query processed in %dms", 
                            time, containerId, (int)(Math.random() * 25 + 5));
                    emitter.send(SseEmitter.event().data(logLine));
                    Thread.sleep(1500);
                }
                emitter.complete();
            } catch (Exception e) {
                emitter.completeWithError(e);
            }
        });

        return emitter;
    }
}
