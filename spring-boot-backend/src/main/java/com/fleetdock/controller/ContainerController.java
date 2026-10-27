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

    @GetMapping(value = "/{containerId}/logs")
    public Object getContainerLogs(
            @PathVariable String vmId,
            @PathVariable String containerId,
            @RequestParam(defaultValue = "100") int tail,
            @RequestParam(defaultValue = "false") boolean follow,
            @RequestHeader(value = "Accept", defaultValue = "*/*") String acceptHeader) {
        if ((acceptHeader != null && acceptHeader.contains(MediaType.TEXT_EVENT_STREAM_VALUE)) || follow) {
            return dockerEngineService.streamLogs(vmId, containerId, tail, follow);
        }
        return ResponseEntity.ok(dockerEngineService.getLogsList(vmId, containerId, tail));
    }

    @PostMapping("/deploy")
    public ResponseEntity<ContainerDto> deployContainer(
            @PathVariable String vmId,
            @RequestBody ContainerDeployRequest request) {
        return ResponseEntity.ok(dockerEngineService.deployContainer(vmId, request));
    }

    @GetMapping("/{containerId}/inspect")
    public ResponseEntity<Object> inspectContainer(
            @PathVariable String vmId,
            @PathVariable String containerId) {
        return ResponseEntity.ok(dockerEngineService.inspectContainer(vmId, containerId));
    }

    @PostMapping("/{containerId}/exec")
    public ResponseEntity<Map<String, Object>> execCommand(
            @PathVariable String vmId,
            @PathVariable String containerId,
            @RequestBody Map<String, String> request) {
        String command = request.getOrDefault("command", "").trim();
        if (command.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("output", "Empty command", "exitCode", 1));
        }
        return ResponseEntity.ok(dockerEngineService.execCommand(vmId, containerId, command));
    }

    @GetMapping("/volumes")
    public ResponseEntity<List<Map<String, Object>>> listVolumes(@PathVariable String vmId) {
        return ResponseEntity.ok(dockerEngineService.listVolumes(vmId));
    }

    @GetMapping("/networks")
    public ResponseEntity<List<Map<String, Object>>> listNetworks(@PathVariable String vmId) {
        return ResponseEntity.ok(dockerEngineService.listNetworks(vmId));
    }
}
