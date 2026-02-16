import { Decimal128, Int32, ObjectId } from "mongodb";

function toDecimal128(value, scale = 2) {
  if (value instanceof Decimal128) {
    return value;
  }

  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) {
    throw new TypeError("Expected a finite number for Decimal128 conversion.");
  }

  return Decimal128.fromString(numericValue.toFixed(scale));
}

function toDate(value = new Date()) {
  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError("Expected a valid date value.");
  }

  return parsed;
}

function toObjectId(value) {
  if (value instanceof ObjectId) {
    return value;
  }

  return new ObjectId(value);
}

function normalizeGroupMemberStatus(value = "accepted") {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "active") {
    return "accepted";
  }
  if (normalized === "denialed") {
    return "denied";
  }

  if (!["invited", "denied", "accepted"].includes(normalized)) {
    throw new TypeError("group_members.status must be one of invited, denied, accepted.");
  }

  return normalized;
}

export function createUserEntity({
  _id,
  username,
  email,
  password,
  first_name,
  last_name,
  age = null,
  verification_code = null,
  created_at = new Date()
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    username,
    email,
    password,
    first_name,
    last_name,
    age: age == null ? null : new Int32(Number(age)),
    verification_code: verification_code == null ? null : new Int32(Number(verification_code)),
    created_at: toDate(created_at)
  };
}

export function createIncomeEntity({
  _id,
  bank_account_id,
  amount,
  info = null,
  state = null,
  cycle = null,
  pay_date = null,
  created_at = new Date()
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    bank_account_id: toObjectId(bank_account_id),
    amount: toDecimal128(amount),
    info,
    state,
    cycle,
    pay_date: pay_date == null ? null : toDate(pay_date),
    created_at: toDate(created_at)
  };
}

export function createDepotEntity({ _id, user_id, created_at = null }) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    user_id: toObjectId(user_id),
    created_at: created_at == null ? null : toDate(created_at)
  };
}

export function createGroupEntity({
  _id,
  name,
  info = null,
  address = null,
  created_at = new Date()
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    name,
    info,
    address,
    created_at: toDate(created_at)
  };
}

export function createGroupMemberEntity({
  _id,
  group_id,
  user_id,
  role,
  status = "accepted"
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    group_id: toObjectId(group_id),
    user_id: toObjectId(user_id),
    role,
    status: normalizeGroupMemberStatus(status)
  };
}

export function createBankAccountEntity({
  _id,
  user_id,
  balance,
  created_at = new Date()
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    user_id: toObjectId(user_id),
    balance: toDecimal128(balance),
    created_at: toDate(created_at)
  };
}

export function createPrivateExpenseEntity({
  _id,
  bank_account_id,
  amount,
  theo_amount,
  info = null,
  state = null,
  cycle = null,
  pay_date = null,
  created_at = new Date()
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    bank_account_id: toObjectId(bank_account_id),
    amount: toDecimal128(amount),
    theo_amount: toDecimal128(theo_amount),
    info,
    state,
    cycle,
    pay_date: pay_date == null ? null : toDate(pay_date),
    created_at: toDate(created_at)
  };
}

export function createGroupActivityEntity({
  _id,
  group_id,
  info = null,
  date = null,
  created_at = new Date()
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    group_id: toObjectId(group_id),
    info,
    date: date == null ? null : toDate(date),
    created_at: toDate(created_at)
  };
}

export function createGroupFundingEntity({
  _id,
  group_id,
  group_activity_id,
  amount = null,
  info = null,
  created_at = new Date()
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    group_id: toObjectId(group_id),
    group_activity_id: toObjectId(group_activity_id),
    amount: amount == null ? null : toDecimal128(amount),
    info,
    created_at: toDate(created_at)
  };
}

export function createFundingParticipantEntity({
  _id,
  bank_account_id,
  group_funding_id,
  amount = null,
  created_at = new Date()
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    bank_account_id: toObjectId(bank_account_id),
    group_funding_id: toObjectId(group_funding_id),
    amount: amount == null ? null : toDecimal128(amount),
    created_at: toDate(created_at)
  };
}

export function createGroupExpenseEntity({
  _id,
  group_funding_id,
  amount,
  info = null,
  state = null,
  cycle = null,
  pay_date = null,
  created_at = new Date()
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    group_funding_id: toObjectId(group_funding_id),
    amount: toDecimal128(amount),
    info,
    state,
    cycle,
    pay_date: pay_date == null ? null : toDate(pay_date),
    created_at: toDate(created_at)
  };
}

export function createRequestEntity({
  _id,
  from_bank_account_id,
  to_bank_account_id,
  private_expense_id = null,
  amount,
  due_date = null,
  info = null,
  category = null,
  status,
  cycle = null,
  pay_date = null,
  created_at = new Date()
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    from_bank_account_id: toObjectId(from_bank_account_id),
    to_bank_account_id: toObjectId(to_bank_account_id),
    private_expense_id: private_expense_id == null ? null : toObjectId(private_expense_id),
    amount: toDecimal128(amount),
    due_date: due_date == null ? null : toDate(due_date),
    info,
    category,
    status,
    cycle,
    pay_date: pay_date == null ? null : toDate(pay_date),
    created_at: toDate(created_at)
  };
}

export function createTransactionEntity({
  _id,
  request_id = null,
  private_expense_id = null,
  group_expense_id = null,
  funding_participant_id = null,
  income_id = null,
  created_at = new Date()
}) {
  const sourceCount =
    Number(request_id != null) +
    Number(private_expense_id != null) +
    Number(group_expense_id != null) +
    Number(funding_participant_id != null) +
    Number(income_id != null);

  if (sourceCount !== 1) {
    throw new TypeError(
      "Transaction must contain exactly one source: request_id, private_expense_id, group_expense_id, funding_participant_id, or income_id."
    );
  }

  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    ...(request_id != null ? { request_id: toObjectId(request_id) } : {}),
    ...(private_expense_id != null ? { private_expense_id: toObjectId(private_expense_id) } : {}),
    ...(group_expense_id != null ? { group_expense_id: toObjectId(group_expense_id) } : {}),
    ...(funding_participant_id != null ? { funding_participant_id: toObjectId(funding_participant_id) } : {}),
    ...(income_id != null ? { income_id: toObjectId(income_id) } : {}),
    created_at: toDate(created_at)
  };
}

export function createShareEntity({
  _id,
  depot_id,
  symbol,
  units,
  bought_at,
  bought_for
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    depot_id: toObjectId(depot_id),
    symbol,
    units: toDecimal128(units, 4),
    bought_at: toDate(bought_at),
    bought_for: toDecimal128(bought_for)
  };
}

export function createBudgetEntity({
  _id,
  user_id,
  category = null,
  target_amount,
  current_amount,
  reset_date = null,
  created_at = new Date()
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    user_id: toObjectId(user_id),
    category,
    target_amount: toDecimal128(target_amount),
    current_amount: toDecimal128(current_amount),
    reset_date: reset_date == null ? null : toDate(reset_date),
    created_at: toDate(created_at)
  };
}
