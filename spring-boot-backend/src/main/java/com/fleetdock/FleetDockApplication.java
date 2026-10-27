package com.fleetdock;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class FleetDockApplication {

    public static void main(String[] args) {
        SpringApplication.run(FleetDockApplication.class, args);
    }
}
