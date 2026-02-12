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

export function createUserEntity({
  _id,
  username,
  email,
  password,
  first_name,
  last_name,
  age = null,
  income,
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
    income: toDecimal128(income),
    created_at: toDate(created_at)
  };
}

export function createGroupEntity({
  _id,
  name,
  address = null,
  created_at = new Date()
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    name,
    address,
    created_at: toDate(created_at)
  };
}

export function createGroupMemberEntity({
  _id,
  group_id,
  user_id,
  role,
  status = null
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    group_id: toObjectId(group_id),
    user_id: toObjectId(user_id),
    role,
    status
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
  user_id,
  amount,
  theo_amount,
  info = null,
  state = null,
  due_date = null,
  created_at = new Date()
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    user_id: toObjectId(user_id),
    amount: toDecimal128(amount),
    theo_amount: toDecimal128(theo_amount),
    info,
    state,
    due_date: due_date == null ? null : toDate(due_date),
    created_at: toDate(created_at)
  };
}

export function createGroupFundingEntity({
  _id,
  group_id,
  info = null,
  created_at = new Date()
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    group_id: toObjectId(group_id),
    info,
    created_at: toDate(created_at)
  };
}

export function createFundingParticipantEntity({
  _id,
  group_funding_id,
  group_member_id,
  amount = null,
  created_at = new Date()
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    group_funding_id: toObjectId(group_funding_id),
    group_member_id: toObjectId(group_member_id),
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
  due_date = null,
  created_at = new Date()
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    group_funding_id: toObjectId(group_funding_id),
    amount: toDecimal128(amount),
    info,
    state,
    due_date: due_date == null ? null : toDate(due_date),
    created_at: toDate(created_at)
  };
}

export function createRequestEntity({
  _id,
  from_user_id,
  to_user_id,
  private_expense_id = null,
  amount,
  due_date = null,
  info = null,
  category = null,
  status,
  created_at = new Date()
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    from_user_id: toObjectId(from_user_id),
    to_user_id: toObjectId(to_user_id),
    private_expense_id: private_expense_id == null ? null : toObjectId(private_expense_id),
    amount: toDecimal128(amount),
    due_date: due_date == null ? null : toDate(due_date),
    info,
    category,
    status,
    created_at: toDate(created_at)
  };
}

export function createTransactionEntity({
  _id,
  amount,
  request_id = null,
  group_expense_id = null,
  private_expense_id = null,
  created_at = new Date()
}) {
  const sourceCount = Number(request_id != null) + Number(group_expense_id != null) + Number(private_expense_id != null);
  if (sourceCount !== 1) {
    throw new TypeError(
      "Transaction must contain exactly one source: request_id, group_expense_id, or private_expense_id."
    );
  }

  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    amount: toDecimal128(amount),
    ...(request_id != null ? { request_id: toObjectId(request_id) } : {}),
    ...(group_expense_id != null ? { group_expense_id: toObjectId(group_expense_id) } : {}),
    ...(private_expense_id != null ? { private_expense_id: toObjectId(private_expense_id) } : {}),
    created_at: toDate(created_at)
  };
}

export function createShareEntity({
  _id,
  bank_account_id,
  symbol,
  units,
  bought_at,
  bought_for
}) {
  return {
    ...(_id ? { _id: toObjectId(_id) } : {}),
    bank_account_id: toObjectId(bank_account_id),
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
