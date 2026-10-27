package com.fleetdock.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class ContainerDeployRequest {
    private String name;
    private String image;
    private String command;
    private List<ContainerDto.PortMapping> ports;
    private Map<String, String> envVars;
    private String restartPolicy = "unless-stopped";
    private long memLimitMb = 1024;
}
