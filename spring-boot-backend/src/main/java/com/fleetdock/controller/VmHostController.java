package com.fleetdock.controller;

import com.fleetdock.dto.VmRegistrationRequest;
import com.fleetdock.entity.VmHost;
import com.fleetdock.service.DockerEngineService;
import com.fleetdock.service.VmHostService;
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

    @GetMapping("/{id}/volumes")
    public ResponseEntity<List<Map<String, Object>>> getHostVolumes(@PathVariable String id) {
        return ResponseEntity.ok(dockerEngineService.listVolumes(id));
    }

    @GetMapping("/{id}/networks")
    public ResponseEntity<List<Map<String, Object>>> getHostNetworks(@PathVariable String id) {
        return ResponseEntity.ok(dockerEngineService.listNetworks(id));
    }

    @PostMapping("/{id}/exec")
    public ResponseEntity<Map<String, Object>> execHostCommand(
            @PathVariable String id,
            @RequestBody Map<String, Object> request) {
        String command = (String) request.getOrDefault("command", "");
        boolean useSudo = Boolean.TRUE.equals(request.get("useSudo"));
        return ResponseEntity.ok(dockerEngineService.execHostCommand(id, command, useSudo));
    }

    @GetMapping("/{id}/metrics")
    public ResponseEntity<Map<String, Object>> getHostMetrics(@PathVariable String id) {
        return ResponseEntity.ok(dockerEngineService.getHostMetrics(id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteHost(@PathVariable String id) {
        vmHostService.deleteHost(id);
        return ResponseEntity.noContent().build();
    }
}
