package ro.bikerental.common.security;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import ro.bikerental.modules.auth.entity.AppUser;

import java.util.Collection;
import java.util.Collections;
import java.util.UUID;

public class UserPrincipal implements UserDetails {
    private final UUID id;
    private final String email;
    private final String password;
    private final String fullName;
    private final String role;
    private final String preferredLanguage;
    private final boolean active;
    private final Collection<? extends GrantedAuthority> authorities;

    public UserPrincipal(UUID id, String email, String password, String fullName, String role, String preferredLanguage, boolean active) {
        this.id = id;
        this.email = email;
        this.password = password;
        this.fullName = fullName;
        this.role = role;
        this.preferredLanguage = preferredLanguage;
        this.active = active;
        this.authorities = Collections.singletonList(new SimpleGrantedAuthority(role));
    }

    public static UserPrincipal create(AppUser user) {
        return new UserPrincipal(
                user.getId(),
                user.getEmail(),
                user.getPasswordHash(),
                user.getFullName(),
                user.getRole(),
                user.getPreferredLanguage(),
                user.isActive()
        );
    }

    public UUID getId() { return id; }
    public String getFullName() { return fullName; }
    public String getRole() { return role; }
    public String getPreferredLanguage() { return preferredLanguage; }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() { return authorities; }

    @Override
    public String getPassword() { return password; }

    @Override
    public String getUsername() { return email; }

    @Override
    public boolean isAccountNonExpired() { return true; }

    @Override
    public boolean isAccountNonLocked() { return active; }

    @Override
    public boolean isCredentialsNonExpired() { return true; }

    @Override
    public boolean isEnabled() { return active; }
}
