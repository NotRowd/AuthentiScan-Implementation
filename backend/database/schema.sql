-- AuthentiScan database schema
CREATE DATABASE IF NOT EXISTS authentiscan_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE authentiscan_db;

CREATE TABLE IF NOT EXISTS users (
  user_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS subscription_plans (
  plan_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NULL,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  scan_limit INT UNSIGNED NULL,
  billing_cycle ENUM('free', 'monthly', 'yearly') NOT NULL DEFAULT 'free',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

  -- Connects a user to a subscription plan.
CREATE TABLE IF NOT EXISTS user_subscriptions (
  subscription_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  plan_id INT UNSIGNED NOT NULL,
  status ENUM('active', 'expired', 'cancelled') NOT NULL DEFAULT 'active',
  starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_user_subscriptions_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_user_subscriptions_plan
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(plan_id)
    ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- Stores each image uploaded by a user for analysis.
CREATE TABLE IF NOT EXISTS scans (
  scan_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  original_file_name VARCHAR(255) NOT NULL,
  stored_file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size_bytes BIGINT UNSIGNED NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  status ENUM('queued', 'processing', 'completed', 'failed')
    NOT NULL DEFAULT 'queued',
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_scans_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- Stores the AI result for exactly one completed scan.
CREATE TABLE IF NOT EXISTS analysis_results (
  result_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scan_id INT UNSIGNED NOT NULL UNIQUE,
  verdict ENUM('authentic', 'ai_generated', 'uncertain') NOT NULL,
  confidence_score DECIMAL(5,4) NOT NULL,
  authentic_score DECIMAL(5,4) NULL,
  ai_generated_score DECIMAL(5,4) NULL,
  heatmap_path VARCHAR(500) NULL,
  detected_objects JSON NULL,
  readable_explanation TEXT NOT NULL,
  raw_model_output JSON NULL,
  processing_time_ms INT UNSIGNED NULL,
  model_version VARCHAR(100) NOT NULL,
  analyzed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_confidence_score
    CHECK (confidence_score >= 0 AND confidence_score <= 1),

  CONSTRAINT fk_analysis_results_scan
    FOREIGN KEY (scan_id) REFERENCES scans(scan_id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- Stores a user's rating and optional comment about an AI result.
CREATE TABLE IF NOT EXISTS feedback (
  feedback_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  result_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_feedback_rating
    CHECK (rating BETWEEN 1 AND 5),

  CONSTRAINT uq_feedback_result_user
    UNIQUE (result_id, user_id),

  CONSTRAINT fk_feedback_result
    FOREIGN KEY (result_id) REFERENCES analysis_results(result_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_feedback_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- Keeps a payment record; actual PayMongo integration comes later.
CREATE TABLE IF NOT EXISTS payments (
  payment_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subscription_id INT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PHP',
  provider VARCHAR(50) NOT NULL,
  provider_reference VARCHAR(255) NULL UNIQUE,
  status ENUM('pending', 'paid', 'failed', 'refunded')
    NOT NULL DEFAULT 'pending',
  failure_reason TEXT NULL,
  paid_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_payments_subscription
    FOREIGN KEY (subscription_id)
    REFERENCES user_subscriptions(subscription_id)
    ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- Initial plans used by the application.
INSERT INTO subscription_plans
  (name, description, price, scan_limit, billing_cycle)
VALUES
  ('Free', 'Free plan with a limited number of scans.', 0.00, 5, 'free'),
  ('Premium', 'Premium plan with unlimited scans and report export.', 249.00, NULL, 'monthly')
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  price = VALUES(price),
  scan_limit = VALUES(scan_limit),
  billing_cycle = VALUES(billing_cycle),
  is_active = TRUE;