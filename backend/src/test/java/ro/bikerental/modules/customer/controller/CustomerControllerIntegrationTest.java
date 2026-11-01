package ro.bikerental.modules.customer.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import ro.bikerental.modules.customer.dto.CreateCustomerRequest;
import ro.bikerental.modules.customer.dto.CustomerDto;
import ro.bikerental.modules.customer.service.CustomerService;

import java.time.LocalDate;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(CustomerController.class)
@AutoConfigureMockMvc(addFilters = false)
class CustomerControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private CustomerService customerService;

    @MockitoBean
    private ro.bikerental.modules.payment.service.PaymentService paymentService;

    @Test
    @DisplayName("POST /api/v1/customers with valid body returns 201 Created")
    void createCustomer_validBody_returns201() throws Exception {
        CreateCustomerRequest request = new CreateCustomerRequest(
                "Andrei Vasilescu",
                "+40721234567",
                "andrei@test.ro",
                "1940512123456",
                "B00123456Z",
                "A,B",
                LocalDate.of(2030, 8, 20),
                "București",
                "Notes"
        );

        CustomerDto responseDto = new CustomerDto();
        responseDto.setId(UUID.randomUUID());
        responseDto.setFullName("Andrei Vasilescu");
        responseDto.setPhone("+40721234567");

        when(customerService.createCustomer(any())).thenReturn(responseDto);

        mockMvc.perform(post("/api/v1/customers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fullName").value("Andrei Vasilescu"))
                .andExpect(jsonPath("$.phone").value("+40721234567"));
    }

    @Test
    @DisplayName("POST /api/v1/customers with missing required fields returns 400 Bad Request with validation errors")
    void createCustomer_validationFailure_returns400() throws Exception {
        CreateCustomerRequest invalidRequest = new CreateCustomerRequest();

        mockMvc.perform(post("/api/v1/customers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalidRequest)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.validationErrors").isArray());
    }

    @Test
    @DisplayName("GET /api/v1/customers/{id} returns customer details")
    void getCustomer_success() throws Exception {
        UUID id = UUID.randomUUID();
        CustomerDto dto = new CustomerDto();
        dto.setId(id);
        dto.setFullName("Mihai Radu");
        dto.setPhone("+40733111222");

        when(customerService.getCustomerById(id)).thenReturn(dto);

        mockMvc.perform(get("/api/v1/customers/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.fullName").value("Mihai Radu"));
    }
}
