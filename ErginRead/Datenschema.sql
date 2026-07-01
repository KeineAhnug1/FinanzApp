-- Datenschema supabase — FBM FinanzApp

-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.users (
  id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),
  username character varying NOT NULL UNIQUE,
  email character varying NOT NULL UNIQUE,
  password character varying NOT NULL,
  first_name character varying NOT NULL,
  last_name character varying NOT NULL,
  profileImage text,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  default_bank_account_id integer,
  show_profile_image_to_others boolean NOT NULL DEFAULT true,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_default_bank_account_id_fkey FOREIGN KEY (default_bank_account_id) REFERENCES public.bank_accounts(id)
);
CREATE TABLE public.email_verifications (
  id integer NOT NULL DEFAULT nextval('email_verifications_id_seq'::regclass),
  email character varying NOT NULL UNIQUE,
  username character varying NOT NULL,
  password character varying NOT NULL,
  first_name character varying NOT NULL,
  last_name character varying NOT NULL,
  code_hash character varying NOT NULL,
  attempts integer DEFAULT 0,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  expires_at timestamp without time zone NOT NULL,
  CONSTRAINT email_verifications_pkey PRIMARY KEY (id)
);
CREATE TABLE public.password_resets (
  id integer NOT NULL DEFAULT nextval('password_resets_id_seq'::regclass),
  email character varying NOT NULL UNIQUE,
  user_id integer NOT NULL,
  code_hash character varying NOT NULL,
  attempts integer DEFAULT 0,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  expires_at timestamp without time zone NOT NULL,
  CONSTRAINT password_resets_pkey PRIMARY KEY (id),
  CONSTRAINT password_resets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.bank_accounts (
  id integer NOT NULL DEFAULT nextval('bank_accounts_id_seq'::regclass),
  user_id integer NOT NULL,
  label character varying,
  balance numeric NOT NULL DEFAULT 0,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT bank_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT bank_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.share_accounts (
  id integer NOT NULL DEFAULT nextval('share_accounts_id_seq'::regclass),
  user_id integer NOT NULL,
  label character varying,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT share_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT share_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.shares (
  id integer NOT NULL DEFAULT nextval('shares_id_seq'::regclass),
  share_account_id integer,
  symbol character varying NOT NULL,
  units numeric NOT NULL,
  bought_at timestamp without time zone NOT NULL,
  bought_for numeric NOT NULL,
  CONSTRAINT shares_pkey PRIMARY KEY (id),
  CONSTRAINT shares_share_account_id_fkey FOREIGN KEY (share_account_id) REFERENCES public.share_accounts(id)
);
CREATE TABLE public.income (
  id integer NOT NULL DEFAULT nextval('income_id_seq'::regclass),
  bank_account_id integer NOT NULL,
  source character varying,
  category character varying,
  amount numeric NOT NULL,
  received_at timestamp without time zone,
  pay_date timestamp without time zone,
  note text,
  info text,
  cycle character varying DEFAULT 'once'::character varying CHECK (cycle::text = ANY (ARRAY['once'::character varying, 'weekly'::character varying, 'monthly'::character varying, 'yearly'::character varying]::text[])),
  is_active boolean DEFAULT true,
  state character varying DEFAULT 'open'::character varying CHECK (state::text = ANY (ARRAY['open'::character varying, 'paused'::character varying, 'completed'::character varying]::text[])),
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  recurrence integer,
  transfer_id integer,
  group_id integer,
  group_funding_id integer,
  CONSTRAINT income_pkey PRIMARY KEY (id),
  CONSTRAINT income_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id),
  CONSTRAINT income_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id),
  CONSTRAINT income_group_funding_id_fkey FOREIGN KEY (group_funding_id) REFERENCES public.group_funding(id)
);
CREATE TABLE public.private_expenses (
  id integer NOT NULL DEFAULT nextval('private_expenses_id_seq'::regclass),
  bank_account_id integer NOT NULL,
  source character varying,
  category character varying,
  amount numeric NOT NULL,
  spent_at timestamp without time zone,
  due_date timestamp without time zone,
  pay_date timestamp without time zone,
  note text,
  info text,
  cycle character varying DEFAULT 'once'::character varying CHECK (cycle::text = ANY (ARRAY['once'::character varying, 'weekly'::character varying, 'monthly'::character varying, 'yearly'::character varying]::text[])),
  is_active boolean DEFAULT true,
  state character varying DEFAULT 'open'::character varying CHECK (state::text = ANY (ARRAY['open'::character varying, 'paused'::character varying, 'completed'::character varying]::text[])),
  group_funding_id integer,
  funding_participant_id integer,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  recurrence integer,
  transfer_id integer,
  group_id integer,
  group_expense_id integer,
  theo_amount numeric,
  CONSTRAINT private_expenses_pkey PRIMARY KEY (id),
  CONSTRAINT private_expenses_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id),
  CONSTRAINT private_expenses_group_expense_id_fkey FOREIGN KEY (group_expense_id) REFERENCES public.group_expenses(id)
);
CREATE TABLE public.user_categories (
  id integer NOT NULL DEFAULT nextval('user_categories_id_seq'::regclass),
  user_id integer NOT NULL,
  kind character varying NOT NULL,
  key character varying NOT NULL,
  value character varying NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT user_categories_pkey PRIMARY KEY (id),
  CONSTRAINT user_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.budgets (
  id integer NOT NULL DEFAULT nextval('budgets_id_seq'::regclass),
  user_id integer NOT NULL,
  category character varying,
  target_amount numeric NOT NULL,
  current_amount numeric NOT NULL,
  reset_date timestamp without time zone,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT budgets_pkey PRIMARY KEY (id),
  CONSTRAINT budgets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.groups (
  id integer NOT NULL DEFAULT nextval('groups_id_seq'::regclass),
  name character varying NOT NULL,
  info character varying,
  address character varying,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  archived_at timestamp without time zone,
  CONSTRAINT groups_pkey PRIMARY KEY (id)
);
CREATE TABLE public.group_members (
  id integer NOT NULL DEFAULT nextval('group_members_id_seq'::regclass),
  user_id integer NOT NULL,
  group_id integer NOT NULL,
  role character varying NOT NULL CHECK (role::text = ANY (ARRAY['admin'::character varying, 'member'::character varying]::text[])),
  status character varying CHECK ((status::text = ANY (ARRAY['accepted'::character varying, 'invited'::character varying, 'active'::character varying, 'rejected'::character varying, 'denied'::character varying, 'left'::character varying]::text[])) OR status IS NULL),
  CONSTRAINT group_members_pkey PRIMARY KEY (id),
  CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id)
);
CREATE TABLE public.group_activities (
  id integer NOT NULL DEFAULT nextval('group_activities_id_seq'::regclass),
  group_id integer NOT NULL,
  info character varying,
  date timestamp without time zone,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT group_activities_pkey PRIMARY KEY (id),
  CONSTRAINT group_activities_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id)
);
CREATE TABLE public.group_funding (
  id integer NOT NULL DEFAULT nextval('group_funding_id_seq'::regclass),
  group_id integer NOT NULL,
  group_activity_id integer,
  amount numeric DEFAULT 0,
  info character varying,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  target_amount numeric NOT NULL DEFAULT 0,
  status character varying DEFAULT 'open'::character varying CHECK (status::text = ANY (ARRAY['open'::character varying, 'completed'::character varying, 'archived'::character varying]::text[])),
  completed_at timestamp without time zone,
  archived_at timestamp without time zone,
  creator_user_id integer,
  creator_bank_account_id integer,
  CONSTRAINT group_funding_pkey PRIMARY KEY (id),
  CONSTRAINT group_funding_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id),
  CONSTRAINT group_funding_group_activity_id_fkey FOREIGN KEY (group_activity_id) REFERENCES public.group_activities(id),
  CONSTRAINT group_funding_creator_user_id_fkey FOREIGN KEY (creator_user_id) REFERENCES public.users(id),
  CONSTRAINT group_funding_creator_bank_account_id_fkey FOREIGN KEY (creator_bank_account_id) REFERENCES public.bank_accounts(id)
);
CREATE TABLE public.funding_participants (
  id integer NOT NULL DEFAULT nextval('funding_participants_id_seq'::regclass),
  bank_account_id integer NOT NULL,
  group_funding_id integer NOT NULL,
  amount numeric,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT funding_participants_pkey PRIMARY KEY (id),
  CONSTRAINT funding_participants_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id),
  CONSTRAINT funding_participants_group_funding_id_fkey FOREIGN KEY (group_funding_id) REFERENCES public.group_funding(id)
);
CREATE TABLE public.group_expenses (
  id integer NOT NULL DEFAULT nextval('group_expenses_id_seq'::regclass),
  group_funding_id integer NOT NULL,
  amount numeric NOT NULL,
  info text,
  state character varying,
  cycle character varying,
  pay_date timestamp without time zone,
  due_date timestamp without time zone,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT group_expenses_pkey PRIMARY KEY (id),
  CONSTRAINT group_expenses_group_funding_id_fkey FOREIGN KEY (group_funding_id) REFERENCES public.group_funding(id)
);
CREATE TABLE public.requests (
  id integer NOT NULL DEFAULT nextval('requests_id_seq'::regclass),
  from_bank_account_id integer NOT NULL,
  to_bank_account_id integer NOT NULL,
  private_expense_id integer,
  amount numeric NOT NULL,
  due_date timestamp without time zone,
  info character varying,
  category character varying,
  status character varying NOT NULL,
  cycle character varying,
  pay_date timestamp without time zone,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT requests_pkey PRIMARY KEY (id),
  CONSTRAINT requests_from_bank_account_id_fkey FOREIGN KEY (from_bank_account_id) REFERENCES public.bank_accounts(id),
  CONSTRAINT requests_to_bank_account_id_fkey FOREIGN KEY (to_bank_account_id) REFERENCES public.bank_accounts(id),
  CONSTRAINT requests_private_expense_id_fkey FOREIGN KEY (private_expense_id) REFERENCES public.private_expenses(id)
);
CREATE TABLE public.group_message (
  id integer NOT NULL DEFAULT nextval('group_message_id_seq'::regclass),
  from_user_id integer NOT NULL,
  group_id integer NOT NULL,
  message character varying,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT group_message_pkey PRIMARY KEY (id),
  CONSTRAINT group_message_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id),
  CONSTRAINT group_message_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id)
);
CREATE TABLE public.global_questions (
  id integer NOT NULL DEFAULT nextval('global_questions_id_seq'::regclass),
  from_user_id integer NOT NULL,
  thema character varying,
  message character varying,
  answered boolean DEFAULT false,
  edited boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT global_questions_pkey PRIMARY KEY (id),
  CONSTRAINT global_questions_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.question_likes (
  id integer NOT NULL DEFAULT nextval('question_likes_id_seq'::regclass),
  user_id integer NOT NULL,
  question_id integer NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT question_likes_pkey PRIMARY KEY (id),
  CONSTRAINT question_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT question_likes_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.global_questions(id)
);
CREATE TABLE public.global_answers (
  id integer NOT NULL DEFAULT nextval('global_answers_id_seq'::regclass),
  question_id integer NOT NULL,
  from_user_id integer NOT NULL,
  message character varying,
  edited boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT global_answers_pkey PRIMARY KEY (id),
  CONSTRAINT global_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.global_questions(id),
  CONSTRAINT global_answers_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.answer_likes (
  id integer NOT NULL DEFAULT nextval('answer_likes_id_seq'::regclass),
  answer_id integer NOT NULL,
  user_id integer NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT answer_likes_pkey PRIMARY KEY (id),
  CONSTRAINT answer_likes_answer_id_fkey FOREIGN KEY (answer_id) REFERENCES public.global_answers(id),
  CONSTRAINT answer_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.transfers (
  id integer NOT NULL DEFAULT nextval('transfers_id_seq'::regclass),
  from_user_id integer NOT NULL,
  to_user_id integer NOT NULL,
  from_bank_account_id integer NOT NULL,
  to_bank_account_id integer NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  reason character varying,
  group_id integer,
  group_expense_share_id integer,
  trip_settlement_id integer,
  status character varying NOT NULL DEFAULT 'completed'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'completed'::character varying, 'cancelled'::character varying]::text[])),
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  completed_at timestamp without time zone,
  CONSTRAINT transfers_pkey PRIMARY KEY (id),
  CONSTRAINT fk_transfers_gses FOREIGN KEY (group_expense_share_id) REFERENCES public.group_shared_expense_shares(id),
  CONSTRAINT fk_transfers_trip_settlement FOREIGN KEY (trip_settlement_id) REFERENCES public.group_trip_settlements(id),
  CONSTRAINT transfers_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id),
  CONSTRAINT transfers_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.users(id),
  CONSTRAINT transfers_from_bank_account_id_fkey FOREIGN KEY (from_bank_account_id) REFERENCES public.bank_accounts(id),
  CONSTRAINT transfers_to_bank_account_id_fkey FOREIGN KEY (to_bank_account_id) REFERENCES public.bank_accounts(id),
  CONSTRAINT transfers_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id)
);
CREATE TABLE public.group_shared_expenses (
  id integer NOT NULL DEFAULT nextval('group_shared_expenses_id_seq'::regclass),
  group_id integer NOT NULL,
  creator_user_id integer NOT NULL,
  title character varying NOT NULL,
  info text,
  total_amount numeric NOT NULL CHECK (total_amount > 0::numeric),
  payment_mode character varying NOT NULL CHECK (payment_mode::text = ANY (ARRAY['prepaid'::character varying, 'postpaid'::character varying]::text[])),
  cycle character varying NOT NULL DEFAULT 'once'::character varying CHECK (cycle::text = ANY (ARRAY['once'::character varying, 'weekly'::character varying, 'monthly'::character varying, 'yearly'::character varying]::text[])),
  next_due_date timestamp without time zone,
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'active'::character varying, 'completed'::character varying, 'cancelled'::character varying]::text[])),
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT group_shared_expenses_pkey PRIMARY KEY (id),
  CONSTRAINT group_shared_expenses_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id),
  CONSTRAINT group_shared_expenses_creator_user_id_fkey FOREIGN KEY (creator_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.group_shared_expense_shares (
  id integer NOT NULL DEFAULT nextval('group_shared_expense_shares_id_seq'::regclass),
  shared_expense_id integer NOT NULL,
  user_id integer NOT NULL,
  share_amount numeric NOT NULL CHECK (share_amount >= 0::numeric),
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'accepted'::character varying, 'rejected'::character varying, 'left'::character varying, 'paid'::character varying]::text[])),
  decided_at timestamp without time zone,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT group_shared_expense_shares_pkey PRIMARY KEY (id),
  CONSTRAINT group_shared_expense_shares_shared_expense_id_fkey FOREIGN KEY (shared_expense_id) REFERENCES public.group_shared_expenses(id),
  CONSTRAINT group_shared_expense_shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.group_shared_expense_periods (
  id integer NOT NULL DEFAULT nextval('group_shared_expense_periods_id_seq'::regclass),
  shared_expense_id integer NOT NULL,
  period_start timestamp without time zone NOT NULL,
  status character varying NOT NULL DEFAULT 'collecting'::character varying CHECK (status::text = ANY (ARRAY['collecting'::character varying, 'settled'::character varying, 'cancelled'::character varying]::text[])),
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  settled_at timestamp without time zone,
  CONSTRAINT group_shared_expense_periods_pkey PRIMARY KEY (id),
  CONSTRAINT group_shared_expense_periods_shared_expense_id_fkey FOREIGN KEY (shared_expense_id) REFERENCES public.group_shared_expenses(id)
);
CREATE TABLE public.group_shared_expense_period_transfers (
  id integer NOT NULL DEFAULT nextval('group_shared_expense_period_transfers_id_seq'::regclass),
  period_id integer NOT NULL,
  share_id integer NOT NULL,
  transfer_id integer,
  amount numeric NOT NULL,
  status character varying NOT NULL DEFAULT 'reserved'::character varying CHECK (status::text = ANY (ARRAY['reserved'::character varying, 'released'::character varying, 'cancelled'::character varying]::text[])),
  CONSTRAINT group_shared_expense_period_transfers_pkey PRIMARY KEY (id),
  CONSTRAINT group_shared_expense_period_transfers_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.group_shared_expense_periods(id),
  CONSTRAINT group_shared_expense_period_transfers_share_id_fkey FOREIGN KEY (share_id) REFERENCES public.group_shared_expense_shares(id),
  CONSTRAINT group_shared_expense_period_transfers_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES public.transfers(id)
);
CREATE TABLE public.group_trips (
  id integer NOT NULL DEFAULT nextval('group_trips_id_seq'::regclass),
  group_id integer NOT NULL,
  creator_user_id integer NOT NULL,
  name character varying NOT NULL,
  description text,
  status character varying NOT NULL DEFAULT 'open'::character varying CHECK (status::text = ANY (ARRAY['open'::character varying, 'closed'::character varying, 'archived'::character varying]::text[])),
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  closed_at timestamp without time zone,
  CONSTRAINT group_trips_pkey PRIMARY KEY (id),
  CONSTRAINT group_trips_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id),
  CONSTRAINT group_trips_creator_user_id_fkey FOREIGN KEY (creator_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.group_trip_participants (
  id integer NOT NULL DEFAULT nextval('group_trip_participants_id_seq'::regclass),
  trip_id integer NOT NULL,
  user_id integer NOT NULL,
  CONSTRAINT group_trip_participants_pkey PRIMARY KEY (id),
  CONSTRAINT group_trip_participants_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.group_trips(id),
  CONSTRAINT group_trip_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.group_trip_expenses (
  id integer NOT NULL DEFAULT nextval('group_trip_expenses_id_seq'::regclass),
  trip_id integer NOT NULL,
  payer_user_id integer NOT NULL,
  description character varying NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  spent_at timestamp without time zone NOT NULL DEFAULT now(),
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT group_trip_expenses_pkey PRIMARY KEY (id),
  CONSTRAINT group_trip_expenses_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.group_trips(id),
  CONSTRAINT group_trip_expenses_payer_user_id_fkey FOREIGN KEY (payer_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.group_trip_expense_participants (
  id integer NOT NULL DEFAULT nextval('group_trip_expense_participants_id_seq'::regclass),
  trip_expense_id integer NOT NULL,
  user_id integer NOT NULL,
  CONSTRAINT group_trip_expense_participants_pkey PRIMARY KEY (id),
  CONSTRAINT group_trip_expense_participants_trip_expense_id_fkey FOREIGN KEY (trip_expense_id) REFERENCES public.group_trip_expenses(id),
  CONSTRAINT group_trip_expense_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.group_trip_settlements (
  id integer NOT NULL DEFAULT nextval('group_trip_settlements_id_seq'::regclass),
  trip_id integer NOT NULL,
  from_user_id integer NOT NULL,
  to_user_id integer NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  status character varying NOT NULL DEFAULT 'open'::character varying CHECK (status::text = ANY (ARRAY['open'::character varying, 'paid'::character varying, 'cancelled'::character varying]::text[])),
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  paid_at timestamp without time zone,
  CONSTRAINT group_trip_settlements_pkey PRIMARY KEY (id),
  CONSTRAINT group_trip_settlements_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.users(id),
  CONSTRAINT group_trip_settlements_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.group_trips(id),
  CONSTRAINT group_trip_settlements_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id)
);