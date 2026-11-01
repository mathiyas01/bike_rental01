-- Flyway Migration V2: Seed Default Business Settings
INSERT INTO business_settings (setting_key, setting_value, updated_at) VALUES
('business_name', 'Moto Rental SRL', CURRENT_TIMESTAMP),
('business_cui', 'RO12345678', CURRENT_TIMESTAMP),
('contact_phone', '+40 721 000 111', CURRENT_TIMESTAMP),
('contact_email', 'contact@motorental.ro', CURRENT_TIMESTAMP),
('address', 'Calea Victoriei 100, București, România', CURRENT_TIMESTAMP),
('default_currency', 'RON', CURRENT_TIMESTAMP),
('default_language', 'en', CURRENT_TIMESTAMP),
('business_timezone', 'Europe/Bucharest', CURRENT_TIMESTAMP)
ON CONFLICT (setting_key) DO NOTHING;
