package ro.bikerental.modules.payment.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import ro.bikerental.modules.payment.entity.Payment;
import ro.bikerental.modules.payment.entity.PaymentMethod;
import ro.bikerental.modules.payment.entity.PaymentStatus;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Repository
public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    List<Payment> findAllByCustomerIdOrderByPaymentDateDesc(UUID customerId);

    List<Payment> findAllByRentalIdOrderByPaymentDateDesc(UUID rentalId);

    @Query("SELECT p FROM Payment p " +
           "JOIN FETCH p.customer c " +
           "WHERE (:status IS NULL OR p.status = :status) " +
           "AND (:currency IS NULL OR p.currency = :currency) " +
           "AND (:method IS NULL OR p.paymentMethod = :method) " +
           "AND (:customerId IS NULL OR c.id = :customerId) " +
           "AND (:startDate IS NULL OR p.paymentDate >= :startDate) " +
           "AND (:endDate IS NULL OR p.paymentDate <= :endDate)")
    Page<Payment> searchPayments(
            @Param("status") PaymentStatus status,
            @Param("currency") String currency,
            @Param("method") PaymentMethod method,
            @Param("customerId") UUID customerId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate,
            Pageable pageable
    );

    @Query("SELECT p.currency, SUM(p.amount) FROM Payment p " +
           "WHERE p.status = 'CONFIRMED' " +
           "AND p.paymentDate >= :startDate " +
           "AND p.paymentDate <= :endDate " +
           "GROUP BY p.currency")
    List<Object[]> sumConfirmedPaymentsByCurrency(
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate
    );

    @Query("SELECT p.currency, COALESCE(SUM(p.amount), 0) FROM Payment p " +
           "WHERE p.customer.id = :customerId AND p.status = 'CONFIRMED' " +
           "GROUP BY p.currency")
    List<Object[]> sumConfirmedPaymentsByCustomerGroupedByCurrency(@Param("customerId") UUID customerId);
}
