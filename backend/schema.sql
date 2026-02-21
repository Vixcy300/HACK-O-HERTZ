-- ============================================
-- Incomiq – Smart Income & Expense Tracker Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Incomes ──
CREATE TABLE IF NOT EXISTS incomes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  source_name VARCHAR(50) NOT NULL,
  category VARCHAR(20) NOT NULL CHECK (category IN ('freelance','delivery','content','rideshare','tutoring','ecommerce','other')),
  date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_incomes_user ON incomes(user_id);
CREATE INDEX idx_incomes_date ON incomes(user_id, date DESC);
CREATE INDEX idx_incomes_category ON incomes(user_id, category);

-- ── Expenses ──
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category VARCHAR(20) NOT NULL CHECK (category IN ('rent','food','transport','utilities','entertainment','healthcare','education','shopping','other')),
  description TEXT NOT NULL,
  date DATE NOT NULL,
  payment_method VARCHAR(10) DEFAULT 'upi' CHECK (payment_method IN ('upi','card','cash')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_expenses_user ON expenses(user_id);
CREATE INDEX idx_expenses_date ON expenses(user_id, date DESC);

-- ── Savings Rules ──
CREATE TABLE IF NOT EXISTS savings_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  condition JSONB NOT NULL,       -- { field, operator, value }
  action JSONB NOT NULL,          -- { type, value, destination }
  safety JSONB DEFAULT '{}'::JSONB, -- { min_balance, min_income }
  is_active BOOLEAN DEFAULT true,
  total_saved NUMERIC(12,2) DEFAULT 0,
  times_triggered INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rules_user ON savings_rules(user_id);

-- ── Savings Goals ──
CREATE TABLE IF NOT EXISTS savings_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  target_amount NUMERIC(12,2) NOT NULL CHECK (target_amount > 0),
  current_amount NUMERIC(12,2) DEFAULT 0 CHECK (current_amount >= 0),
  target_date DATE NOT NULL,
  icon VARCHAR(30) DEFAULT 'piggy-bank',
  monthly_contribution NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_goals_user ON savings_goals(user_id);

-- ── Goal Contributions (audit trail) ──
CREATE TABLE IF NOT EXISTS goal_contributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  goal_id UUID NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  source VARCHAR(50),  -- 'manual', 'rule:{rule_id}', etc.
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Investment Profiles ──
CREATE TABLE IF NOT EXISTS investment_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  risk_profile VARCHAR(15) CHECK (risk_profile IN ('conservative','moderate','aggressive')),
  risk_score INTEGER,
  quiz_answers JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Row Level Security ──
ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users own incomes" ON incomes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own expenses" ON expenses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own rules" ON savings_rules FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own goals" ON savings_goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own contributions" ON goal_contributions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own profiles" ON investment_profiles FOR ALL USING (auth.uid() = user_id);
-- ── SMS Records ──────────────────────────────────────────────────
-- Stores all processed bank SMS messages and their risk analysis
CREATE TABLE IF NOT EXISTS sms_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  sender_id VARCHAR(30),
  parsed_amount NUMERIC(12,2),
  parsed_type VARCHAR(10) CHECK (parsed_type IN ('credit', 'debit', NULL)),
  parsed_merchant VARCHAR(100),
  parsed_mode VARCHAR(20),
  bank_name VARCHAR(50),
  risk_score NUMERIC(5,2),
  risk_level VARCHAR(15) CHECK (risk_level IN ('safe', 'warning', 'high_risk', 'critical', NULL)),
  auto_processed BOOLEAN DEFAULT false,
  needs_clarification BOOLEAN DEFAULT false,
  clarified BOOLEAN DEFAULT false,
  clarification_category VARCHAR(30),
  clarification_description TEXT,
  timestamp TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sms_user ON sms_records(user_id);
CREATE INDEX idx_sms_timestamp ON sms_records(user_id, timestamp DESC);
CREATE INDEX idx_sms_clarification ON sms_records(user_id, needs_clarification, clarified);

ALTER TABLE sms_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own sms_records" ON sms_records FOR ALL USING (auth.uid() = user_id);

-- ── SMS Device Registrations ──────────────────────────────────────
-- Maps phone numbers to user accounts for webhook routing
CREATE TABLE IF NOT EXISTS sms_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone VARCHAR(20) UNIQUE NOT NULL,
  registered_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sms_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own sms_devices" ON sms_devices FOR ALL USING (auth.uid() = user_id);

-- ── Push Notification Subscriptions ─────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own push_subscriptions" ON push_subscriptions FOR ALL USING (auth.uid() = user_id);

-- Add sms_id foreign reference columns to income/expenses for traceability
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS sms_id UUID REFERENCES sms_records(id) ON DELETE SET NULL;
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS via_sms BOOLEAN DEFAULT false;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS sms_id UUID REFERENCES sms_records(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS via_sms BOOLEAN DEFAULT false;