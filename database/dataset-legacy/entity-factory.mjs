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
  hashed_passwort,
  first_name,
  last_name,
  age = null,
  income,
  created_at = new Date()
}) {
  return {
    ...( _id ? { _id: toObjectId(_id) } : {}),
    username,
    email,
    password,
    hashed_passwort,
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
    ...( _id ? { _id: toObjectId(_id) } : {}),
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
  joined_at = new Date()
}) {
  return {
    ...( _id ? { _id: toObjectId(_id) } : {}),
    group_id: toObjectId(group_id),
    user_id: toObjectId(user_id),
    role,
    joined_at: toDate(joined_at)
  };se
}

export function createBankAccountEntity({
  _id,
  user_id,
  balance,
  created_at = new Date()
}) {
  return {
    ...( _id ? { _id: toObjectId(_id) } : {}),
    user_id: toObjectId(user_id),
    balance: toDecimal128(balance),
    created_at: toDate(created_at)
  };
}

export function createExpenseEntity({
  _id,
  amount,
  info = null,
  category = null,
  due_date = null,
  group_id = null,
  repeating = null,
  cycle_date = null,
  created_at = new Date()
}) {
  return {
    ...( _id ? { _id: toObjectId(_id) } : {}),
    amount: toDecimal128(amount),
    info,
    category,
    due_date: due_date == null ? null : toDate(due_date),
    group_id: group_id == null ? null : toObjectId(group_id),
    repeating,
    cycle_date: cycle_date == null ? null : toDate(cycle_date),
    created_at: toDate(created_at)
  };
}

export function createExpenseShareEntity({
  _id,
  expense_id,
  user_id,
  theo_amount,
  is_settled,
  settled_at = null
}) {
  return {
    ...( _id ? { _id: toObjectId(_id) } : {}),
    expense_id: toObjectId(expense_id),
    user_id: toObjectId(user_id),
    theo_amount: toDecimal128(theo_amount),
    is_settled: Boolean(is_settled),
    settled_at: settled_at == null ? null : toDate(settled_at)
  };
}

export function createRequestEntity({
  _id,
  from_user_id,
  to_user_id,
  expense_share_id = null,
  amount,
  due_date = null,
  info = null,
  category = null,
  status,
  created_at = new Date()
}) {
  return {
    ...( _id ? { _id: toObjectId(_id) } : {}),
    from_user_id: toObjectId(from_user_id),
    to_user_id: toObjectId(to_user_id),
    expense_share_id: expense_share_id == null ? null : toObjectId(expense_share_id),
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
  expense_share_id = null,
  created_at = new Date()
}) {
  const hasRequest = request_id != null;
  const hasExpenseShare = expense_share_id != null;

  if (hasRequest === hasExpenseShare) {
    throw new TypeError("Transaction must contain exactly one of request_id or expense_share_id.");
  }

  return {
    ...( _id ? { _id: toObjectId(_id) } : {}),
    amount: toDecimal128(amount),
    request_id: hasRequest ? toObjectId(request_id) : undefined,
    expense_share_id: hasExpenseShare ? toObjectId(expense_share_id) : undefined,
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
    ...( _id ? { _id: toObjectId(_id) } : {}),
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
  cycle_date = null,
  created_at = new Date()
}) {
  return {
    ...( _id ? { _id: toObjectId(_id) } : {}),
    user_id: toObjectId(user_id),
    category,
    target_amount: toDecimal128(target_amount),
    current_amount: toDecimal128(current_amount),
    cycle_date: cycle_date == null ? null : toDate(cycle_date),
    created_at: toDate(created_at)
  };
}
