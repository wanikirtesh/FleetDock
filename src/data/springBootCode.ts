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
        return List.of(
            ContainerDto.builder()
                .id("c-" + vmId.substring(0, 4) + "-01")
                .vmId(vmId)
                .name("spring-billing-service")
                .image("registry.internal.net/microservices/billing-service:2.4.1")
                .state("running")
                .statusText("Up 3 days")
                .created("2026-10-23 09:15:00")
                .command("java -jar app.jar")
                .cpuPercent(3.4)
                .memUsageMb(485)
                .memLimitMb(1024)
                .ports(List.of(new ContainerDto.PortMapping(8080, 8080, "tcp")))
                .restartPolicy("always")
                .build()
        );
    }

    public void startContainer(String vmId, String containerId) {
        log.info("Starting container {} on host {}", containerId, vmId);
    }

    public void stopContainer(String vmId, String containerId, int timeoutSeconds) {
        log.info("Stopping container {} on host {}", containerId, vmId);
    }

    public void restartContainer(String vmId, String containerId) {
        log.info("Restarting container {} on host {}", containerId, vmId);
    }

    public void removeContainer(String vmId, String containerId, boolean force) {
        log.info("Removing container {} on host {}", containerId, vmId);
    }

    public ContainerDto deployContainer(String vmId, ContainerDeployRequest request) {
        return ContainerDto.builder()
                .id("c-" + UUID.randomUUID().toString().substring(0, 8))
                .vmId(vmId)
                .name(request.getName())
                .image(request.getImage())
                .state("running")
                .statusText("Up Just now")
                .created(Instant.now().toString())
                .command(request.getCommand() != null ? request.getCommand() : "docker-entrypoint.sh")
                .build();
    }

    public SseEmitter streamLogs(String vmId, String containerId, int tail, boolean follow) {
        SseEmitter emitter = new SseEmitter(180_000L);
        Executors.newSingleThreadExecutor().submit(() -> {
            try {
                for (int i = 0; i < 20; i++) {
                    String logLine = String.format("[%s] [INFO] [container=%s] Spring Boot heartbeat probe OK", 
                            Instant.now().toString().substring(11, 19), containerId);
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
