-- FinanzApp Schema for Supabase (PostgreSQL)
-- WICHTIG: Zuerst alle bestehenden Tabellen loeschen, dann dieses Schema ausfuehren.
-- Supabase Dashboard → SQL Editor → New Query → Run

-- ===========================================
-- SCHRITT 1: Alle alten Tabellen loeschen
-- ===========================================
DROP TABLE IF EXISTS answer_likes CASCADE;
DROP TABLE IF EXISTS question_likes CASCADE;
DROP TABLE IF EXISTS global_answers CASCADE;
DROP TABLE IF EXISTS global_questions CASCADE;
DROP TABLE IF EXISTS group_message CASCADE;
DROP TABLE IF EXISTS private_message CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS requests CASCADE;
DROP TABLE IF EXISTS group_expenses CASCADE;
DROP TABLE IF EXISTS funding_participants CASCADE;
DROP TABLE IF EXISTS group_funding CASCADE;
DROP TABLE IF EXISTS group_activities CASCADE;
DROP TABLE IF EXISTS group_members CASCADE;
DROP TABLE IF EXISTS groups CASCADE;
DROP TABLE IF EXISTS budgets CASCADE;
DROP TABLE IF EXISTS user_categories CASCADE;
DROP TABLE IF EXISTS private_expenses CASCADE;
DROP TABLE IF EXISTS income CASCADE;
DROP TABLE IF EXISTS shares CASCADE;
DROP TABLE IF EXISTS share_accounts CASCADE;
DROP TABLE IF EXISTS depots CASCADE;
DROP TABLE IF EXISTS bank_accounts CASCADE;
DROP TABLE IF EXISTS password_resets CASCADE;
DROP TABLE IF EXISTS email_verifications CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ===========================================
-- SCHRITT 2: Tabellen erstellen
-- ===========================================

-- Users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR NOT NULL UNIQUE,
  email VARCHAR NOT NULL UNIQUE,
  password VARCHAR NOT NULL,
  first_name VARCHAR NOT NULL,
  last_name VARCHAR NOT NULL,
  age INT,
  income DECIMAL(12,2) DEFAULT 0,
  "profileImage" TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Sessions (fuer Login-Tokens)
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  token VARCHAR NOT NULL UNIQUE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Email Verifications (Registrierung)
CREATE TABLE email_verifications (
  id SERIAL PRIMARY KEY,
  email VARCHAR NOT NULL UNIQUE,
  username VARCHAR NOT NULL,
  password VARCHAR NOT NULL,
  first_name VARCHAR NOT NULL,
  last_name VARCHAR NOT NULL,
  income DECIMAL(12,2) DEFAULT 0,
  code_hash VARCHAR NOT NULL,
  attempts INT DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

-- Password Resets
CREATE TABLE password_resets (
  id SERIAL PRIMARY KEY,
  email VARCHAR NOT NULL UNIQUE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR NOT NULL,
  attempts INT DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

-- Bank Accounts
CREATE TABLE bank_accounts (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Share Accounts (Aktienkonten/Depots)
CREATE TABLE share_accounts (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Shares (Aktien-Positionen)
CREATE TABLE shares (
  id SERIAL PRIMARY KEY,
  share_account_id INT REFERENCES share_accounts(id) ON DELETE CASCADE,
  depot_id INT REFERENCES share_accounts(id) ON DELETE CASCADE,
  bank_account_id INT REFERENCES share_accounts(id) ON DELETE CASCADE,
  symbol VARCHAR NOT NULL,
  units DECIMAL(12,4) NOT NULL,
  bought_at TIMESTAMP NOT NULL,
  bought_for DECIMAL(12,2) NOT NULL
);

-- Income Entries (Einnahmen)
CREATE TABLE income (
  id SERIAL PRIMARY KEY,
  bank_account_id INT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  source VARCHAR,
  category VARCHAR,
  amount DECIMAL(12,2) NOT NULL,
  received_at TIMESTAMP,
  pay_date TIMESTAMP,
  note TEXT,
  info TEXT,
  recurrence VARCHAR DEFAULT 'once',
  cycle VARCHAR DEFAULT 'once',
  is_active BOOLEAN DEFAULT TRUE,
  state VARCHAR DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Private Expenses (Ausgaben)
CREATE TABLE private_expenses (
  id SERIAL PRIMARY KEY,
  bank_account_id INT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  source VARCHAR,
  category VARCHAR,
  amount DECIMAL(12,2) NOT NULL,
  theo_amount DECIMAL(12,2),
  spent_at TIMESTAMP,
  due_date TIMESTAMP,
  pay_date TIMESTAMP,
  note TEXT,
  info TEXT,
  recurrence VARCHAR DEFAULT 'once',
  cycle VARCHAR DEFAULT 'once',
  is_active BOOLEAN DEFAULT TRUE,
  state VARCHAR DEFAULT 'open',
  group_funding_id INT,
  funding_participant_id INT,
  legacy_expense_entry_id VARCHAR UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User Categories (benutzerdefinierte Kategorien)
CREATE TABLE user_categories (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR NOT NULL,
  key VARCHAR NOT NULL,
  value VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, kind, key)
);

-- Budgets
CREATE TABLE budgets (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR,
  target_amount DECIMAL(12,2) NOT NULL,
  current_amount DECIMAL(12,2) NOT NULL,
  reset_date TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Groups
CREATE TABLE groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR NOT NULL,
  info VARCHAR,
  address VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Group Members
CREATE TABLE group_members (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  role VARCHAR NOT NULL,
  status VARCHAR
);

-- Group Activities
CREATE TABLE group_activities (
  id SERIAL PRIMARY KEY,
  group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  info VARCHAR,
  date TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Group Funding
CREATE TABLE group_funding (
  id SERIAL PRIMARY KEY,
  group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  group_activity_id INT NOT NULL REFERENCES group_activities(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) DEFAULT 0,
  info VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Funding Participants
CREATE TABLE funding_participants (
  id SERIAL PRIMARY KEY,
  bank_account_id INT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  group_funding_id INT NOT NULL REFERENCES group_funding(id) ON DELETE CASCADE,
  amount DECIMAL(12,2),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Group Expenses
CREATE TABLE group_expenses (
  id SERIAL PRIMARY KEY,
  group_funding_id INT NOT NULL REFERENCES group_funding(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  info TEXT,
  state VARCHAR,
  cycle VARCHAR,
  pay_date TIMESTAMP,
  due_date TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Requests (Zahlungsanforderungen)
CREATE TABLE requests (
  id SERIAL PRIMARY KEY,
  from_bank_account_id INT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  to_bank_account_id INT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  private_expense_id INT REFERENCES private_expenses(id) ON DELETE SET NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_date TIMESTAMP,
  info VARCHAR,
  category VARCHAR,
  status VARCHAR NOT NULL,
  cycle VARCHAR,
  pay_date TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Transactions
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  private_expense_id INT REFERENCES private_expenses(id) ON DELETE SET NULL,
  request_id INT REFERENCES requests(id) ON DELETE SET NULL,
  funding_participant_id INT REFERENCES funding_participants(id) ON DELETE SET NULL,
  group_expense_id INT REFERENCES group_expenses(id) ON DELETE SET NULL,
  income_id INT REFERENCES income(id) ON DELETE SET NULL,
  from_bank_account_id INT,
  to_bank_account_id INT,
  bank_account_id INT,
  user_id INT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Group Messages (Gruppennachrichten)
CREATE TABLE group_message (
  id SERIAL PRIMARY KEY,
  from_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  message VARCHAR,
  status VARCHAR,
  edited BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Global Questions (Forum)
CREATE TABLE global_questions (
  id SERIAL PRIMARY KEY,
  from_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thema VARCHAR,
  message VARCHAR,
  answered BOOLEAN DEFAULT FALSE,
  edited BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Question Likes
CREATE TABLE question_likes (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INT NOT NULL REFERENCES global_questions(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);

-- Global Answers (Forum-Antworten)
CREATE TABLE global_answers (
  id SERIAL PRIMARY KEY,
  question_id INT NOT NULL REFERENCES global_questions(id) ON DELETE CASCADE,
  from_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message VARCHAR,
  edited BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Answer Likes
CREATE TABLE answer_likes (
  id SERIAL PRIMARY KEY,
  answer_id INT NOT NULL REFERENCES global_answers(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(answer_id, user_id)
);

-- ===========================================
-- SCHRITT 3: Indexes fuer Performance
-- ===========================================
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_bank_accounts_user ON bank_accounts(user_id);
CREATE INDEX idx_share_accounts_user ON share_accounts(user_id);
CREATE INDEX idx_income_bank_date ON income(bank_account_id, pay_date DESC, created_at DESC);
CREATE INDEX idx_expenses_bank_date ON private_expenses(bank_account_id, pay_date DESC, created_at DESC);
CREATE INDEX idx_shares_account ON shares(share_account_id);
CREATE INDEX idx_global_questions_created ON global_questions(created_at DESC);
CREATE INDEX idx_global_answers_question ON global_answers(question_id, created_at DESC);
CREATE INDEX idx_group_message_group ON group_message(group_id, created_at DESC);
CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_funding_participants_funding ON funding_participants(group_funding_id);
CREATE INDEX idx_transactions_expense ON transactions(group_expense_id);
CREATE INDEX idx_user_categories_user ON user_categories(user_id, kind);
