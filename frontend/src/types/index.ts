/**
 * index.ts — Barrel re-export for all type definitions.
 *
 * Usage:
 *   import type { User, BankAccount, ApiResponse } from '@/types';
 */

export type {
  // Users
  User,
  UserClient,
  // Sessions
  Session,
  // Email / Password flows
  EmailVerification,
  PasswordReset,
  // Bank accounts
  BankAccount,
  // Share accounts / depots / positions
  ShareAccount,
  Depot,
  Share,
  // Income & expenses
  Income,
  Expense,
  // User categories
  UserCategory,
  // Budgets
  Budget,
  // Groups
  Group,
  GroupMember,
  GroupActivity,
  GroupFunding,
  FundingParticipant,
  GroupExpense,
  // Requests & transactions
  PaymentRequest,
  Transaction,
  // Messages
  GroupMessage,
  // Forum
  Question,
  QuestionLike,
  Answer,
  AnswerLike,
} from './db';

export type {
  // Generic envelope
  ApiResponse,
  // Pagination
  PaginatedResponse,
  PaginationParams,
  // Auth
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  VerifyEmailRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
  // Profile
  UpdateProfileRequest,
  // Bank accounts
  CreateBankAccountRequest,
  UpdateBankAccountRequest,
  // Share accounts
  CreateShareAccountRequest,
  UpdateShareAccountRequest,
  // Shares
  CreateShareRequest,
  UpdateShareRequest,
  // Income
  CreateIncomeRequest,
  UpdateIncomeRequest,
  // Expenses
  CreateExpenseRequest,
  UpdateExpenseRequest,
  // User categories
  CreateUserCategoryRequest,
  UpdateUserCategoryRequest,
  // Budgets
  CreateBudgetRequest,
  UpdateBudgetRequest,
  // Groups
  CreateGroupRequest,
  UpdateGroupRequest,
  InviteGroupMemberRequest,
  UpdateGroupMemberRequest,
  // Group activities
  CreateGroupActivityRequest,
  UpdateGroupActivityRequest,
  // Group funding
  CreateGroupFundingRequest,
  UpdateGroupFundingRequest,
  // Funding participants
  CreateFundingParticipantRequest,
  // Group expenses
  CreateGroupExpenseRequest,
  UpdateGroupExpenseRequest,
  // Requests
  CreateRequestRequest,
  UpdateRequestRequest,
  // Messages
  SendGroupMessageRequest,
  UpdateGroupMessageRequest,
  // Forum
  CreateQuestionRequest,
  UpdateQuestionRequest,
  CreateAnswerRequest,
  UpdateAnswerRequest,
} from './api';
