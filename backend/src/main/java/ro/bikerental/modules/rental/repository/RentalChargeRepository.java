package ro.bikerental.modules.rental.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import ro.bikerental.modules.rental.entity.ChargeStatus;
import ro.bikerental.modules.rental.entity.RentalCharge;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface RentalChargeRepository extends JpaRepository<RentalCharge, UUID> {

    List<RentalCharge> findAllByRentalIdOrderByChargeSequenceAsc(UUID rentalId);

    Optional<RentalCharge> findFirstByRentalIdOrderByChargeSequenceDesc(UUID rentalId);

    List<RentalCharge> findAllByRentalCustomerIdAndCurrencyAndStatusInOrderByDueDateAsc(
            UUID customerId, String currency, Collection<ChargeStatus> statuses);

    List<RentalCharge> findAllByRentalIdAndStatusInOrderByDueDateAsc(
            UUID rentalId, Collection<ChargeStatus> statuses);

    @Query("SELECT rc FROM RentalCharge rc " +
           "JOIN FETCH rc.rental r " +
           "JOIN FETCH r.customer c " +
           "WHERE rc.dueDate <= :date AND rc.status IN (:statuses) " +
           "ORDER BY rc.dueDate ASC")
    List<RentalCharge> findOverdueOrDueByDate(
            @Param("date") LocalDate date,
            @Param("statuses") Collection<ChargeStatus> statuses
    );

    @Query("SELECT rc FROM RentalCharge rc " +
           "JOIN FETCH rc.rental r " +
           "JOIN FETCH r.customer c " +
           "WHERE (:status IS NULL OR rc.status = :status) " +
           "AND (:currency IS NULL OR rc.currency = :currency) " +
           "AND (:customerId IS NULL OR c.id = :customerId) " +
           "AND (:rentalId IS NULL OR r.id = :rentalId)")
    Page<RentalCharge> searchCharges(
            @Param("status") ChargeStatus status,
            @Param("currency") String currency,
            @Param("customerId") UUID customerId,
            @Param("rentalId") UUID rentalId,
            Pageable pageable
    );

    @Query("SELECT rc.currency, COALESCE(SUM(rc.amount), 0) FROM RentalCharge rc " +
           "WHERE rc.rental.customer.id = :customerId " +
           "GROUP BY rc.currency")
    List<Object[]> sumChargesByCustomerGroupedByCurrency(@Param("customerId") UUID customerId);
}
