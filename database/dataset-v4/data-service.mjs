import { Decimal128, ObjectId } from "mongodb";

function toNumber(value) {
  if (value == null) return null;
  if (value instanceof Decimal128) return Number(value.toString());
  return Number(value);
}

function normalize(value) {
  if (value instanceof ObjectId) return value.toHexString();
  if (value instanceof Decimal128) return Number(value.toString());
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => normalize(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
  }
  return value;
}

function pushMapArray(map, key, value) {
  const current = map.get(key) ?? [];
  current.push(value);
  map.set(key, current);
}

export async function getPreparedData(db, options = {}) {
  const { username } = options;
  const userFilter = username ? { username } : {};
  const users = await db.collection("users").find(userFilter).toArray();

  if (users.length === 0) {
    return {
      dataset: "v4",
      generated_at: new Date().toISOString(),
      users: []
    };
  }

  const userIds = users.map((u) => u._id);
  const userIdSet = new Set(userIds.map((id) => id.toHexString()));

  const [
    bankAccounts,
    depots,
    groupMembers,
    budgets
  ] = await Promise.all([
    db.collection("bank_accounts").find({ user_id: { $in: userIds } }).toArray(),
    db.collection("depots").find({ user_id: { $in: userIds } }).toArray(),
    db.collection("group_members").find({ user_id: { $in: userIds } }).toArray(),
    db.collection("budgets").find({ user_id: { $in: userIds } }).toArray()
  ]);

  const bankAccountIds = bankAccounts.map((a) => a._id);
  const depotIds = depots.map((d) => d._id);
  const groupIds = [...new Set(groupMembers.map((m) => m.group_id.toHexString()))].map((id) => new ObjectId(id));

  const [
    incomes,
    privateExpenses,
    requests,
    groups,
    groupActivities,
    groupFunding,
    shares,
    fundingParticipants
  ] = await Promise.all([
    db.collection("income").find({ bank_account_id: { $in: bankAccountIds } }).toArray(),
    db.collection("private_expenses").find({ bank_account_id: { $in: bankAccountIds } }).toArray(),
    db.collection("requests").find({
      $or: [{ from_bank_account_id: { $in: bankAccountIds } }, { to_bank_account_id: { $in: bankAccountIds } }]
    }).toArray(),
    db.collection("groups").find({ _id: { $in: groupIds } }).toArray(),
    db.collection("group_activities").find({ group_id: { $in: groupIds } }).toArray(),
    db.collection("group_funding").find({ group_id: { $in: groupIds } }).toArray(),
    db.collection("shares").find({ depot_id: { $in: depotIds } }).toArray(),
    db.collection("funding_participants").find({ bank_account_id: { $in: bankAccountIds } }).toArray()
  ]);

  const fundingIds = groupFunding.map((f) => f._id);
  const groupExpenses = await db.collection("group_expenses").find({ group_funding_id: { $in: fundingIds } }).toArray();

  const transactionIds = {
    requestIds: requests.map((r) => r._id),
    privateExpenseIds: privateExpenses.map((e) => e._id),
    groupExpenseIds: groupExpenses.map((e) => e._id),
    fundingParticipantIds: fundingParticipants.map((f) => f._id),
    incomeIds: incomes.map((i) => i._id)
  };

  const transactions = await db.collection("transactions").find({
    $or: [
      { request_id: { $in: transactionIds.requestIds } },
      { private_expense_id: { $in: transactionIds.privateExpenseIds } },
      { group_expense_id: { $in: transactionIds.groupExpenseIds } },
      { funding_participant_id: { $in: transactionIds.fundingParticipantIds } },
      { income_id: { $in: transactionIds.incomeIds } }
    ]
  }).toArray();

  const groupsById = new Map(groups.map((g) => [g._id.toHexString(), g]));
  const accountById = new Map(bankAccounts.map((a) => [a._id.toHexString(), a]));

  const accountsByUser = new Map();
  for (const account of bankAccounts) {
    pushMapArray(accountsByUser, account.user_id.toHexString(), account);
  }

  const depotsByUser = new Map();
  for (const depot of depots) {
    pushMapArray(depotsByUser, depot.user_id.toHexString(), depot);
  }

  const holdingsByDepot = new Map();
  for (const share of shares) {
    pushMapArray(holdingsByDepot, share.depot_id.toHexString(), share);
  }

  const incomesByUser = new Map();
  for (const income of incomes) {
    const ownerId = accountById.get(income.bank_account_id.toHexString())?.user_id?.toHexString();
    if (!ownerId) continue;
    pushMapArray(incomesByUser, ownerId, income);
  }

  const privateExpensesByUser = new Map();
  for (const expense of privateExpenses) {
    const ownerId = accountById.get(expense.bank_account_id.toHexString())?.user_id?.toHexString();
    if (!ownerId) continue;
    pushMapArray(privateExpensesByUser, ownerId, expense);
  }

  const budgetsByUser = new Map();
  for (const budget of budgets) {
    pushMapArray(budgetsByUser, budget.user_id.toHexString(), budget);
  }

  const membershipsByUser = new Map();
  for (const member of groupMembers) {
    pushMapArray(membershipsByUser, member.user_id.toHexString(), {
      group_member_id: member._id,
      group_id: member.group_id,
      group_name: groupsById.get(member.group_id.toHexString())?.name ?? null,
      role: member.role,
      status: member.status
    });
  }

  const requestsByUser = new Map();
  for (const request of requests) {
    const fromUserId = accountById.get(request.from_bank_account_id.toHexString())?.user_id?.toHexString();
    const toUserId = accountById.get(request.to_bank_account_id.toHexString())?.user_id?.toHexString();

    if (fromUserId && userIdSet.has(fromUserId)) {
      pushMapArray(requestsByUser, fromUserId, {
        direction: "outgoing",
        request_id: request._id,
        other_bank_account_id: request.to_bank_account_id,
        amount: toNumber(request.amount),
        status: request.status,
        due_date: request.due_date,
        pay_date: request.pay_date,
        cycle: request.cycle,
        category: request.category,
        info: request.info,
        private_expense_id: request.private_expense_id ?? null,
        created_at: request.created_at
      });
    }

    if (toUserId && userIdSet.has(toUserId)) {
      pushMapArray(requestsByUser, toUserId, {
        direction: "incoming",
        request_id: request._id,
        other_bank_account_id: request.from_bank_account_id,
        amount: toNumber(request.amount),
        status: request.status,
        due_date: request.due_date,
        pay_date: request.pay_date,
        cycle: request.cycle,
        category: request.category,
        info: request.info,
        private_expense_id: request.private_expense_id ?? null,
        created_at: request.created_at
      });
    }
  }

  const txBySource = {
    request: new Map(),
    private_expense: new Map(),
    group_expense: new Map(),
    funding_participant: new Map(),
    income: new Map()
  };

  for (const tx of transactions) {
    if (tx.request_id) pushMapArray(txBySource.request, tx.request_id.toHexString(), tx);
    if (tx.private_expense_id) pushMapArray(txBySource.private_expense, tx.private_expense_id.toHexString(), tx);
    if (tx.group_expense_id) pushMapArray(txBySource.group_expense, tx.group_expense_id.toHexString(), tx);
    if (tx.funding_participant_id) {
      pushMapArray(txBySource.funding_participant, tx.funding_participant_id.toHexString(), tx);
    }
    if (tx.income_id) pushMapArray(txBySource.income, tx.income_id.toHexString(), tx);
  }

  const fundingsByGroup = new Map();
  for (const funding of groupFunding) {
    pushMapArray(fundingsByGroup, funding.group_id.toHexString(), funding);
  }

  const activitiesByGroup = new Map();
  for (const activity of groupActivities) {
    pushMapArray(activitiesByGroup, activity.group_id.toHexString(), activity);
  }

  const groupExpensesByFunding = new Map();
  for (const expense of groupExpenses) {
    pushMapArray(groupExpensesByFunding, expense.group_funding_id.toHexString(), expense);
  }

  const participantsByFunding = new Map();
  for (const participant of fundingParticipants) {
    pushMapArray(participantsByFunding, participant.group_funding_id.toHexString(), {
      ...participant,
      transactions: txBySource.funding_participant.get(participant._id.toHexString()) ?? []
    });
  }

  const preparedUsers = users.map((user) => {
    const userKey = user._id.toHexString();
    const accounts = accountsByUser.get(userKey) ?? [];
    const depotRows = depotsByUser.get(userKey) ?? [];
    const incomesForUser = (incomesByUser.get(userKey) ?? []).map((income) => ({
      income_id: income._id,
      bank_account_id: income.bank_account_id,
      amount: toNumber(income.amount),
      state: income.state,
      cycle: income.cycle,
      pay_date: income.pay_date,
      info: income.info,
      created_at: income.created_at,
      transactions: txBySource.income.get(income._id.toHexString()) ?? []
    }));

    const privateExpensesForUser = (privateExpensesByUser.get(userKey) ?? []).map((expense) => ({
      private_expense_id: expense._id,
      bank_account_id: expense.bank_account_id,
      amount: toNumber(expense.amount),
      theo_amount: toNumber(expense.theo_amount),
      state: expense.state,
      cycle: expense.cycle,
      pay_date: expense.pay_date,
      info: expense.info,
      created_at: expense.created_at,
      transactions: txBySource.private_expense.get(expense._id.toHexString()) ?? []
    }));

    const memberships = membershipsByUser.get(userKey) ?? [];
    const groupContext = memberships.map((membership) => {
      const groupIdHex = membership.group_id.toHexString();
      const fundingItems = (fundingsByGroup.get(groupIdHex) ?? []).map((funding) => ({
        group_funding_id: funding._id,
        group_activity_id: funding.group_activity_id,
        amount: toNumber(funding.amount),
        info: funding.info,
        created_at: funding.created_at,
        participants: participantsByFunding.get(funding._id.toHexString()) ?? [],
        expenses: (groupExpensesByFunding.get(funding._id.toHexString()) ?? []).map((expense) => ({
          group_expense_id: expense._id,
          amount: toNumber(expense.amount),
          state: expense.state,
          cycle: expense.cycle,
          pay_date: expense.pay_date,
          info: expense.info,
          created_at: expense.created_at,
          transactions: txBySource.group_expense.get(expense._id.toHexString()) ?? []
        }))
      }));

      return {
        ...membership,
        activities: activitiesByGroup.get(groupIdHex) ?? [],
        funding: fundingItems
      };
    });

    const holdings = depotRows.flatMap((depot) =>
      (holdingsByDepot.get(depot._id.toHexString()) ?? []).map((holding) => ({
        share_id: holding._id,
        depot_id: holding.depot_id,
        symbol: holding.symbol,
        units: toNumber(holding.units),
        bought_for: toNumber(holding.bought_for),
        bought_at: holding.bought_at
      }))
    );

    const totalBalance = accounts.reduce((sum, account) => sum + (toNumber(account.balance) ?? 0), 0);
    const totalIncome = incomesForUser.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);

    return {
      profile: {
        user_id: user._id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        age: user.age ?? null,
        verification_code: user.verification_code ?? null,
        created_at: user.created_at
      },
      finance_overview: {
        total_bank_balance: Number(totalBalance.toFixed(2)),
        total_income: Number(totalIncome.toFixed(2)),
        bank_accounts: accounts.map((account) => ({
          bank_account_id: account._id,
          balance: toNumber(account.balance),
          created_at: account.created_at
        }))
      },
      depots: depotRows,
      holdings,
      incomes: incomesForUser,
      budgets: (budgetsByUser.get(userKey) ?? []).map((budget) => ({
        budget_id: budget._id,
        category: budget.category,
        target_amount: toNumber(budget.target_amount),
        current_amount: toNumber(budget.current_amount),
        reset_date: budget.reset_date,
        created_at: budget.created_at
      })),
      private_expenses: privateExpensesForUser,
      requests: requestsByUser.get(userKey) ?? [],
      groups: groupContext
    };
  });

  return normalize({
    dataset: "v4",
    generated_at: new Date(),
    users: preparedUsers
  });
}
