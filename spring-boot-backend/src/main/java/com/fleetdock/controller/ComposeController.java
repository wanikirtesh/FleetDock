package com.fleetdock.controller;

import com.fleetdock.dto.ComposeStackDto;
import com.fleetdock.dto.ComposeVariableDto;
import com.fleetdock.service.ComposeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/hosts/{vmId}/compose")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class ComposeController {

    private final ComposeService composeService;

    @GetMapping
    public ResponseEntity<List<ComposeStackDto>> getStacksForHost(@PathVariable String vmId) {
        return ResponseEntity.ok(composeService.listStacksDto(vmId));
    }

    @PostMapping("/{stackId}/up")
    public ResponseEntity<Map<String, Object>> composeUp(
            @PathVariable String vmId,
            @PathVariable String stackId,
            @RequestParam(defaultValue = "true") boolean detach) {
        return ResponseEntity.ok(composeService.executeComposeUp(vmId, stackId, detach));
    }

    @PostMapping("/{stackId}/down")
    public ResponseEntity<Map<String, Object>> composeDown(
            @PathVariable String vmId,
            @PathVariable String stackId) {
        return ResponseEntity.ok(composeService.executeComposeDown(vmId, stackId));
    }

    @PutMapping("/{stackId}/variables")
    public ResponseEntity<ComposeStackDto> updateVariables(
            @PathVariable String vmId,
            @PathVariable String stackId,
            @RequestBody List<ComposeVariableDto> variables) {
        return ResponseEntity.ok(composeService.updateVariables(vmId, stackId, variables));
    }

    @PutMapping("/{stackId}/yaml")
    public ResponseEntity<ComposeStackDto> updateYaml(
            @PathVariable String vmId,
            @PathVariable String stackId,
            @RequestBody Map<String, String> body) {
        String newYaml = body.get("rawYaml");
        return ResponseEntity.ok(composeService.updateYaml(vmId, stackId, newYaml));
    }
}
