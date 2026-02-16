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
      generated_at: new Date().toISOString(),
      users: []
    };
  }

  const userIds = users.map((user) => user._id);
  const userIdSet = new Set(userIds.map((id) => id.toHexString()));

  const [
    bankAccounts,
    groupMembers,
    privateExpenses,
    requests,
    budgets
  ] = await Promise.all([
    db.collection("bank_accounts").find({ user_id: { $in: userIds } }).toArray(),
    db.collection("group_members").find({ user_id: { $in: userIds } }).toArray(),
    db.collection("private_expenses").find({ user_id: { $in: userIds } }).toArray(),
    db.collection("requests").find({
      $or: [{ from_user_id: { $in: userIds } }, { to_user_id: { $in: userIds } }]
    }).toArray(),
    db.collection("budgets").find({ user_id: { $in: userIds } }).toArray()
  ]);

  const bankAccountIds = bankAccounts.map((account) => account._id);
  const groupIds = [...new Set(groupMembers.map((member) => member.group_id.toHexString()))].map((id) => new ObjectId(id));

  const [
    groups,
    shares,
    groupFunding,
    groupActivities
  ] = await Promise.all([
    db.collection("groups").find({ _id: { $in: groupIds } }).toArray(),
    db.collection("shares").find({ bank_account_id: { $in: bankAccountIds } }).toArray(),
    db.collection("group_funding").find({ group_id: { $in: groupIds } }).toArray(),
    db.collection("group_activities").find({ group_id: { $in: groupIds } }).toArray()
  ]);

  const fundingIds = groupFunding.map((funding) => funding._id);

  const [fundingParticipants, groupExpenses] = await Promise.all([
    db.collection("funding_participants").find({ group_funding_id: { $in: fundingIds } }).toArray(),
    db.collection("group_expenses").find({ group_funding_id: { $in: fundingIds } }).toArray()
  ]);

  const requestIds = requests.map((request) => request._id);
  const privateExpenseIds = privateExpenses.map((expense) => expense._id);
  const groupExpenseIds = groupExpenses.map((expense) => expense._id);

  const transactions = await db.collection("transactions").find({
    $or: [
      { request_id: { $in: requestIds } },
      { private_expense_id: { $in: privateExpenseIds } },
      { group_expense_id: { $in: groupExpenseIds } }
    ]
  }).toArray();

  const groupsById = new Map(groups.map((group) => [group._id.toHexString(), group]));
  const groupMembersById = new Map(groupMembers.map((member) => [member._id.toHexString(), member]));

  const bankByUser = new Map();
  for (const account of bankAccounts) {
    pushMapArray(bankByUser, account.user_id.toHexString(), account);
  }

  const membershipsByUser = new Map();
  for (const member of groupMembers) {
    const group = groupsById.get(member.group_id.toHexString());
    pushMapArray(membershipsByUser, member.user_id.toHexString(), {
      group_member_id: member._id,
      group_id: member.group_id,
      group_name: group?.name ?? null,
      role: member.role,
      status: member.status
    });
  }

  const privateExpensesByUser = new Map();
  for (const expense of privateExpenses) {
    pushMapArray(privateExpensesByUser, expense.user_id.toHexString(), {
      private_expense_id: expense._id,
      amount: toNumber(expense.amount),
      theo_amount: toNumber(expense.theo_amount),
      info: expense.info,
      state: expense.state,
      due_date: expense.due_date,
      created_at: expense.created_at
    });
  }

  const budgetsByUser = new Map();
  for (const budget of budgets) {
    pushMapArray(budgetsByUser, budget.user_id.toHexString(), {
      budget_id: budget._id,
      category: budget.category,
      target_amount: toNumber(budget.target_amount),
      current_amount: toNumber(budget.current_amount),
      reset_date: budget.reset_date,
      created_at: budget.created_at
    });
  }

  const accountOwnerById = new Map(
    bankAccounts.map((account) => [account._id.toHexString(), account.user_id.toHexString()])
  );

  const holdingsByUser = new Map();
  for (const holding of shares) {
    const ownerId = accountOwnerById.get(holding.bank_account_id.toHexString());
    if (!ownerId) {
      continue;
    }
    pushMapArray(holdingsByUser, ownerId, {
      share_id: holding._id,
      bank_account_id: holding.bank_account_id,
      symbol: holding.symbol,
      units: toNumber(holding.units),
      bought_for: toNumber(holding.bought_for),
      bought_at: holding.bought_at
    });
  }

  const fundingByGroup = new Map();
  for (const funding of groupFunding) {
    pushMapArray(fundingByGroup, funding.group_id.toHexString(), funding);
  }

  const groupExpensesByFunding = new Map();
  for (const expense of groupExpenses) {
    pushMapArray(groupExpensesByFunding, expense.group_funding_id.toHexString(), expense);
  }

  const activitiesByGroup = new Map();
  for (const activity of groupActivities) {
    pushMapArray(activitiesByGroup, activity.group_id.toHexString(), activity);
  }

  const participantsByFunding = new Map();
  for (const participant of fundingParticipants) {
    const member = groupMembersById.get(participant.group_member_id.toHexString());
    pushMapArray(participantsByFunding, participant.group_funding_id.toHexString(), {
      participant_id: participant._id,
      group_member_id: participant.group_member_id,
      user_id: member?.user_id ?? null,
      amount: toNumber(participant.amount),
      created_at: participant.created_at
    });
  }

  const privateExpenseById = new Map(privateExpenses.map((expense) => [expense._id.toHexString(), expense]));

  const requestsByUser = new Map();
  for (const request of requests) {
    const fromUser = request.from_user_id.toHexString();
    const toUser = request.to_user_id.toHexString();
    const privateExpense = request.private_expense_id
      ? privateExpenseById.get(request.private_expense_id.toHexString())
      : null;

    if (userIdSet.has(fromUser)) {
      pushMapArray(requestsByUser, fromUser, {
        direction: "outgoing",
        request_id: request._id,
        other_user_id: request.to_user_id,
        amount: toNumber(request.amount),
        status: request.status,
        due_date: request.due_date,
        category: request.category,
        info: request.info,
        private_expense_id: request.private_expense_id ?? null,
        private_expense_state: privateExpense?.state ?? null,
        created_at: request.created_at
      });
    }

    if (userIdSet.has(toUser)) {
      pushMapArray(requestsByUser, toUser, {
        direction: "incoming",
        request_id: request._id,
        other_user_id: request.from_user_id,
        amount: toNumber(request.amount),
        status: request.status,
        due_date: request.due_date,
        category: request.category,
        info: request.info,
        private_expense_id: request.private_expense_id ?? null,
        private_expense_state: privateExpense?.state ?? null,
        created_at: request.created_at
      });
    }
  }

  const transactionsBySource = {
    request: new Map(),
    private_expense: new Map(),
    group_expense: new Map()
  };

  for (const tx of transactions) {
    if (tx.request_id) {
      pushMapArray(transactionsBySource.request, tx.request_id.toHexString(), tx);
    }
    if (tx.private_expense_id) {
      pushMapArray(transactionsBySource.private_expense, tx.private_expense_id.toHexString(), tx);
    }
    if (tx.group_expense_id) {
      pushMapArray(transactionsBySource.group_expense, tx.group_expense_id.toHexString(), tx);
    }
  }

  const preparedUsers = users.map((user) => {
    const userId = user._id.toHexString();

    const userAccounts = bankByUser.get(userId) ?? [];
    const userHoldings = holdingsByUser.get(userId) ?? [];
    const userPrivateExpenses = privateExpensesByUser.get(userId) ?? [];
    const userRequests = requestsByUser.get(userId) ?? [];
    const userMemberships = membershipsByUser.get(userId) ?? [];

    const groupFundingBlocks = [];
    const groupActivityFeed = [];

    for (const membership of userMemberships) {
      const groupKey = membership.group_id.toHexString();
      const fundings = fundingByGroup.get(groupKey) ?? [];
      const activities = activitiesByGroup.get(groupKey) ?? [];

      for (const activity of activities) {
        groupActivityFeed.push({
          group_id: membership.group_id,
          group_name: membership.group_name,
          activity_id: activity._id,
          info: activity.info,
          date: activity.date,
          created_at: activity.created_at
        });
      }

      for (const funding of fundings) {
        const expensesForFunding = (groupExpensesByFunding.get(funding._id.toHexString()) ?? []).map((expense) => ({
          group_expense_id: expense._id,
          amount: toNumber(expense.amount),
          info: expense.info,
          state: expense.state,
          due_date: expense.due_date,
          created_at: expense.created_at,
          transactions: (transactionsBySource.group_expense.get(expense._id.toHexString()) ?? []).map((tx) => ({
            transaction_id: tx._id,
            amount: toNumber(tx.amount),
            created_at: tx.created_at
          }))
        }));

        const participants = participantsByFunding.get(funding._id.toHexString()) ?? [];

        groupFundingBlocks.push({
          group_id: membership.group_id,
          group_name: membership.group_name,
          group_funding_id: funding._id,
          group_activity_id: funding.group_activity_id ?? null,
          amount: toNumber(funding.amount),
          info: funding.info,
          created_at: funding.created_at,
          participants,
          expenses: expensesForFunding
        });
      }
    }

    const privateExpenseWithTx = userPrivateExpenses.map((expense) => ({
      ...expense,
      transactions: (transactionsBySource.private_expense.get(expense.private_expense_id.toHexString()) ?? []).map((tx) => ({
        transaction_id: tx._id,
        amount: toNumber(tx.amount),
        created_at: tx.created_at
      }))
    }));

    const requestsWithTx = userRequests.map((request) => ({
      ...request,
      transactions: (transactionsBySource.request.get(request.request_id.toHexString()) ?? []).map((tx) => ({
        transaction_id: tx._id,
        amount: toNumber(tx.amount),
        created_at: tx.created_at
      }))
    }));

    const openPrivateExpenseAmount = userPrivateExpenses
      .filter((expense) => expense.state !== "paid")
      .reduce((sum, expense) => sum + (expense.theo_amount ?? 0), 0);

    const pendingIncomingRequests = requestsWithTx.filter(
      (request) => request.direction === "incoming" && request.status === "pending"
    ).length;

    const pendingOutgoingRequests = requestsWithTx.filter(
      (request) => request.direction === "outgoing" && request.status === "pending"
    ).length;

    const totalBalance = userAccounts.reduce((sum, account) => sum + (toNumber(account.balance) ?? 0), 0);
    const investedAmount = userHoldings.reduce((sum, holding) => sum + (holding.bought_for ?? 0), 0);

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
      finance_overview: {
        bank_accounts: userAccounts.map((account) => ({
          bank_account_id: account._id,
          balance: toNumber(account.balance),
          created_at: account.created_at
        })),
        total_bank_balance: Number(totalBalance.toFixed(2)),
        invested_amount: Number(investedAmount.toFixed(2)),
        open_private_expense_amount: Number(openPrivateExpenseAmount.toFixed(2)),
        pending_incoming_requests: pendingIncomingRequests,
        pending_outgoing_requests: pendingOutgoingRequests
      },
      memberships: userMemberships,
      budgets: budgetsByUser.get(userId) ?? [],
      private_expenses: privateExpenseWithTx,
      requests: requestsWithTx,
      holdings: userHoldings,
      group_context: {
        funding: groupFundingBlocks,
        activities: groupActivityFeed.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      }
    };
  });

  return normalize({
    dataset: "v2",
    generated_at: new Date(),
    users: preparedUsers
  });
}
