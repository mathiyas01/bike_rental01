package ro.bikerental.modules.auth.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import ro.bikerental.common.exception.ConflictException;
import ro.bikerental.common.security.JwtTokenProvider;
import ro.bikerental.common.security.UserPrincipal;
import ro.bikerental.modules.auth.dto.BootstrapOwnerRequest;
import ro.bikerental.modules.auth.dto.LoginRequest;
import ro.bikerental.modules.auth.dto.LoginResponse;
import ro.bikerental.modules.auth.dto.UserProfileDto;
import ro.bikerental.modules.auth.entity.AppUser;
import ro.bikerental.modules.auth.repository.AppUserRepository;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private AppUserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private AuthenticationManager authenticationManager;

    @Mock
    private JwtTokenProvider tokenProvider;

    private AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(userRepository, passwordEncoder, authenticationManager, tokenProvider);
    }

    @Test
    @DisplayName("Should successfully bootstrap initial owner when no users exist")
    void bootstrapOwner_success() {
        when(userRepository.count()).thenReturn(0L);
        when(userRepository.existsByEmail("owner@bikerental.ro")).thenReturn(false);
        when(passwordEncoder.encode("Password123!")).thenReturn("hashedPassword");
        when(tokenProvider.generateToken(any())).thenReturn("mock.jwt.token");
        when(tokenProvider.getExpirationMs()).thenReturn(86400000L);

        AppUser savedUser = new AppUser("owner@bikerental.ro", "hashedPassword", "Mihai Popescu", "ROLE_OWNER", "en");
        savedUser.setId(UUID.randomUUID());
        when(userRepository.save(any(AppUser.class))).thenReturn(savedUser);

        BootstrapOwnerRequest request = new BootstrapOwnerRequest("owner@bikerental.ro", "Password123!", "Mihai Popescu", "en");
        LoginResponse response = authService.bootstrapOwner(request);

        assertThat(response).isNotNull();
        assertThat(response.getAccessToken()).isEqualTo("mock.jwt.token");
        assertThat(response.getUser().getEmail()).isEqualTo("owner@bikerental.ro");
        assertThat(response.getUser().getPreferredLanguage()).isEqualTo("en");
        verify(userRepository, times(1)).save(any(AppUser.class));
    }

    @Test
    @DisplayName("Should reject bootstrap owner if an owner already exists")
    void bootstrapOwner_alreadyExists_throwsConflict() {
        when(userRepository.count()).thenReturn(1L);

        BootstrapOwnerRequest request = new BootstrapOwnerRequest("second@bikerental.ro", "Password123!", "Second Owner", "en");

        assertThatThrownBy(() -> authService.bootstrapOwner(request))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("Owner account has already been initialized");

        verify(userRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should login successfully with valid credentials and return JWT")
    void login_success() {
        UUID userId = UUID.randomUUID();
        AppUser user = new AppUser("owner@bikerental.ro", "hashedPassword", "Mihai Popescu", "ROLE_OWNER", "en");
        user.setId(userId);
        UserPrincipal principal = UserPrincipal.create(user);

        Authentication auth = mock(Authentication.class);
        when(auth.getPrincipal()).thenReturn(principal);
        when(authenticationManager.authenticate(any(UsernamePasswordAuthenticationToken.class))).thenReturn(auth);
        when(tokenProvider.generateToken(principal)).thenReturn("valid.jwt.token");
        when(tokenProvider.getExpirationMs()).thenReturn(86400000L);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        LoginRequest request = new LoginRequest("owner@bikerental.ro", "Password123!");
        LoginResponse response = authService.login(request);

        assertThat(response).isNotNull();
        assertThat(response.getAccessToken()).isEqualTo("valid.jwt.token");
        assertThat(response.getUser().getEmail()).isEqualTo("owner@bikerental.ro");
        assertThat(response.getUser().getPreferredLanguage()).isEqualTo("en");
    }

    @Test
    @DisplayName("Should reject login with bad credentials")
    void login_badCredentials_throwsException() {
        when(authenticationManager.authenticate(any(UsernamePasswordAuthenticationToken.class)))
                .thenThrow(new BadCredentialsException("Bad credentials"));

        LoginRequest request = new LoginRequest("owner@bikerental.ro", "WrongPassword");

        assertThatThrownBy(() -> authService.login(request))
                .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    @DisplayName("Should update preferred language")
    void updateLanguage_success() {
        UUID userId = UUID.randomUUID();
        AppUser user = new AppUser("owner@bikerental.ro", "hashedPassword", "Mihai Popescu", "ROLE_OWNER", "en");
        user.setId(userId);

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.save(any(AppUser.class))).thenAnswer(i -> i.getArgument(0));

        UserProfileDto updated = authService.updateLanguage(userId, "ro");

        assertThat(updated.getPreferredLanguage()).isEqualTo("ro");
        verify(userRepository).save(user);
    }
}
