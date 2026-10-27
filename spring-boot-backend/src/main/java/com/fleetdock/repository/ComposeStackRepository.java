package com.fleetdock.repository;

import com.fleetdock.entity.ComposeStackEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ComposeStackRepository extends JpaRepository<ComposeStackEntity, String> {
    List<ComposeStackEntity> findByVmId(String vmId);
}
