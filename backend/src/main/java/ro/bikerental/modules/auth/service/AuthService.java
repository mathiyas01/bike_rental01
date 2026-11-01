package ro.bikerental.modules.auth.service;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ro.bikerental.common.exception.ConflictException;
import ro.bikerental.common.exception.ResourceNotFoundException;
import ro.bikerental.common.security.JwtTokenProvider;
import ro.bikerental.common.security.UserPrincipal;
import ro.bikerental.modules.auth.dto.BootstrapOwnerRequest;
import ro.bikerental.modules.auth.dto.LoginRequest;
import ro.bikerental.modules.auth.dto.LoginResponse;
import ro.bikerental.modules.auth.dto.UserProfileDto;
import ro.bikerental.modules.auth.entity.AppUser;
import ro.bikerental.modules.auth.repository.AppUserRepository;

import java.util.UUID;

@Service
public class AuthService {

        private final AppUserRepository userRepository;
        private final PasswordEncoder passwordEncoder;
        private final AuthenticationManager authenticationManager;
        private final JwtTokenProvider tokenProvider;

        public AuthService(AppUserRepository userRepository,
                        PasswordEncoder passwordEncoder,
                        AuthenticationManager authenticationManager,
                        JwtTokenProvider tokenProvider) {
                this.userRepository = userRepository;
                this.passwordEncoder = passwordEncoder;
                this.authenticationManager = authenticationManager;
                this.tokenProvider = tokenProvider;
        }

        @Transactional
        public void resetPassword(String email, String rawPassword) {
                AppUser user = userRepository.findByEmail(email.toLowerCase().trim())
                                .orElseThrow(() -> new ResourceNotFoundException("User", email));
                String encoded = passwordEncoder.encode(rawPassword);
                user.setPasswordHash(encoded);
                userRepository.save(user);
        }

        @Transactional
        public LoginResponse login(LoginRequest request) {
                Authentication authentication = authenticationManager.authenticate(
                                new UsernamePasswordAuthenticationToken(
                                                request.getEmail().toLowerCase().trim(),
                                                request.getPassword()));
                SecurityContextHolder.getContext().setAuthentication(authentication);
                UserPrincipal userPrincipal = (UserPrincipal) authentication.getPrincipal();
                String token = tokenProvider.generateToken(userPrincipal);

                AppUser user = userRepository.findById(userPrincipal.getId())
                                .orElseThrow(() -> new ResourceNotFoundException("User", userPrincipal.getId()));

                return new LoginResponse(
                                token,
                                tokenProvider.getExpirationMs() / 1000,
                                UserProfileDto.fromEntity(user));
        }

        @Transactional
        public LoginResponse bootstrapOwner(BootstrapOwnerRequest request) {
                if (userRepository.count() > 0) {
                        throw new ConflictException(
                                        "Owner account has already been initialized. Please use login instead.");
                }
                String email = request.getEmail().toLowerCase().trim();
                if (userRepository.existsByEmail(email)) {
                        throw new ConflictException("User with email already exists");
                }
                AppUser owner = new AppUser(
                                email,
                                passwordEncoder.encode(request.getPassword()),
                                request.getFullName().trim(),
                                "ROLE_OWNER",
                                request.getPreferredLanguage() != null ? request.getPreferredLanguage() : "en");
                AppUser savedUser = userRepository.save(owner);
                UserPrincipal principal = UserPrincipal.create(savedUser);
                String token = tokenProvider.generateToken(principal);
                return new LoginResponse(
                                token,
                                tokenProvider.getExpirationMs() / 1000,
                                UserProfileDto.fromEntity(savedUser));
        }

        @Transactional(readOnly = true)
        public UserProfileDto getProfile(UUID userId) {
                AppUser user = userRepository.findById(userId)
                                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
                return UserProfileDto.fromEntity(user);
        }

        @Transactional
        public UserProfileDto updateLanguage(UUID userId, String preferredLanguage) {
                AppUser user = userRepository.findById(userId)
                                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
                user.setPreferredLanguage(preferredLanguage);
                AppUser updated = userRepository.save(user);
                return UserProfileDto.fromEntity(updated);
        }

        @Transactional
        public UserProfileDto updateCurrency(UUID userId, String preferredCurrency) {
                AppUser user = userRepository.findById(userId)
                                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
                user.setPreferredCurrency(preferredCurrency);
                return UserProfileDto.fromEntity(userRepository.save(user));
        }

}
