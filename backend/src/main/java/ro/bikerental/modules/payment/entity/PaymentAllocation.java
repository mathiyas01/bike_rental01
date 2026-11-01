package ro.bikerental.modules.payment.entity;

import jakarta.persistence.*;
import ro.bikerental.modules.rental.entity.RentalCharge;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "payment_allocations")
public class PaymentAllocation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "payment_id", nullable = false)
    private Payment payment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rental_charge_id", nullable = false)
    private RentalCharge rentalCharge;

    @Column(name = "allocated_amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal allocatedAmount;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(name = "allocated_at", nullable = false)
    private Instant allocatedAt = Instant.now();

    public PaymentAllocation() {}

    public PaymentAllocation(Payment payment, RentalCharge rentalCharge, BigDecimal allocatedAmount, String currency) {
        this.payment = payment;
        this.rentalCharge = rentalCharge;
        this.allocatedAmount = allocatedAmount;
        this.currency = currency != null ? currency.toUpperCase().trim() : payment.getCurrency();
        this.allocatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public Payment getPayment() { return payment; }
    public void setPayment(Payment payment) { this.payment = payment; }

    public RentalCharge getRentalCharge() { return rentalCharge; }
    public void setRentalCharge(RentalCharge rentalCharge) { this.rentalCharge = rentalCharge; }

    public BigDecimal getAllocatedAmount() { return allocatedAmount; }
    public void setAllocatedAmount(BigDecimal allocatedAmount) { this.allocatedAmount = allocatedAmount; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public Instant getAllocatedAt() { return allocatedAt; }
    public void setAllocatedAt(Instant allocatedAt) { this.allocatedAt = allocatedAt; }
}
