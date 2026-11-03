ALTER TABLE bikes
    ADD COLUMN service_interval_days INT NOT NULL DEFAULT 30
        CHECK (service_interval_days > 0),
    ADD COLUMN next_service_due_date DATE;
