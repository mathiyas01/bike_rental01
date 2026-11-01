package ro.bikerental.modules.payment.entity;

import jakarta.persistence.*;
import ro.bikerental.modules.auth.entity.AppUser;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "payment_reversals")
public class PaymentReversal {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "payment_id", nullable = false, unique = true)
    private Payment payment;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String reason;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reversed_by_user_id", nullable = false)
    private AppUser reversedByUser;

    @Column(name = "reversed_at", nullable = false)
    private Instant reversedAt = Instant.now();

    public PaymentReversal() {}

    public PaymentReversal(Payment payment, String reason, AppUser reversedByUser) {
        this.payment = payment;
        this.reason = reason;
        this.reversedByUser = reversedByUser;
        this.reversedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public Payment getPayment() { return payment; }
    public void setPayment(Payment payment) { this.payment = payment; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }

    public AppUser getReversedByUser() { return reversedByUser; }
    public void setReversedByUser(AppUser reversedByUser) { this.reversedByUser = reversedByUser; }

    public Instant getReversedAt() { return reversedAt; }
    public void setReversedAt(Instant reversedAt) { this.reversedAt = reversedAt; }
}
