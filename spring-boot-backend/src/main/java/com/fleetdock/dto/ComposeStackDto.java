package com.fleetdock.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ComposeStackDto {
    private String id;
    private String vmId;
    private String name;
    private String status; // running, partially_running, stopped
    private String rawYaml;
    private List<String> services;
    private List<ComposeVariableDto> envVariables;
    private int serviceCount;
    private int runningCount;
    private String lastDeployed;
}
