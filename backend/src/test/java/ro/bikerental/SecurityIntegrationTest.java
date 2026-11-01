package ro.bikerental;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("Unauthenticated request to protected endpoint /api/v1/customers should return 401 Unauthorized")
    void unauthenticatedRequest_returns401() throws Exception {
        mockMvc.perform(get("/api/v1/customers"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Unauthenticated request to protected endpoint /api/v1/bikes should return 401 Unauthorized")
    void unauthenticatedRequestToBikes_returns401() throws Exception {
        mockMvc.perform(get("/api/v1/bikes"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Public endpoint /api/v1/auth/bootstrap-owner is accessible without token")
    void bootstrapOwnerEndpoint_isPublic() throws Exception {
        // Will fail validation because body is empty, but returns 400 Bad Request, not 401 Unauthorized
        mockMvc.perform(post("/api/v1/auth/bootstrap-owner")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_FAILED"));
    }
}
