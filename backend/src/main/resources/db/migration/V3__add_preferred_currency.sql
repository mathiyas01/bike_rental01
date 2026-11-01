-- Store the currency used for dashboard and payment summaries.
ALTER TABLE app_users
    ADD COLUMN preferred_currency VARCHAR(3) NOT NULL DEFAULT 'RON';
