package com.fleetdock.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "compose_stacks")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ComposeStackEntity {

    @Id
    private String id;

    @Column(nullable = false)
    private String vmId;

    @Column(nullable = false)
    private String name;

    private String status; // running, partially_running, stopped

    @Lob
    @Column(columnDefinition = "TEXT")
    private String rawYaml;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String envVariablesJson;

    private int serviceCount;
    private int runningCount;

    private LocalDateTime lastDeployed;
}
