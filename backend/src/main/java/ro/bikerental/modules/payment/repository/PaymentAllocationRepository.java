package ro.bikerental.modules.payment.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import ro.bikerental.modules.payment.entity.PaymentAllocation;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Repository
public interface PaymentAllocationRepository extends JpaRepository<PaymentAllocation, UUID> {

    List<PaymentAllocation> findAllByRentalChargeId(UUID rentalChargeId);

    List<PaymentAllocation> findAllByPaymentId(UUID paymentId);

    @Query("SELECT COALESCE(SUM(pa.allocatedAmount), 0) FROM PaymentAllocation pa " +
           "WHERE pa.rentalCharge.id = :chargeId AND pa.payment.status = 'CONFIRMED'")
    BigDecimal sumAllocatedForCharge(@Param("chargeId") UUID chargeId);

    @Query("SELECT pa.rentalCharge.id, COALESCE(SUM(pa.allocatedAmount), 0) FROM PaymentAllocation pa " +
           "WHERE pa.rentalCharge.id IN (:chargeIds) AND pa.payment.status = 'CONFIRMED' " +
           "GROUP BY pa.rentalCharge.id")
    List<Object[]> sumAllocatedForCharges(@Param("chargeIds") List<UUID> chargeIds);
}
