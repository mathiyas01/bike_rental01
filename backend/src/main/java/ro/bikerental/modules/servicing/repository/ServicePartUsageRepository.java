package ro.bikerental.modules.servicing.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import ro.bikerental.modules.servicing.entity.ServicePartUsage;

import java.util.List;
import java.util.UUID;

@Repository
public interface ServicePartUsageRepository extends JpaRepository<ServicePartUsage, UUID> {

    List<ServicePartUsage> findAllByServiceRecordId(UUID serviceRecordId);

    List<ServicePartUsage> findAllByPartId(UUID partId);
}

