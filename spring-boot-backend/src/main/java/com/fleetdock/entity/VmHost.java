package com.fleetdock.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "vm_hosts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VmHost {

    @Id
    private String id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String ip;

    @Column(nullable = false)
    private int port;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AuthType authType;

    @Column(nullable = false)
    private String environment; // Production, Staging, Development, Edge

    private String os;
    private String arch;
    private String dockerVersion;
    private String apiVersion;

    private String status; // online, offline, error
    private int pingMs;

    private int cpuCores;
    private int memoryGb;
    private int diskGb;

    private double cpuUsagePercent;
    private double memoryUsedPercent;
    private double diskUsedPercent;

    @Embedded
    private AuthCredential authCredential;

    private LocalDateTime createdAt;
    private LocalDateTime lastChecked;

    public enum AuthType {
        SSH_KEY,
        PASSWORD,
        DOCKER_SOCKET,
        AGENT_TOKEN
    }

    @PrePersist
    public void onPrePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
        if (lastChecked == null) lastChecked = LocalDateTime.now();
    }
}
