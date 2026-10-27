package com.fleetdock.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ComposeVariableDto {
    private String key;
    private String value;
    private boolean isSecret;
    private String description;
}
