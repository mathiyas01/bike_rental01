package ro.bikerental.modules.auth;

import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import jakarta.transaction.Transactional;

import org.springframework.security.crypto.password.PasswordEncoder;
import ro.bikerental.modules.auth.entity.AppUser;
import ro.bikerental.modules.auth.repository.AppUserRepository;

/**
 * Development‑only data initializer.
 *
 * When the "dev" profile is active, this runner will clear the `app_user` table
 * and insert a fresh owner account with known credentials.
 * This is useful for quickly resetting the DB during local testing.
 */
@Component
@Transactional
public class DevDataInitializer implements CommandLineRunner {

    private final AppUserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public DevDataInitializer(AppUserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        // Ensure a fresh owner account exists. If one already exists, skip creation.
        String email = "admin@bikerental.ro";
        if (userRepository.existsByEmail(email)) {
            System.out.println("[DevDataInitializer] Owner account already exists, skipping creation.");
            return;
        }

        // Create a new owner account
        AppUser owner = new AppUser(
                email,
                passwordEncoder.encode("Admin123!"),
                "Demo Owner",
                "ROLE_OWNER",
                "en");
        userRepository.save(owner);
        System.out.println("[DevDataInitializer] Created fresh owner account (admin@bikerental.ro / Admin123!)");
    }
}
