export interface MemberView {
  id: number;
  user_id: number;
  username: string;
  first_name?: string;
  role: string;
  status?: string;
}

export interface ContributionView {
  id: number;
  bank_account_id: number;
  amount: number;
  contributor_name?: string;
  created_at: string;
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
  created_at: string;
  members?: MemberView[];
  funding?: FundingView[];
  is_admin?: boolean;
}

export interface ActivityView {
  id: number;
  info: string;
  date: string;
}

export interface ExpenseView {
  id: number;
  funding_id: number;
  amount: number;
  info: string;
  state: string;
  cycle: string;
  due_date: string;
  pay_date: string;
}

export interface GroupMessageView {
  id: number;
  message: string;
  sender_name?: string;
  created_at: string;
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
