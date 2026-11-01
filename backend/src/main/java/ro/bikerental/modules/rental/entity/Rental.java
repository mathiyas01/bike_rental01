package ro.bikerental.modules.rental.entity;

import jakarta.persistence.*;
import ro.bikerental.modules.bike.entity.Bike;
import ro.bikerental.modules.customer.entity.Customer;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "rentals")
public class Rental {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "customer_id", nullable = false)
    private Customer customer;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "bike_id", nullable = false)
    private Bike bike;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "planned_end_date")
    private LocalDate plannedEndDate;

    @Column(name = "actual_closed_date")
    private LocalDate actualClosedDate;

    @Column(name = "weekly_rate", nullable = false, precision = 14, scale = 2)
    private BigDecimal weeklyRate;

    @Column(nullable = false, length = 3)
    private String currency = "RON";

    @Column(name = "deposit_amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal depositAmount = BigDecimal.ZERO;

    @Column(name = "deposit_currency", nullable = false, length = 3)
    private String depositCurrency = "RON";

    @Column(name = "payment_frequency", nullable = false, length = 20)
    private String paymentFrequency = "WEEKLY";

    @Column(name = "schedule_anchor_day", nullable = false, length = 15)
    private String scheduleAnchorDay = "START_DAY";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RentalStatus status = RentalStatus.ACTIVE;

    @Column(name = "terms_and_notes", columnDefinition = "TEXT")
    private String termsAndNotes;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Rental() {}

    public Rental(Customer customer, Bike bike, LocalDate startDate, LocalDate plannedEndDate,
                  BigDecimal weeklyRate, String currency, BigDecimal depositAmount, String depositCurrency,
                  String scheduleAnchorDay, String termsAndNotes) {
        this.customer = customer;
        this.bike = bike;
        this.startDate = startDate;
        this.plannedEndDate = plannedEndDate;
        this.weeklyRate = weeklyRate;
        this.currency = currency != null ? currency.toUpperCase().trim() : "RON";
        this.depositAmount = depositAmount != null ? depositAmount : BigDecimal.ZERO;
        this.depositCurrency = depositCurrency != null ? depositCurrency.toUpperCase().trim() : this.currency;
        this.scheduleAnchorDay = scheduleAnchorDay != null ? scheduleAnchorDay : "START_DAY";
        this.termsAndNotes = termsAndNotes;
        this.status = RentalStatus.ACTIVE;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public Customer getCustomer() { return customer; }
    public void setCustomer(Customer customer) { this.customer = customer; }

    public Bike getBike() { return bike; }
    public void setBike(Bike bike) { this.bike = bike; }

    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }

    public LocalDate getPlannedEndDate() { return plannedEndDate; }
    public void setPlannedEndDate(LocalDate plannedEndDate) { this.plannedEndDate = plannedEndDate; }

    public LocalDate getActualClosedDate() { return actualClosedDate; }
    public void setActualClosedDate(LocalDate actualClosedDate) { this.actualClosedDate = actualClosedDate; }

    public BigDecimal getWeeklyRate() { return weeklyRate; }
    public void setWeeklyRate(BigDecimal weeklyRate) { this.weeklyRate = weeklyRate; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public BigDecimal getDepositAmount() { return depositAmount; }
    public void setDepositAmount(BigDecimal depositAmount) { this.depositAmount = depositAmount; }

    public String getDepositCurrency() { return depositCurrency; }
    public void setDepositCurrency(String depositCurrency) { this.depositCurrency = depositCurrency; }

    public String getPaymentFrequency() { return paymentFrequency; }
    public void setPaymentFrequency(String paymentFrequency) { this.paymentFrequency = paymentFrequency; }

    public String getScheduleAnchorDay() { return scheduleAnchorDay; }
    public void setScheduleAnchorDay(String scheduleAnchorDay) { this.scheduleAnchorDay = scheduleAnchorDay; }

    public RentalStatus getStatus() { return status; }
    public void setStatus(RentalStatus status) { this.status = status; }

    public String getTermsAndNotes() { return termsAndNotes; }
    public void setTermsAndNotes(String termsAndNotes) { this.termsAndNotes = termsAndNotes; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
