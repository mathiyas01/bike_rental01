package ro.bikerental.modules.servicing.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import ro.bikerental.modules.servicing.entity.ServiceRecord;
import ro.bikerental.modules.servicing.entity.ServiceStatus;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Repository
public interface ServiceRecordRepository extends JpaRepository<ServiceRecord, UUID> {

    List<ServiceRecord> findAllByBikeIdOrderByServiceDateDesc(UUID bikeId);

    @Query("SELECT s FROM ServiceRecord s " +
           "JOIN FETCH s.bike b " +
           "WHERE (:bikeId IS NULL OR b.id = :bikeId) " +
           "AND (:status IS NULL OR s.status = :status) " +
           "AND (:startDate IS NULL OR s.serviceDate >= :startDate) " +
           "AND (:endDate IS NULL OR s.serviceDate <= :endDate)")
    Page<ServiceRecord> searchServices(
            @Param("bikeId") UUID bikeId,
            @Param("status") ServiceStatus status,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate,
            Pageable pageable
    );

    @Query("SELECT s FROM ServiceRecord s " +
           "JOIN FETCH s.bike b " +
           "WHERE s.nextServiceDueDate <= :targetDate " +
           "ORDER BY s.nextServiceDueDate ASC")
    List<ServiceRecord> findDueServicesByDate(@Param("targetDate") LocalDate targetDate);
}

