package com.fleetdock.service;

import com.fleetdock.config.DockerClientFactory;
import com.fleetdock.dto.VmRegistrationRequest;
import com.fleetdock.entity.AuthCredential;
import com.fleetdock.entity.VmHost;
import com.fleetdock.repository.VmHostRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class VmHostService {

    private final VmHostRepository vmHostRepository;
    private final VaultEncryptionService encryptionService;
    private final DockerClientFactory dockerClientFactory;
    private final com.fleetdock.repository.ComposeStackRepository composeStackRepository;

    @Transactional(readOnly = true)
    public List<VmHost> findAllHosts(String ownerId) {
        return vmHostRepository.findByOwnerId(ownerId);
    }

    @Transactional(readOnly = true)
    public VmHost getHostById(String id) {
        return vmHostRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Host not found with ID: " + id));
    }

    @Transactional
    public VmHost registerHost(VmRegistrationRequest request, String ownerId) {
        log.info("Registering VM host: {} on {}:{}", request.getName(), request.getIp(), request.getPort());

        AuthCredential credential = AuthCredential.builder()
                .username(request.getUsername())
                .password(encryptionService.encrypt(request.getPassword()))
                .privateKey(encryptionService.encrypt(request.getPrivateKey()))
                .passphrase(encryptionService.encrypt(request.getPassphrase()))
                .tlsCa(request.getTlsCa())
                .tlsCert(request.getTlsCert())
                .tlsKey(encryptionService.encrypt(request.getTlsKey()))
                .agentToken(request.getAgentToken())
                .build();

        VmHost host = VmHost.builder()
                .id("vm-" + UUID.randomUUID().toString().substring(0, 8))
                .name(request.getName())
                .ownerId(ownerId)
                .ip(request.getIp())
                .port(request.getPort())
                .authType(request.getAuthType())
                .environment(request.getEnvironment() != null ? request.getEnvironment() : "Production")
                .icon(normalizeIcon(request.getIcon()))
                .os(request.getOs() != null ? request.getOs() : "Linux")
                .arch(request.getArch() != null ? request.getArch() : "x86_64")
                .dockerVersion("Pending verification")
                .apiVersion("")
                .status("connecting")
                .pingMs(0)
                .cpuCores(request.getCpuCores() > 0 ? request.getCpuCores() : 1)
                .memoryGb(request.getMemoryGb() > 0 ? request.getMemoryGb() : 1)
                .diskGb(request.getDiskGb() > 0 ? request.getDiskGb() : 10)
                .cpuUsagePercent(0.0)
                .memoryUsedPercent(0.0)
                .diskUsedPercent(0.0)
                .useSudo(request.isUseSudo())
                .tags(normalizeTags(request.getTags()))
                .authCredential(credential)
                .createdAt(LocalDateTime.now())
                .lastChecked(LocalDateTime.now())
                .build();

        return vmHostRepository.save(host);
    }

    @Transactional
    public VmHost updateHost(String id, VmRegistrationRequest request) {
        log.info("Updating VM host: {} (ID: {}) with endpoint: {}:{}", request.getName(), id, request.getIp(), request.getPort());
        VmHost existing = getHostById(id);
        
        existing.setName(request.getName());
        existing.setIp(request.getIp());
        existing.setPort(request.getPort());
        if (request.getAuthType() != null) {
            existing.setAuthType(request.getAuthType());
        }
        existing.setUseSudo(request.isUseSudo());
        if (request.getEnvironment() != null && !request.getEnvironment().isBlank()) {
            existing.setEnvironment(request.getEnvironment());
        }
        if (request.getIcon() != null) {
            existing.setIcon(normalizeIcon(request.getIcon()));
        }
        if (request.getTags() != null) {
            existing.setTags(normalizeTags(request.getTags()));
        }
        if (request.getOs() != null && !request.getOs().isBlank()) {
            existing.setOs(request.getOs());
        }
        if (request.getArch() != null && !request.getArch().isBlank()) {
            existing.setArch(request.getArch());
        }
        if (request.getCpuCores() > 0) {
            existing.setCpuCores(request.getCpuCores());
        }
        if (request.getMemoryGb() > 0) {
            existing.setMemoryGb(request.getMemoryGb());
        }
        if (request.getDiskGb() > 0) {
            existing.setDiskGb(request.getDiskGb());
        }

        // Update credentials if provided
        AuthCredential cred = existing.getAuthCredential();
        if (cred == null) {
            cred = new AuthCredential();
            existing.setAuthCredential(cred);
        }
        if (request.getUsername() != null && !request.getUsername().isBlank()) {
            cred.setUsername(request.getUsername().trim());
        }
        if (request.getPassword() != null && !request.getPassword().isBlank()) {
            cred.setPassword(encryptionService.encrypt(request.getPassword().trim()));
        }
        if (request.getPrivateKey() != null && !request.getPrivateKey().isBlank()) {
            cred.setPrivateKey(encryptionService.encrypt(request.getPrivateKey().trim()));
        }
        if (request.getPassphrase() != null && !request.getPassphrase().isBlank()) {
            cred.setPassphrase(encryptionService.encrypt(request.getPassphrase().trim()));
        }
        if (request.getTlsCa() != null && !request.getTlsCa().isBlank()) {
            cred.setTlsCa(request.getTlsCa().trim());
        }
        if (request.getTlsCert() != null && !request.getTlsCert().isBlank()) {
            cred.setTlsCert(request.getTlsCert().trim());
        }
        if (request.getTlsKey() != null && !request.getTlsKey().isBlank()) {
            cred.setTlsKey(encryptionService.encrypt(request.getTlsKey().trim()));
        }
        if (request.getAgentToken() != null && !request.getAgentToken().isBlank()) {
            cred.setAgentToken(request.getAgentToken().trim());
        }

        existing.setLastChecked(LocalDateTime.now());

        // Evict cached DockerClient so subsequent queries use updated connection params
        try {
            dockerClientFactory.evictClient(id);
        } catch (Exception e) {
            log.warn("Could not evict cached DockerClient for host {}: {}", id, e.getMessage());
        }

        return vmHostRepository.save(existing);
    }

    private String normalizeIcon(String icon) {
        if (icon == null) return null;
        String v = icon.trim().toLowerCase();
        return v.matches("[a-z0-9_-]{1,32}") ? v : null;
    }

    private List<String> normalizeTags(List<String> tags) {
        if (tags == null) return new ArrayList<>();
        return tags.stream()
                .filter(t -> t != null && !t.isBlank())
                .map(String::trim)
                .distinct()
                .collect(Collectors.toCollection(ArrayList::new));
    }

    @Transactional
    public VmHost save(VmHost host) {
        return vmHostRepository.save(host);
    }

    @Transactional
    public void deleteHost(String id) {
        log.info("Deleting VM host ID: {}", id);
        try {
            dockerClientFactory.evictClient(id);
        } catch (Exception e) {
            log.warn("Could not evict cached DockerClient for host {}: {}", id, e.getMessage());
        }
        composeStackRepository.deleteByVmId(id);
        vmHostRepository.deleteById(id);
    }
}
