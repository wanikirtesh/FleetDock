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

import java.io.File;
import java.io.FileWriter;
import java.nio.file.Files;
import java.nio.file.Path;
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
        log.info("Building real DockerClient for host: {} (ip: {}, port: {}, auth: {})", 
                host.getName(), host.getIp(), host.getPort(), host.getAuthType());

        DefaultDockerClientConfig.Builder configBuilder = DefaultDockerClientConfig.createDefaultConfigBuilder();

        String ip = host.getIp().trim();
        boolean isLocal = "localhost".equalsIgnoreCase(ip) || "127.0.0.1".equals(ip) || "0.0.0.0".equals(ip);

        if (isLocal) {
            String os = System.getProperty("os.name", "").toLowerCase();
            if (os.contains("win")) {
                // Windows Docker Desktop named pipe or localhost TCP
                File pipe = new File("//./pipe/docker_engine");
                if (pipe.exists()) {
                    configBuilder.withDockerHost("npipe:////./pipe/docker_engine");
                } else {
                    configBuilder.withDockerHost("tcp://localhost:2375");
                }
            } else {
                // Linux / macOS default socket
                configBuilder.withDockerHost("unix:///var/run/docker.sock");
            }
        } else {
            // Remote VM
            switch (host.getAuthType()) {
                case DOCKER_SOCKET -> {
                    // TCP socket with TLS or plain TCP
                    String scheme = host.getPort() == 2376 ? "tcp" : "tcp";
                    configBuilder.withDockerHost(String.format("%s://%s:%d", scheme, host.getIp(), host.getPort()));

                    if (host.getAuthCredential() != null && host.getAuthCredential().getTlsCert() != null) {
                        try {
                            Path certDir = Files.createTempDirectory("docker-tls-" + host.getId());
                            if (host.getAuthCredential().getTlsCa() != null) {
                                Files.writeString(certDir.resolve("ca.pem"), host.getAuthCredential().getTlsCa());
                            }
                            Files.writeString(certDir.resolve("cert.pem"), host.getAuthCredential().getTlsCert());
                            if (host.getAuthCredential().getTlsKey() != null) {
                                String decryptedKey = encryptionService.decrypt(host.getAuthCredential().getTlsKey());
                                Files.writeString(certDir.resolve("key.pem"), decryptedKey);
                            }
                            configBuilder.withDockerTlsVerify(true);
                            configBuilder.withDockerCertPath(certDir.toAbsolutePath().toString());
                        } catch (Exception e) {
                            log.warn("Could not write TLS certs to disk: {}", e.getMessage());
                        }
                    }
                }
                case SSH_KEY -> {
                    String user = host.getAuthCredential() != null && host.getAuthCredential().getUsername() != null
                            ? host.getAuthCredential().getUsername() : "root";
                    configBuilder.withDockerHost(String.format("ssh://%s@%s:%d", user, host.getIp(), host.getPort()));
                }
                default -> {
                    // Standard TCP connection
                    configBuilder.withDockerHost(String.format("tcp://%s:%d", host.getIp(), host.getPort()));
                }
            }
        }

        DefaultDockerClientConfig clientConfig = configBuilder.build();

        ApacheDockerHttpClient httpClient = new ApacheDockerHttpClient.Builder()
                .dockerHost(clientConfig.getDockerHost())
                .sslConfig(clientConfig.getSSLConfig())
                .maxConnections(100)
                .connectionTimeout(Duration.ofSeconds(8))
                .responseTimeout(Duration.ofSeconds(30))
                .build();

        return DockerClientImpl.getInstance(clientConfig, httpClient);
    }
}
