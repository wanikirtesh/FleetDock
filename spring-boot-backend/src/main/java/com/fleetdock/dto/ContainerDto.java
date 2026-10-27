package com.fleetdock.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ContainerDto {

    private String id;
    private String vmId;
    private String name;
    private String image;
    private String state; // running, stopped, paused, restarting, exited
    private String statusText;
    private String created;
    private String command;

    private double cpuPercent;
    private long memUsageMb;
    private long memLimitMb;

    private List<PortMapping> ports;
    private Map<String, String> envVars;
    private String composeStack;
    private String restartPolicy;

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class PortMapping {
        private int hostPort;
        private int containerPort;
        private String protocol;
    }
}
