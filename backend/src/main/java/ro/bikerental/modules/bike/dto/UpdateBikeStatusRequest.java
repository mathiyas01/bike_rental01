package ro.bikerental.modules.bike.dto;

import jakarta.validation.constraints.NotNull;
import ro.bikerental.modules.bike.entity.BikeStatus;

public class UpdateBikeStatusRequest {

    @NotNull(message = "New bike status is required")
    private BikeStatus status;

    public UpdateBikeStatusRequest() {}

    public UpdateBikeStatusRequest(BikeStatus status) {
        this.status = status;
    }

    public BikeStatus getStatus() { return status; }
    public void setStatus(BikeStatus status) { this.status = status; }
}
