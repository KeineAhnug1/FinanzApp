/**
 * db.ts — Database row types matching the PostgreSQL schema exactly.
 *
 * Rules:
 * - All IDs are `number` (PostgreSQL SERIAL = integer sequence).
 * - Timestamps from the DB arrive as ISO strings; typed as `string`.
 * - Nullable / optional columns are `string | null` or `number | null`.
 * - DECIMAL columns are represented as `number`; the DB driver converts them.
 */

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/** Row in the `users` table. */
export interface User {
  id: number;
  username: string;
  email: string;
  /** Hashed password — never send to the client. */
  password: string;
  first_name: string;
  last_name: string;
  age: number | null;
  income: number;
  /** Stored as "profileImage" (quoted identifier in DB). */
  profileImage: string | null;
  /** When false, other users see initials instead of this user's profile image. */
  show_profile_image_to_others: boolean;
  /** FK to bank_accounts — receiving account for incoming peer transfers. */
  default_bank_account_id: number | null;
  created_at: string;
}

/** Client-safe user — `password` omitted. */
export type UserClient = Omit<User, 'password'>;

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Row in the `sessions` table. */
export interface Session {
  id: number;
  token: string;
  user_id: number;
  expires_at: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Email Verifications
// ---------------------------------------------------------------------------

/** Row in the `email_verifications` table. */
export interface EmailVerification {
  id: number;
  email: string;
  username: string;
  /** Hashed password stored temporarily during verification flow. */
  password: string;
  first_name: string;
  last_name: string;
  income: number;
  code_hash: string;
  attempts: number;
  created_at: string;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// Password Resets
// ---------------------------------------------------------------------------

/** Row in the `password_resets` table. */
export interface PasswordReset {
  id: number;
  email: string;
  user_id: number;
  code_hash: string;
  attempts: number;
  created_at: string;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// Bank Accounts
// ---------------------------------------------------------------------------

/** Row in the `bank_accounts` table. */
export interface BankAccount {
  id: number;
  user_id: number;
  /** Display label / name of the account. */
  label: string | null;
  balance: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Share Accounts (Aktienkonten / Depots)
// ---------------------------------------------------------------------------

/** Row in the `share_accounts` table. */
export interface ShareAccount {
  id: number;
  user_id: number;
  label: string | null;
  created_at: string | null;
}

/**
 * Alias kept for naming parity with the task spec.
 * `share_accounts` doubles as the "Depot" concept in the schema.
 */
export type Depot = ShareAccount;

// ---------------------------------------------------------------------------
// Shares (Aktien-Positionen)
// ---------------------------------------------------------------------------

/** Row in the `shares` table. */
export interface Share {
  id: number;
  /** FK to share_accounts. */
  share_account_id: number | null;
  symbol: string;
  units: number;
  bought_at: string;
  bought_for: number;
}

// ---------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------

/** Row in the `income` table. */
export interface Income {
  id: number;
  bank_account_id: number;
  source: string | null;
  category: string | null;
  amount: number;
  received_at: string | null;
  pay_date: string | null;
  note: string | null;
  info: string | null;
  /** VARCHAR with DEFAULT but no NOT NULL — can be NULL in the DB. */
  recurrence: string | null;
  /** CHECK constraint is enforced by DB but column has no NOT NULL. */
  cycle: 'once' | 'weekly' | 'monthly' | 'yearly' | null;
  /** BOOLEAN DEFAULT TRUE but no NOT NULL — can be NULL. */
  is_active: boolean | null;
  /** CHECK constraint enforced by DB but column has no NOT NULL. */
  state: 'open' | 'paused' | 'completed' | null;
  /** FK to transfers — set when this income row mirrors a peer transfer. Immutable. */
  transfer_id: number | null;
  /** FK to groups — set for group-context income (used by Group Transfers tab). */
  group_id: number | null;
  created_at: string;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Private Expenses
// ---------------------------------------------------------------------------

/** Row in the `private_expenses` table. */
export interface Expense {
  id: number;
  bank_account_id: number;
  source: string | null;
  category: string | null;
  amount: number;
  spent_at: string | null;
  due_date: string | null;
  pay_date: string | null;
  note: string | null;
  info: string | null;
  /** VARCHAR with DEFAULT but no NOT NULL — can be NULL in the DB. */
  recurrence: string | null;
  /** CHECK constraint is enforced by DB but column has no NOT NULL. */
  cycle: 'once' | 'weekly' | 'monthly' | 'yearly' | null;
  /** BOOLEAN DEFAULT TRUE but no NOT NULL — can be NULL. */
  is_active: boolean | null;
  /** CHECK constraint enforced by DB but column has no NOT NULL. */
  state: 'open' | 'paused' | 'completed' | null;
  group_funding_id: number | null;
  funding_participant_id: number | null;
  /** FK to transfers — set when this expense row mirrors a peer transfer. Immutable. */
  transfer_id: number | null;
  /** FK to groups — set for group-context expenses (used by Group Transfers tab). */
  group_id: number | null;
  created_at: string;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// User Categories
// ---------------------------------------------------------------------------

/** Row in the `user_categories` table. */
export interface UserCategory {
  id: number;
  user_id: number;
  /** Category domain, e.g. "income" or "expense". */
  kind: string;
  /** Machine-readable key unique within (user_id, kind). */
  key: string;
  /** Human-readable display value. */
  value: string;
  created_at: string | null;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

/** Row in the `budgets` table. */
export interface Budget {
  id: number;
  user_id: number;
  category: string | null;
  target_amount: number;
  current_amount: number;
  reset_date: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

/** Row in the `groups` table. */
export interface Group {
  id: number;
  name: string;
  info: string | null;
  address: string | null;
  archived_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Group Members
// ---------------------------------------------------------------------------

/** Row in the `group_members` table. */
export interface GroupMember {
  id: number;
  user_id: number;
  group_id: number;
  role: 'admin' | 'member';
  status: 'accepted' | 'invited' | 'active' | 'rejected' | 'denied' | 'left' | null;
}

// ---------------------------------------------------------------------------
// Group Activities
// ---------------------------------------------------------------------------

/** Row in the `group_activities` table. */
export interface GroupActivity {
  id: number;
  group_id: number;
  info: string | null;
  date: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Group Funding
// ---------------------------------------------------------------------------

/** Row in the `group_funding` table. */
export interface GroupFunding {
  id: number;
  group_id: number;
  group_activity_id: number;
  /** DECIMAL DEFAULT 0 but no NOT NULL — can be NULL. */
  amount: number | null;
  info: string | null;
  target_amount: number;
  status: 'open' | 'completed' | 'archived';
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Funding Participants
// ---------------------------------------------------------------------------

/** Row in the `funding_participants` table. */
export interface FundingParticipant {
  id: number;
  bank_account_id: number;
  group_funding_id: number;
  amount: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Group Expenses
// ---------------------------------------------------------------------------

/** Row in the `group_expenses` table. */
export interface GroupExpense {
  id: number;
  group_funding_id: number;
  amount: number;
  info: string | null;
  state: string | null;
  cycle: string | null;
  pay_date: string | null;
  due_date: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Transfers (peer-to-peer)
// ---------------------------------------------------------------------------

/** Row in the `transfers` table. Immutable once created. */
export interface Transfer {
  id: number;
  from_user_id: number;
  to_user_id: number;
  from_bank_account_id: number;
  to_bank_account_id: number;
  amount: number;
  reason: string | null;
  group_id: number | null;
  group_expense_share_id: number | null;
  trip_settlement_id: number | null;
  status: 'pending' | 'completed' | 'cancelled';
  created_at: string;
  completed_at: string | null;
}

// ---------------------------------------------------------------------------
// Group Shared Expenses (Splitwise-style recurring expenses)
// ---------------------------------------------------------------------------

/** Row in the `group_shared_expenses` table. */
export interface GroupSharedExpense {
  id: number;
  group_id: number;
  creator_user_id: number;
  title: string;
  info: string | null;
  total_amount: number;
  payment_mode: 'prepaid' | 'postpaid';
  cycle: 'once' | 'weekly' | 'monthly' | 'yearly';
  next_due_date: string | null;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string | null;
}

/** Row in the `group_shared_expense_shares` table. */
export interface GroupSharedExpenseShare {
  id: number;
  shared_expense_id: number;
  user_id: number;
  share_amount: number;
  status: 'pending' | 'accepted' | 'rejected' | 'left' | 'paid';
  decided_at: string | null;
  created_at: string;
}

/** Row in the `group_shared_expense_periods` table. */
export interface GroupSharedExpensePeriod {
  id: number;
  shared_expense_id: number;
  period_start: string;
  status: 'collecting' | 'settled' | 'cancelled';
  created_at: string;
  settled_at: string | null;
}

/** Row in the `group_shared_expense_period_transfers` table. */
export interface GroupSharedExpensePeriodTransfer {
  id: number;
  period_id: number;
  share_id: number;
  transfer_id: number | null;
  amount: number;
  status: 'reserved' | 'released' | 'cancelled';
}

// ---------------------------------------------------------------------------
// Group Trips (Splitwise-style trip expenses with min-cash-flow settlements)
// ---------------------------------------------------------------------------

/** Row in the `group_trips` table. */
export interface GroupTrip {
  id: number;
  group_id: number;
  creator_user_id: number;
  name: string;
  description: string | null;
  status: 'open' | 'closed' | 'archived';
  created_at: string;
  closed_at: string | null;
}

/** Row in the `group_trip_participants` table. */
export interface GroupTripParticipant {
  id: number;
  trip_id: number;
  user_id: number;
}

/** Row in the `group_trip_expenses` table. */
export interface GroupTripExpense {
  id: number;
  trip_id: number;
  payer_user_id: number;
  description: string;
  amount: number;
  spent_at: string;
  created_at: string;
}

/** Row in the `group_trip_expense_participants` table. */
export interface GroupTripExpenseParticipant {
  id: number;
  trip_expense_id: number;
  user_id: number;
}

/** Row in the `group_trip_settlements` table. */
export interface GroupTripSettlement {
  id: number;
  trip_id: number;
  from_user_id: number;
  to_user_id: number;
  amount: number;
  status: 'open' | 'paid' | 'cancelled';
  created_at: string;
  paid_at: string | null;
}

// ---------------------------------------------------------------------------
// Payment Requests (Zahlungsanforderungen)
// ---------------------------------------------------------------------------

/**
 * Row in the `requests` table.
 * Named `PaymentRequest` to avoid shadowing the global DOM `Request` type
 * in Next.js route handlers and other fetch-API consumers.
 */
export interface PaymentRequest {
  id: number;
  from_bank_account_id: number;
  to_bank_account_id: number;
  private_expense_id: number | null;
  amount: number;
  due_date: string | null;
  info: string | null;
  category: string | null;
  status: string;
  cycle: string | null;
  pay_date: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/** Row in the `transactions` table. */
export interface Transaction {
  id: number;
  private_expense_id: number | null;
  request_id: number | null;
  funding_participant_id: number | null;
  group_expense_id: number | null;
  income_id: number | null;
  from_bank_account_id: number | null;
  to_bank_account_id: number | null;
  bank_account_id: number | null;
  user_id: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Group Messages
// ---------------------------------------------------------------------------

/** Row in the `group_message` table. */
export interface GroupMessage {
  id: number;
  from_user_id: number;
  group_id: number;
  message: string | null;
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// Global Questions (Forum)
// ---------------------------------------------------------------------------

/** Row in the `global_questions` table. */
export interface Question {
  id: number;
  from_user_id: number;
  thema: string | null;
  message: string | null;
  /** BOOLEAN DEFAULT FALSE but no NOT NULL — can be NULL. */
  answered: boolean | null;
  /** BOOLEAN DEFAULT FALSE but no NOT NULL — can be NULL. */
  edited: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Question Likes
// ---------------------------------------------------------------------------

/** Row in the `question_likes` table. */
export interface QuestionLike {
  id: number;
  user_id: number;
  question_id: number;
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// Global Answers (Forum)
// ---------------------------------------------------------------------------

/** Row in the `global_answers` table. */
export interface Answer {
  id: number;
  question_id: number;
  from_user_id: number;
  message: string | null;
  /** BOOLEAN DEFAULT FALSE but no NOT NULL — can be NULL. */
  edited: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Answer Likes
// ---------------------------------------------------------------------------

/** Row in the `answer_likes` table. */
export interface AnswerLike {
  id: number;
  answer_id: number;
  user_id: number;
  created_at: string | null;
}
