package ro.bikerental.modules.payment.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class ReversePaymentRequest {

    @NotBlank(message = "Reversal reason is mandatory for audit compliance")
    @Size(min = 5, max = 500, message = "Reason must be between 5 and 500 characters")
    private String reason;

    public ReversePaymentRequest() {}

    public ReversePaymentRequest(String reason) {
        this.reason = reason;
    }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
}
