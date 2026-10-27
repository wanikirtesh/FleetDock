package com.fleetdock.controller;

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
