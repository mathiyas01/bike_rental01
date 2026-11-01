package ro.bikerental.modules.auth.dto;

import ro.bikerental.modules.auth.entity.AppUser;

import java.util.UUID;

public class UserProfileDto {
    private UUID id;
    private String email;
    private String fullName;
    private String role;
    private String preferredLanguage;

    public UserProfileDto() {}

    public UserProfileDto(UUID id, String email, String fullName, String role, String preferredLanguage) {
        this.id = id;
        this.email = email;
        this.fullName = fullName;
        this.role = role;
        this.preferredLanguage = preferredLanguage;
    }

    public static UserProfileDto fromEntity(AppUser user) {
        return new UserProfileDto(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getRole(),
                user.getPreferredLanguage()
        );
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getPreferredLanguage() { return preferredLanguage; }
    public void setPreferredLanguage(String preferredLanguage) { this.preferredLanguage = preferredLanguage; }
}
