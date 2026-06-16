/**
 * api.ts — API request / response types for the FinanzApp Next.js backend.
 *
 * Conventions:
 * - `ApiResponse<T>` wraps every JSON response from the API.
 * - `*Request` types describe validated JSON bodies sent by the client.
 * - `*Response` types extend `ApiResponse<T>` with specific data shapes.
 * - Pagination helpers are included for list endpoints.
 */

import type { UserClient } from './db';

// ---------------------------------------------------------------------------
// Generic API envelope
// ---------------------------------------------------------------------------

/**
 * Standard response envelope returned by every API endpoint.
 *
 * @template T - Shape of the `data` payload on success.
 */
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  /** HTTP status code mirrored in the body for convenience. */
  status: number;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** Wrapper for paginated list responses. */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Query params accepted by paginated list endpoints. */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Auth — Login / Register
// ---------------------------------------------------------------------------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse extends ApiResponse<{ user: UserClient; token: string }> {}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  age?: number;
  income?: number;
}

export interface VerifyEmailRequest {
  email: string;
  code: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  new_password: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

// ---------------------------------------------------------------------------
// User Profile
// ---------------------------------------------------------------------------

export interface UpdateProfileRequest {
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  age?: number;
  income?: number;
  profileImage?: string;
}

// ---------------------------------------------------------------------------
// Bank Accounts
// ---------------------------------------------------------------------------

export interface CreateBankAccountRequest {
  label?: string;
  balance?: number;
}

export interface UpdateBankAccountRequest {
  label?: string;
  balance?: number;
}

// ---------------------------------------------------------------------------
// Share Accounts / Depots
// ---------------------------------------------------------------------------

export interface CreateShareAccountRequest {
  label?: string;
}

export interface UpdateShareAccountRequest {
  label?: string;
}

// ---------------------------------------------------------------------------
// Shares (Aktien-Positionen)
// ---------------------------------------------------------------------------

export interface CreateShareRequest {
  share_account_id: number;
  bank_account_id?: number;
  symbol: string;
  units: number;
  bought_at: string;
  bought_for: number;
}

export interface UpdateShareRequest {
  units?: number;
  bought_at?: string;
  bought_for?: number;
}

// ---------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------

export interface CreateIncomeRequest {
  bank_account_id: number;
  source?: string;
  category?: string;
  amount: number;
  received_at?: string;
  pay_date?: string;
  note?: string;
  info?: string;
  recurrence?: string;
  cycle?: 'once' | 'weekly' | 'monthly' | 'yearly';
  is_active?: boolean;
  state?: 'open' | 'paused' | 'completed';
}

export interface UpdateIncomeRequest extends Partial<CreateIncomeRequest> {}

// ---------------------------------------------------------------------------
// Expenses (Private Expenses)
// ---------------------------------------------------------------------------

export interface CreateExpenseRequest {
  bank_account_id: number;
  source?: string;
  category?: string;
  amount: number;
  theo_amount?: number;
  spent_at?: string;
  due_date?: string;
  pay_date?: string;
  note?: string;
  info?: string;
  recurrence?: string;
  cycle?: 'once' | 'weekly' | 'monthly' | 'yearly';
  is_active?: boolean;
  state?: 'open' | 'paused' | 'completed';
  group_funding_id?: number;
  funding_participant_id?: number;
}

export interface UpdateExpenseRequest extends Partial<CreateExpenseRequest> {}

// ---------------------------------------------------------------------------
// User Categories
// ---------------------------------------------------------------------------

export interface CreateUserCategoryRequest {
  kind: string;
  key: string;
  value: string;
}

export interface UpdateUserCategoryRequest {
  value?: string;
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export interface CreateBudgetRequest {
  category?: string;
  target_amount: number;
  current_amount?: number;
  reset_date?: string;
}

export interface UpdateBudgetRequest extends Partial<CreateBudgetRequest> {}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export interface CreateGroupRequest {
  name: string;
  info?: string;
  address?: string;
}

export interface UpdateGroupRequest extends Partial<CreateGroupRequest> {}

export interface InviteGroupMemberRequest {
  user_id: number;
  role?: 'admin' | 'member';
}

export interface UpdateGroupMemberRequest {
  role?: 'admin' | 'member';
  status?: 'accepted' | 'invited' | 'active' | 'rejected' | 'denied' | 'left';
}

// ---------------------------------------------------------------------------
// Group Activities
// ---------------------------------------------------------------------------

export interface CreateGroupActivityRequest {
  group_id: number;
  info?: string;
  date?: string;
}

export interface UpdateGroupActivityRequest extends Partial<Omit<CreateGroupActivityRequest, 'group_id'>> {}

// ---------------------------------------------------------------------------
// Group Funding
// ---------------------------------------------------------------------------

export interface CreateGroupFundingRequest {
  group_id: number;
  group_activity_id: number;
  amount?: number;
  info?: string;
}

export interface UpdateGroupFundingRequest extends Partial<Omit<CreateGroupFundingRequest, 'group_id'>> {}

// ---------------------------------------------------------------------------
// Funding Participants
// ---------------------------------------------------------------------------

export interface CreateFundingParticipantRequest {
  bank_account_id: number;
  group_funding_id: number;
  amount?: number;
}

// ---------------------------------------------------------------------------
// Group Expenses
// ---------------------------------------------------------------------------

export interface CreateGroupExpenseRequest {
  group_funding_id: number;
  amount: number;
  info?: string;
  state?: string;
  cycle?: string;
  pay_date?: string;
  due_date?: string;
}

export interface UpdateGroupExpenseRequest extends Partial<Omit<CreateGroupExpenseRequest, 'group_funding_id'>> {}

// ---------------------------------------------------------------------------
// Payment Requests (API request bodies — note DB row type is `PaymentRequest`)
// ---------------------------------------------------------------------------

export interface CreateRequestRequest {
  from_bank_account_id: number;
  to_bank_account_id: number;
  private_expense_id?: number;
  amount: number;
  due_date?: string;
  info?: string;
  category?: string;
  status?: string;
  cycle?: string;
  pay_date?: string;
}

export interface UpdateRequestRequest extends Partial<Omit<CreateRequestRequest, 'from_bank_account_id' | 'to_bank_account_id'>> {}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface SendGroupMessageRequest {
  group_id: number;
  message: string;
}

export interface UpdateGroupMessageRequest {
  message: string;
}

// ---------------------------------------------------------------------------
// Forum — Questions & Answers
// ---------------------------------------------------------------------------

export interface CreateQuestionRequest {
  thema?: string;
  message: string;
}

export interface UpdateQuestionRequest extends Partial<CreateQuestionRequest> {}

export interface CreateAnswerRequest {
  question_id: number;
  message: string;
}

export interface UpdateAnswerRequest {
  message: string;
}
