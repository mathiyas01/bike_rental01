package ro.bikerental.modules.inventory.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import ro.bikerental.modules.inventory.entity.StockMovement;
import ro.bikerental.modules.inventory.entity.StockMovementType;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface StockMovementRepository extends JpaRepository<StockMovement, UUID> {

    List<StockMovement> findAllByPartIdOrderByCreatedAtDesc(UUID partId);

    @Query("SELECT sm FROM StockMovement sm " +
           "JOIN FETCH sm.part p " +
           "JOIN FETCH sm.recordedByUser u " +
           "WHERE (:partId IS NULL OR p.id = :partId) " +
           "AND (:type IS NULL OR sm.movementType = :type) " +
           "AND (:startDate IS NULL OR sm.createdAt >= :startDate) " +
           "AND (:endDate IS NULL OR sm.createdAt <= :endDate)")
    Page<StockMovement> searchStockMovements(
            @Param("partId") UUID partId,
            @Param("type") StockMovementType type,
            @Param("startDate") Instant startDate,
            @Param("endDate") Instant endDate,
            Pageable pageable
    );
}

