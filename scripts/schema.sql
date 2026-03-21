-- =============================================================
--  LandlordHQ — MySQL Schema
--  Run: mysql -u root -p < scripts/schema.sql
-- =============================================================

CREATE DATABASE IF NOT EXISTS landlordhq
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE landlordhq;

-- -------------------------------------------------------------
-- 1. admins
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id           VARCHAR(36)  NOT NULL,
  username     VARCHAR(50)  NOT NULL,
  telegram_id  VARCHAR(50)  DEFAULT NULL,
  name         VARCHAR(100) NOT NULL DEFAULT 'Admin',
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_username (username),
  KEY idx_admins_telegram_id (telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 2. sessions
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  token       VARCHAR(255) NOT NULL,
  admin_id    VARCHAR(36)  NOT NULL,
  expires_at  DATETIME     NOT NULL,
  PRIMARY KEY (token),
  KEY idx_sessions_admin_id (admin_id),
  KEY idx_sessions_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 3. otps
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otps (
  telegram_id  VARCHAR(50)  NOT NULL,
  code         VARCHAR(255) NOT NULL,
  expires_at   DATETIME     NOT NULL,
  attempts     INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (telegram_id),
  KEY idx_otps_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 4. properties
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS properties (
  id           VARCHAR(36)  NOT NULL,
  admin_id     VARCHAR(36)  NOT NULL,
  name         VARCHAR(100) NOT NULL,
  address      VARCHAR(200) NOT NULL DEFAULT '',
  city         VARCHAR(100) NOT NULL DEFAULT '',
  state        VARCHAR(100) NOT NULL DEFAULT '',
  zip          VARCHAR(20)  NOT NULL DEFAULT '',
  units        INT          NOT NULL DEFAULT 0,
  type         VARCHAR(50)  NOT NULL DEFAULT '',
  status       VARCHAR(50)  NOT NULL DEFAULT 'Active',
  description  TEXT         DEFAULT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_properties_admin_id (admin_id),
  KEY idx_properties_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 5. tenants
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id                VARCHAR(36)    NOT NULL,
  admin_id          VARCHAR(36)    NOT NULL,
  link_code         VARCHAR(50)    DEFAULT NULL,
  unit              VARCHAR(50)    NOT NULL,
  name              VARCHAR(100)   NOT NULL,
  email             VARCHAR(200)   DEFAULT NULL,
  phone             VARCHAR(50)    DEFAULT NULL,
  lease_amount      DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
  advance_payment   DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
  security_deposit  DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
  prepaid_balance   DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
  property_id       VARCHAR(36)    DEFAULT NULL,
  move_in_date      DATE           DEFAULT NULL,
  lease_end_date    DATE           DEFAULT NULL,
  rent_due_day      INT            NOT NULL DEFAULT 1,
  status            VARCHAR(50)    NOT NULL DEFAULT 'Active',
  remarks           TEXT           DEFAULT NULL,
  telegram_id       VARCHAR(50)    DEFAULT NULL,
  is_overdue        TINYINT(1)     NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenants_unit_admin (unit, admin_id),
  KEY idx_tenants_admin_id (admin_id),
  KEY idx_tenants_property_id (property_id),
  KEY idx_tenants_status (status),
  KEY idx_tenants_telegram_id (telegram_id),
  KEY idx_tenants_link_code (link_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 6. payments
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id           VARCHAR(36)   NOT NULL,
  admin_id     VARCHAR(36)   NOT NULL,
  unit         VARCHAR(50)   NOT NULL DEFAULT '',
  tenant_name  VARCHAR(100)  DEFAULT NULL,
  tenant_id    VARCHAR(36)   DEFAULT NULL,
  amount       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  method       VARCHAR(100)  NOT NULL DEFAULT '',
  status       VARCHAR(50)   NOT NULL DEFAULT 'pending',
  timestamp    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes        TEXT          DEFAULT NULL,
  file_id      VARCHAR(255)  DEFAULT NULL,
  media_type   VARCHAR(50)   DEFAULT NULL,
  type         VARCHAR(50)   DEFAULT NULL,
  property_id  VARCHAR(36)   DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_payments_admin_id (admin_id),
  KEY idx_payments_unit (unit),
  KEY idx_payments_status (status),
  KEY idx_payments_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 7. tickets
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
  id           VARCHAR(36)  NOT NULL,
  admin_id     VARCHAR(36)  NOT NULL,
  unit         VARCHAR(50)  NOT NULL,
  tenant_name  VARCHAR(100) DEFAULT NULL,
  issue        TEXT         NOT NULL,
  status       VARCHAR(50)  NOT NULL DEFAULT 'open',
  reported     TINYINT(1)   NOT NULL DEFAULT 0,
  priority     VARCHAR(20)  DEFAULT NULL,
  notes        TEXT         DEFAULT NULL,
  timestamp    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at    DATETIME     DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_tickets_admin_id (admin_id),
  KEY idx_tickets_unit (unit),
  KEY idx_tickets_status (status),
  KEY idx_tickets_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 8. ticket_media
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_media (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id  VARCHAR(36)     NOT NULL,
  type       VARCHAR(20)     NOT NULL,
  file_id    VARCHAR(255)    NOT NULL,
  PRIMARY KEY (id),
  KEY idx_ticket_media_ticket_id (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 9. expenses
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id           VARCHAR(36)   NOT NULL,
  admin_id     VARCHAR(36)   NOT NULL,
  timestamp    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  category     VARCHAR(100)  NOT NULL DEFAULT '',
  amount       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  description  TEXT          NOT NULL DEFAULT '',
  property_id  VARCHAR(36)   DEFAULT NULL,
  vendor       VARCHAR(100)  DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_expenses_admin_id (admin_id),
  KEY idx_expenses_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 10. settings
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  id                        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id                  VARCHAR(36)  NOT NULL,
  currency                  VARCHAR(20)  DEFAULT NULL,
  rent_reminder_days_before DECIMAL(5,2) DEFAULT NULL,
  rent_check_day            DECIMAL(5,2) DEFAULT NULL,
  fixer_id                  VARCHAR(50)  DEFAULT NULL,
  property_name             VARCHAR(200) DEFAULT NULL,
  auto_deduct               TINYINT(1)   DEFAULT NULL,
  timezone                  VARCHAR(100) DEFAULT NULL,
  late_fee_enabled          TINYINT(1)   DEFAULT NULL,
  late_fee_amount           DECIMAL(12,2) DEFAULT NULL,
  late_fee_grace_days       DECIMAL(5,2) DEFAULT NULL,
  start_text                TEXT         DEFAULT NULL,
  rules_text                TEXT         DEFAULT NULL,
  clearance_text            TEXT         DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_settings_admin_id (admin_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 11. invites
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invites (
  code        VARCHAR(50)  NOT NULL,
  status      VARCHAR(20)  NOT NULL DEFAULT 'active',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_by  VARCHAR(100) DEFAULT NULL,
  claimed_at  DATETIME     DEFAULT NULL,
  PRIMARY KEY (code),
  KEY idx_invites_status (status),
  KEY idx_invites_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 12. audit_log
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id         VARCHAR(36)  NOT NULL,
  admin_id   VARCHAR(36)  NOT NULL,
  action     VARCHAR(100) NOT NULL,
  resource   VARCHAR(100) NOT NULL,
  details    JSON         DEFAULT NULL,
  timestamp  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_log_admin_id (admin_id),
  KEY idx_audit_log_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- 13. pending_claims  (used by bot.js for Telegram /claim flow)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_claims (
  username    VARCHAR(100) NOT NULL,
  telegram_id VARCHAR(50)  NOT NULL,
  code        VARCHAR(50)  NOT NULL,
  expires_at  DATETIME     NOT NULL,
  PRIMARY KEY (username),
  KEY idx_pending_claims_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
