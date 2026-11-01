package ro.bikerental.modules.rental.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "rental_charges", uniqueConstraints = {
        @UniqueConstraint(name = "uq_rental_charge_seq", columnNames = {"rental_id", "charge_sequence"})
})
public class RentalCharge {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rental_id", nullable = false)
    private Rental rental;

    @Column(name = "charge_sequence", nullable = false)
    private int chargeSequence;

    @Column(name = "period_start_date", nullable = false)
    private LocalDate periodStartDate;

    @Column(name = "period_end_date", nullable = false)
    private LocalDate periodEndDate;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, length = 3)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ChargeStatus status = ChargeStatus.UNPAID;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public RentalCharge() {}

    public RentalCharge(Rental rental, int chargeSequence, LocalDate periodStartDate,
                        LocalDate periodEndDate, LocalDate dueDate, BigDecimal amount,
                        String currency, String notes) {
        this.rental = rental;
        this.chargeSequence = chargeSequence;
        this.periodStartDate = periodStartDate;
        this.periodEndDate = periodEndDate;
        this.dueDate = dueDate;
        this.amount = amount;
        this.currency = currency != null ? currency.toUpperCase().trim() : rental.getCurrency();
        this.notes = notes;
        this.status = ChargeStatus.UNPAID;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public Rental getRental() { return rental; }
    public void setRental(Rental rental) { this.rental = rental; }

    public int getChargeSequence() { return chargeSequence; }
    public void setChargeSequence(int chargeSequence) { this.chargeSequence = chargeSequence; }

    public LocalDate getPeriodStartDate() { return periodStartDate; }
    public void setPeriodStartDate(LocalDate periodStartDate) { this.periodStartDate = periodStartDate; }

    public LocalDate getPeriodEndDate() { return periodEndDate; }
    public void setPeriodEndDate(LocalDate periodEndDate) { this.periodEndDate = periodEndDate; }

    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public ChargeStatus getStatus() { return status; }
    public void setStatus(ChargeStatus status) { this.status = status; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
