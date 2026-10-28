package com.fleetdock.repository;

import com.fleetdock.entity.VmHost;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface VmHostRepository extends JpaRepository<VmHost, String> {
    List<VmHost> findByOwnerId(String ownerId);

    Optional<VmHost> findByIp(String ip);
}
