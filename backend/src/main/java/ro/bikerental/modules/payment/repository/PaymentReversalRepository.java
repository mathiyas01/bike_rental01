package ro.bikerental.modules.payment.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import ro.bikerental.modules.payment.entity.PaymentReversal;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface PaymentReversalRepository extends JpaRepository<PaymentReversal, UUID> {
    Optional<PaymentReversal> findByPaymentId(UUID paymentId);
    boolean existsByPaymentId(UUID paymentId);
}
