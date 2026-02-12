import { Decimal128, ObjectId } from "mongodb";

function toNumber(value) {
  if (value == null) {
    return null;
  }
  if (value instanceof Decimal128) {
    return Number(value.toString());
  }
  return Number(value);
}

function normalize(value) {
  if (value instanceof ObjectId) {
    return value.toHexString();
  }
  if (value instanceof Decimal128) {
    return Number(value.toString());
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalize(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalize(entry)])
    );
  }
  return value;
}

export async function getPreparedData(db, options = {}) {
  const { username } = options;

  const userFilter = username ? { username } : {};
  const users = await db.collection("users").find(userFilter).toArray();
  if (users.length === 0) {
    return {
      generated_at: new Date().toISOString(),
      users: []
    };
  }

  const userIds = users.map((user) => user._id);
  const userIdSet = new Set(userIds.map((id) => id.toHexString()));

  const bankAccounts = await db.collection("bank_accounts").find({ user_id: { $in: userIds } }).toArray();
  const bankAccountIds = bankAccounts.map((account) => account._id);
  const bankAccountOwnerById = new Map(
    bankAccounts.map((account) => [account._id.toHexString(), account.user_id])
  );

  const [
    groupMembers,
    budgets,
    expenseShares,
    requests,
    expenses,
    groups,
    shares
  ] = await Promise.all([
    db.collection("group_members").find({ user_id: { $in: userIds } }).toArray(),
    db.collection("budget").find({ user_id: { $in: userIds } }).toArray(),
    db.collection("expense_shares").find({ user_id: { $in: userIds } }).toArray(),
    db.collection("requests").find({
      $or: [{ from_user_id: { $in: userIds } }, { to_user_id: { $in: userIds } }]
    }).toArray(),
    db.collection("expenses").find({}).toArray(),
    db.collection("groups").find({}).toArray(),
    db.collection("shares").find({ bank_account_id: { $in: bankAccountIds } }).toArray()
  ]);

  const bankByUserId = new Map(
    bankAccounts.map((account) => [account.user_id.toHexString(), account])
  );
  const groupsById = new Map(groups.map((group) => [group._id.toHexString(), group]));
  const expensesById = new Map(expenses.map((expense) => [expense._id.toHexString(), expense]));

  const accountIdsByUser = new Map();
  for (const account of bankAccounts) {
    const userId = account.user_id.toHexString();
    const accountIds = accountIdsByUser.get(userId) ?? [];
    accountIds.push(account._id.toHexString());
    accountIdsByUser.set(userId, accountIds);
  }

  const holdingsByUser = new Map();
  for (const holding of shares) {
    const ownerUserId = bankAccountOwnerById.get(holding.bank_account_id.toHexString());
    if (!ownerUserId) {
      continue;
    }
    const ownerKey = ownerUserId.toHexString();
    const userHoldings = holdingsByUser.get(ownerKey) ?? [];
    userHoldings.push({
      symbol: holding.symbol,
      units: toNumber(holding.units),
      bought_for: toNumber(holding.bought_for),
      bought_at: holding.bought_at
    });
    holdingsByUser.set(ownerKey, userHoldings);
  }

  const membershipsByUser = new Map();
  for (const member of groupMembers) {
    const userId = member.user_id.toHexString();
    const group = groupsById.get(member.group_id.toHexString());
    const current = membershipsByUser.get(userId) ?? [];
    current.push({
      group_id: member.group_id,
      role: member.role,
      joined_at: member.joined_at,
      group_name: group?.name ?? null
    });
    membershipsByUser.set(userId, current);
  }

  const budgetsByUser = new Map();
  for (const budget of budgets) {
    const userId = budget.user_id.toHexString();
    const current = budgetsByUser.get(userId) ?? [];
    current.push({
      category: budget.category,
      target_amount: toNumber(budget.target_amount),
      current_amount: toNumber(budget.current_amount),
      cycle_date: budget.cycle_date,
      created_at: budget.created_at
    });
    budgetsByUser.set(userId, current);
  }

  const sharesByUser = new Map();
  for (const share of expenseShares) {
    const userId = share.user_id.toHexString();
    const expense = expensesById.get(share.expense_id.toHexString());
    const current = sharesByUser.get(userId) ?? [];
    current.push({
      expense_share_id: share._id,
      expense_id: share.expense_id,
      expense_category: expense?.category ?? null,
      expense_info: expense?.info ?? null,
      theo_amount: toNumber(share.theo_amount),
      is_settled: share.is_settled,
      settled_at: share.settled_at
    });
    sharesByUser.set(userId, current);
  }

  const openSharesByUser = new Map();
  for (const [userId, userShares] of sharesByUser.entries()) {
    openSharesByUser.set(
      userId,
      userShares.filter((share) => !share.is_settled)
    );
  }

  const requestsByUser = new Map();
  for (const request of requests) {
    const fromUserId = request.from_user_id.toHexString();
    const toUserId = request.to_user_id.toHexString();

    if (userIdSet.has(fromUserId)) {
      const current = requestsByUser.get(fromUserId) ?? [];
      current.push({
        direction: "outgoing",
        request_id: request._id,
        other_user_id: request.to_user_id,
        amount: toNumber(request.amount),
        status: request.status,
        due_date: request.due_date,
        category: request.category,
        info: request.info,
        created_at: request.created_at
      });
      requestsByUser.set(fromUserId, current);
    }

    if (userIdSet.has(toUserId)) {
      const current = requestsByUser.get(toUserId) ?? [];
      current.push({
        direction: "incoming",
        request_id: request._id,
        other_user_id: request.from_user_id,
        amount: toNumber(request.amount),
        status: request.status,
        due_date: request.due_date,
        category: request.category,
        info: request.info,
        created_at: request.created_at
      });
      requestsByUser.set(toUserId, current);
    }
  }

  const preparedUsers = users.map((user) => {
    const userId = user._id.toHexString();
    const account = bankByUserId.get(userId) ?? null;
    const userShares = sharesByUser.get(userId) ?? [];
    const openExpenseShares = openSharesByUser.get(userId) ?? [];
    const userRequests = requestsByUser.get(userId) ?? [];
    const pendingRequests = userRequests.filter((request) => request.status === "pending");
    const userBudgets = budgetsByUser.get(userId) ?? [];

    const totalOpenShareAmount = openExpenseShares.reduce(
      (sum, share) => sum + (share.theo_amount ?? 0),
      0
    );

    return {
      profile: {
        user_id: user._id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        income: toNumber(user.income),
        created_at: user.created_at
      },
      finances: {
        bank_account: account
          ? {
              bank_account_id: account._id,
              balance: toNumber(account.balance),
              created_at: account.created_at
            }
          : null,
        total_open_expense_shares: Number(totalOpenShareAmount.toFixed(2)),
        unsettled_expense_shares_count: openExpenseShares.length,
        pending_requests_count: pendingRequests.length
      },
      memberships: membershipsByUser.get(userId) ?? [],
      budget: userBudgets,
      requests: userRequests,
      expense_shares: userShares,
      holdings: holdingsByUser.get(userId) ?? [],
      links: {
        account_ids: accountIdsByUser.get(userId) ?? []
      }
    };
  });

  return normalize({
    generated_at: new Date(),
    users: preparedUsers
  });
}
