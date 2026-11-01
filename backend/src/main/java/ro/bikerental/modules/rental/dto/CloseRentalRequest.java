package ro.bikerental.modules.rental.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

public class CloseRentalRequest {

    @NotNull(message = "Closure date is required")
    private LocalDate closureDate;

    private String notes;

    public CloseRentalRequest() {}

    public CloseRentalRequest(LocalDate closureDate, String notes) {
        this.closureDate = closureDate;
        this.notes = notes;
    }

    public LocalDate getClosureDate() { return closureDate; }
    public void setClosureDate(LocalDate closureDate) { this.closureDate = closureDate; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
