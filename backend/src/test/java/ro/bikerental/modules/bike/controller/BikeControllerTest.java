package ro.bikerental.modules.bike.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import ro.bikerental.modules.bike.dto.BikeDto;
import ro.bikerental.modules.bike.dto.CreateBikeRequest;
import ro.bikerental.modules.bike.dto.UpdateBikeStatusRequest;
import ro.bikerental.modules.bike.entity.BikeStatus;
import ro.bikerental.modules.bike.service.BikeService;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(BikeController.class)
@AutoConfigureMockMvc(addFilters = false)
class BikeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private BikeService bikeService;

    @Test
    @DisplayName("POST /api/v1/bikes with valid payload returns 201 Created")
    void createBike_validPayload_returns201() throws Exception {
        CreateBikeRequest request = new CreateBikeRequest(
                "B 777 BIK",
                "JH2PC37053M000001",
                "Honda",
                "PCX 125",
                2024,
                BigDecimal.valueOf(100.0),
                LocalDate.of(2027, 5, 15),
                LocalDate.of(2027, 4, 10),
                null,
                BikeStatus.AVAILABLE,
                "Clean bike"
        );

        BikeDto responseDto = new BikeDto();
        responseDto.setId(UUID.randomUUID());
        responseDto.setRegistrationNumber("B 777 BIK");
        responseDto.setStatus(BikeStatus.AVAILABLE);

        when(bikeService.createBike(any())).thenReturn(responseDto);

        mockMvc.perform(post("/api/v1/bikes")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.registrationNumber").value("B 777 BIK"))
                .andExpect(jsonPath("$.status").value("AVAILABLE"));
    }

    @Test
    @DisplayName("POST /api/v1/bikes with invalid year returns 400 Bad Request")
    void createBike_invalidYear_returns400() throws Exception {
        CreateBikeRequest invalid = new CreateBikeRequest(
                "B 777 BIK", "VIN12345", "Honda", "PCX", 1850, BigDecimal.ZERO, null, null, null, BikeStatus.AVAILABLE, null
        );

        mockMvc.perform(post("/api/v1/bikes")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalid)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("PATCH /api/v1/bikes/{id}/status updates operational status")
    void updateBikeStatus_success() throws Exception {
        UUID id = UUID.randomUUID();
        UpdateBikeStatusRequest request = new UpdateBikeStatusRequest(BikeStatus.IN_SERVICE);

        BikeDto responseDto = new BikeDto();
        responseDto.setId(id);
        responseDto.setStatus(BikeStatus.IN_SERVICE);

        when(bikeService.updateBikeStatus(id, BikeStatus.IN_SERVICE)).thenReturn(responseDto);

        mockMvc.perform(patch("/api/v1/bikes/{id}/status", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_SERVICE"));
    }
}
