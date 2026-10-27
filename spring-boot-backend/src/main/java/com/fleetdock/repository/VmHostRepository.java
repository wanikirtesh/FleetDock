package com.fleetdock.repository;

import com.fleetdock.entity.VmHost;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface VmHostRepository extends JpaRepository<VmHost, String> {
    Optional<VmHost> findByIp(String ip);
}
