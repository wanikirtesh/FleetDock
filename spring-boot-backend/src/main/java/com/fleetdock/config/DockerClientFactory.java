package com.fleetdock.config;

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
