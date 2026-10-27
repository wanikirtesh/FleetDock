package com.fleetdock.service;

import com.fleetdock.dto.VmRegistrationRequest;
import com.fleetdock.entity.AuthCredential;
import com.fleetdock.entity.VmHost;
import com.fleetdock.repository.VmHostRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class VmHostService {

    private final VmHostRepository vmHostRepository;
    private final VaultEncryptionService encryptionService;

    @Transactional(readOnly = true)
    public List<VmHost> findAllHosts() {
        return vmHostRepository.findAll();
    }

    @Transactional(readOnly = true)
    public VmHost getHostById(String id) {
        return vmHostRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Host not found with ID: " + id));
    }

    @Transactional
    public VmHost registerHost(VmRegistrationRequest request) {
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
                .ip(request.getIp())
                .port(request.getPort())
                .authType(request.getAuthType())
                .environment(request.getEnvironment())
                .os(request.getOs())
                .arch(request.getArch())
                .dockerVersion("Docker Engine 27.2.1")
                .apiVersion("1.47")
                .status("online")
                .pingMs(15)
                .cpuCores(request.getCpuCores())
                .memoryGb(request.getMemoryGb())
                .diskGb(request.getDiskGb())
                .cpuUsagePercent(24.5)
                .memoryUsedPercent(58.0)
                .diskUsedPercent(42.0)
                .authCredential(credential)
                .createdAt(LocalDateTime.now())
                .lastChecked(LocalDateTime.now())
                .build();

        return vmHostRepository.save(host);
    }

    @Transactional
    public VmHost updateHost(String id, VmRegistrationRequest request) {
        VmHost existing = getHostById(id);
        existing.setName(request.getName());
        existing.setIp(request.getIp());
        existing.setPort(request.getPort());
        existing.setEnvironment(request.getEnvironment());
        existing.setLastChecked(LocalDateTime.now());
        return vmHostRepository.save(existing);
    }

    @Transactional
    public void deleteHost(String id) {
        vmHostRepository.deleteById(id);
    }
}
