package ro.bikerental.modules.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class UpdateLanguageRequest {

    @NotBlank(message = "Preferred language is required")
    @Pattern(regexp = "^(en|ro)$", message = "Language must be either 'en' or 'ro'")
    private String preferredLanguage;

    public UpdateLanguageRequest() {}

    public UpdateLanguageRequest(String preferredLanguage) {
        this.preferredLanguage = preferredLanguage;
    }

    public String getPreferredLanguage() { return preferredLanguage; }
    public void setPreferredLanguage(String preferredLanguage) { this.preferredLanguage = preferredLanguage; }
}
