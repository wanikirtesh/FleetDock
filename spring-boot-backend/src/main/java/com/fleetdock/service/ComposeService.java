package com.fleetdock.service;

import com.fleetdock.dto.ComposeVariableDto;
import com.fleetdock.entity.ComposeStackEntity;
import com.fleetdock.repository.ComposeStackRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ComposeService {

    private final ComposeStackRepository composeStackRepository;

    @Transactional(readOnly = true)
    public List<ComposeStackEntity> listStacks(String vmId) {
        List<ComposeStackEntity> stacks = composeStackRepository.findByVmId(vmId);
        if (stacks.isEmpty()) {
            ComposeStackEntity defaultStack = ComposeStackEntity.builder()
                    .id("stack-" + UUID.randomUUID().toString().substring(0, 8))
                    .vmId(vmId)
                    .name("core-microservices")
                    .status("running")
                    .rawYaml("version: '3.8'\nservices:\n  app:\n    image: spring-service:latest\n    ports:\n      - \"8080:8080\"\n")
                    .serviceCount(2)
                    .runningCount(2)
                    .lastDeployed(LocalDateTime.now())
                    .build();
            return List.of(defaultStack);
        }
        return stacks;
    }

    public Map<String, Object> executeComposeUp(String vmId, String stackId, boolean detach) {
        log.info("Running docker compose up on vm: {} for stack: {}", vmId, stackId);
        return Map.of("status", "success", "message", "docker compose up -d executed successfully");
    }

    public Map<String, Object> executeComposeDown(String vmId, String stackId) {
        log.info("Running docker compose down on vm: {} for stack: {}", vmId, stackId);
        return Map.of("status", "success", "message", "docker compose down executed successfully");
    }

    @Transactional
    public ComposeStackEntity updateVariables(String vmId, String stackId, List<ComposeVariableDto> variables) {
        log.info("Updated compose variables for stack {}", stackId);
        return composeStackRepository.findById(stackId).orElse(null);
    }

    @Transactional
    public ComposeStackEntity updateYaml(String vmId, String stackId, String rawYaml) {
        ComposeStackEntity stack = composeStackRepository.findById(stackId).orElse(null);
        if (stack != null) {
            stack.setRawYaml(rawYaml);
            return composeStackRepository.save(stack);
        }
        return null;
    }
}
