package com.fleetdock.dto;

import com.fleetdock.entity.VmHost.AuthType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

@Data
public class VmRegistrationRequest {

    @NotBlank(message = "Host name is required")
    private String name;

    @NotBlank(message = "Host IP or domain is required")
    private String ip;

    private int port = 22;

    @NotNull(message = "Auth type is required")
    private AuthType authType = AuthType.SSH_KEY;

    private String environment = "Production";
    private String icon;
    private List<String> tags;
    private String os = "Ubuntu 24.04 LTS";
    private String arch = "x86_64";

    private int cpuCores = 4;
    private int memoryGb = 16;
    private int diskGb = 250;

    // Credentials
    private String username;
    private String password;
    private String privateKey;
    private String passphrase;
    private String tlsCa;
    private String tlsCert;
    private String tlsKey;
    private String agentToken;
    private boolean useSudo = true;
}
