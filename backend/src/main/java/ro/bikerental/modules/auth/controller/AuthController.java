package ro.bikerental.modules.auth.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import ro.bikerental.common.security.UserPrincipal;
import ro.bikerental.modules.auth.dto.*;
import ro.bikerental.modules.auth.service.AuthService;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Authentication", description = "Owner authentication and account settings")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    @Operation(summary = "Authenticate owner and issue JWT token")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    // ----- DEV ONLY: Reset password for an existing user (use in local/debug environment) -----
    @PostMapping("/reset-password")
    @Operation(summary = "Reset password for a user (development helper)"
        + ". This endpoint should be removed or secured in production.")
    public ResponseEntity<Void> resetPassword(@Valid @RequestBody LoginRequest request) {
        authService.resetPassword(request.getEmail(), request.getPassword());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/bootstrap-owner")
    @Operation(summary = "Setup initial owner account (allowed only once on blank database)")
    public ResponseEntity<LoginResponse> bootstrapOwner(@Valid @RequestBody BootstrapOwnerRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.bootstrapOwner(request));
    }

    @GetMapping("/profile")
    @Operation(summary = "Get current authenticated user profile")
    public ResponseEntity<UserProfileDto> getProfile(@AuthenticationPrincipal UserPrincipal userPrincipal) {
        return ResponseEntity.ok(authService.getProfile(userPrincipal.getId()));
    }

    @PatchMapping("/profile/language")
    @Operation(summary = "Update preferred display language (en or ro)")
    public ResponseEntity<UserProfileDto> updateLanguage(
            @AuthenticationPrincipal UserPrincipal userPrincipal,
            @Valid @RequestBody UpdateLanguageRequest request) {
        return ResponseEntity.ok(authService.updateLanguage(userPrincipal.getId(), request.getPreferredLanguage()));
    }
}
