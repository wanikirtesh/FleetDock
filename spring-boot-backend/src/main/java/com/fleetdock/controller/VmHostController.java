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

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteHost(@PathVariable String id) {
        vmHostService.deleteHost(id);
        return ResponseEntity.noContent().build();
    }
}
