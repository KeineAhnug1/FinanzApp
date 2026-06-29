export interface MemberView {
  id: number;
  user_id: number;
  username: string;
  first_name?: string;
  role: string;
  status?: string;
}

export interface ContributionView {
  id?: number;
  bank_account_id?: number;
  amount: number;
  contributor_name?: string;
  created_at?: string;
}

export interface FundingView {
  id: number;
  title: string;
  target_amount: number;
  current_amount: number;
  description?: string;
  contributions?: ContributionView[];
}

export interface GroupView {
  id: number;
  name: string;
  address?: string;
  info?: string;
  created_at: string;
  members?: MemberView[];
  funding?: FundingView[];
  activities?: ActivityView[];
  expenses?: ExpenseView[];
  is_admin?: boolean;
  session_user_id?: number;
}

export interface ActivityView {
  activity_id: string;
  info: string | null;
  date: string | null;
  created_at: string | null;
}

export interface ExpenseView {
  group_expense_id: string;
  group_funding_id: string;
  amount: number;
  info: string | null;
  state: 'open' | 'paid' | 'overdue' | null;
  cycle: string | null;
  due_date: string | null;
  pay_date: string | null;
  created_at: string | null;
}

export interface GroupMessageView {
  id: number;
  message: string;
  sender_name?: string;
  created_at: string;
  user_id: string;
}

export interface GroupSummary {
  id: number;
  name: string;
  address?: string;
  member_count?: number;
}

export interface Invitation {
  id: number;
  group_id: number;
  group_name: string;
  invited_by: string;
}

export type SharedExpensePaymentMode = 'prepaid' | 'postpaid';
export type SharedExpenseCycle = 'once' | 'weekly' | 'monthly' | 'yearly';
export type SharedExpenseStatus = 'pending' | 'active' | 'completed' | 'cancelled';
export type SharedExpenseShareStatus = 'pending' | 'accepted' | 'rejected' | 'stopped';

export interface SharedExpenseShare {
  share_id: number;
  user_id: number;
  username?: string;
  first_name?: string;
  share_amount: number;
  status: SharedExpenseShareStatus;
  decided_at?: string | null;
  stopped_at?: string | null;
}

export interface SharedExpensePeriod {
  period_id: number;
  shared_expense_id: number;
  period_start: string;
  period_end?: string | null;
  status: SharedExpenseStatus;
  created_at?: string;
}

export interface SharedExpense {
  shared_expense_id: number;
  group_id: number;
  title: string;
  info?: string | null;
  total_amount: number;
  payment_mode: SharedExpensePaymentMode;
  cycle: SharedExpenseCycle;
  status: SharedExpenseStatus;
  created_by: number;
  created_at: string;
  shares: SharedExpenseShare[];
  periods?: SharedExpensePeriod[];
}
