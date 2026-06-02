// @ts-check

/** @param {unknown} value */
function toNumber(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Map<unknown, any[]>} map
 * @param {unknown} key
 * @param {any} value
 */
function pushMapArray(map, key, value) {
  const current = map.get(key) ?? [];
  current.push(value);
  map.set(key, current);
}

/**
 * @param {Pool} pool
 * @param {{ username?: string | null }} [options]
 */
export async function getPreparedData(pool, options = {}) {
  const { username } = options;

  const usersResult = username
    ? await pool.query(`SELECT * FROM users WHERE username = $1`, [username])
    : await pool.query(`SELECT * FROM users`);

  const users = usersResult.rows;

  if (users.length === 0) {
    return {
      dataset: "v4",
      generated_at: new Date().toISOString(),
      users: []
    };
  }

  const userIds = users.map((u) => u.id);

  const [bankAccountsRes, depotsRes, groupMembersRes, budgetsRes] = await Promise.all([
    pool.query(`SELECT * FROM bank_accounts WHERE user_id = ANY($1)`, [userIds]),
    pool.query(`SELECT * FROM share_accounts WHERE user_id = ANY($1)`, [userIds]),
    pool.query(`SELECT * FROM group_members WHERE user_id = ANY($1)`, [userIds]),
    pool.query(`SELECT * FROM budgets WHERE user_id = ANY($1)`, [userIds])
  ]);

  const bankAccounts = bankAccountsRes.rows;
  const depots = depotsRes.rows;
  const groupMembers = groupMembersRes.rows;
  const budgets = budgetsRes.rows;

  const bankAccountIds = bankAccounts.map((a) => a.id);
  const depotIds = depots.map((d) => d.id);
  const groupIds = [...new Set(groupMembers.map((m) => m.group_id))];

  const [incomesRes, privateExpensesRes, requestsRes, groupsRes, groupActivitiesRes, groupFundingRes, sharesRes, fundingParticipantsRes] = await Promise.all([
    bankAccountIds.length ? pool.query(`SELECT * FROM income WHERE bank_account_id = ANY($1)`, [bankAccountIds]) : { rows: [] },
    bankAccountIds.length ? pool.query(`SELECT * FROM private_expenses WHERE bank_account_id = ANY($1)`, [bankAccountIds]) : { rows: [] },
    bankAccountIds.length ? pool.query(`SELECT * FROM requests WHERE from_bank_account_id = ANY($1) OR to_bank_account_id = ANY($1)`, [bankAccountIds]) : { rows: [] },
    groupIds.length ? pool.query(`SELECT * FROM groups WHERE id = ANY($1)`, [groupIds]) : { rows: [] },
    groupIds.length ? pool.query(`SELECT * FROM group_activities WHERE group_id = ANY($1)`, [groupIds]) : { rows: [] },
    groupIds.length ? pool.query(`SELECT * FROM group_funding WHERE group_id = ANY($1)`, [groupIds]) : { rows: [] },
    depotIds.length ? pool.query(`SELECT * FROM shares WHERE share_account_id = ANY($1) OR depot_id = ANY($1)`, [depotIds]) : { rows: [] },
    bankAccountIds.length ? pool.query(`SELECT * FROM funding_participants WHERE bank_account_id = ANY($1)`, [bankAccountIds]) : { rows: [] }
  ]);

  const incomes = incomesRes.rows;
  const privateExpenses = privateExpensesRes.rows;
  const requests = requestsRes.rows;
  const groups = groupsRes.rows;
  const groupActivities = groupActivitiesRes.rows;
  const groupFunding = groupFundingRes.rows;
  const shares = sharesRes.rows;
  const fundingParticipants = fundingParticipantsRes.rows;

  const fundingIds = groupFunding.map((f) => f.id);
  const groupExpenses = fundingIds.length
    ? (await pool.query(`SELECT * FROM group_expenses WHERE group_funding_id = ANY($1)`, [fundingIds])).rows
    : [];

  const transactionIds = {
    requestIds: requests.map((r) => r.id),
    privateExpenseIds: privateExpenses.map((e) => e.id),
    groupExpenseIds: groupExpenses.map((e) => e.id),
    fundingParticipantIds: fundingParticipants.map((f) => f.id),
    incomeIds: incomes.map((i) => i.id)
  };

  const allTxIds = [
    ...transactionIds.requestIds,
    ...transactionIds.privateExpenseIds,
    ...transactionIds.groupExpenseIds,
    ...transactionIds.fundingParticipantIds,
    ...transactionIds.incomeIds
  ];

  const transactions = allTxIds.length
    ? (await pool.query(
      `SELECT * FROM transactions WHERE request_id = ANY($1) OR private_expense_id = ANY($2) OR group_expense_id = ANY($3) OR funding_participant_id = ANY($4) OR income_id = ANY($5)`,
      [transactionIds.requestIds, transactionIds.privateExpenseIds, transactionIds.groupExpenseIds, transactionIds.fundingParticipantIds, transactionIds.incomeIds]
    )).rows
    : [];

  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const accountById = new Map(bankAccounts.map((a) => [a.id, a]));

  /** @type {Map<any, any[]>} */
  const accountsByUser = new Map();
  for (const account of bankAccounts) {
    pushMapArray(accountsByUser, account.user_id, account);
  }

  /** @type {Map<any, any[]>} */
  const depotsByUser = new Map();
  for (const depot of depots) {
    pushMapArray(depotsByUser, depot.user_id, depot);
  }

  /** @type {Map<any, any[]>} */
  const holdingsByDepot = new Map();
  for (const share of shares) {
    const depotKey = share.share_account_id || share.depot_id;
    if (depotKey) pushMapArray(holdingsByDepot, depotKey, share);
  }

  /** @type {Map<any, any[]>} */
  const incomesByUser = new Map();
  for (const income of incomes) {
    const ownerId = accountById.get(income.bank_account_id)?.user_id;
    if (!ownerId) continue;
    pushMapArray(incomesByUser, ownerId, income);
  }

  /** @type {Map<any, any[]>} */
  const privateExpensesByUser = new Map();
  for (const expense of privateExpenses) {
    const ownerId = accountById.get(expense.bank_account_id)?.user_id;
    if (!ownerId) continue;
    pushMapArray(privateExpensesByUser, ownerId, expense);
  }

  /** @type {Map<any, any[]>} */
  const budgetsByUser = new Map();
  for (const budget of budgets) {
    pushMapArray(budgetsByUser, budget.user_id, budget);
  }

  const userIdSet = new Set(userIds);

  /** @type {Map<any, any[]>} */
  const membershipsByUser = new Map();
  for (const member of groupMembers) {
    pushMapArray(membershipsByUser, member.user_id, {
      group_member_id: member.id,
      group_id: member.group_id,
      group_name: groupsById.get(member.group_id)?.name ?? null,
      role: member.role,
      status: member.status
    });
  }

  const requestsByUser = new Map();
  for (const request of requests) {
    const fromUserId = accountById.get(request.from_bank_account_id)?.user_id;
    const toUserId = accountById.get(request.to_bank_account_id)?.user_id;

    if (fromUserId && userIdSet.has(fromUserId)) {
      pushMapArray(requestsByUser, fromUserId, {
        direction: "outgoing",
        request_id: request.id,
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
        request_id: request.id,
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
    if (tx.request_id) pushMapArray(txBySource.request, tx.request_id, tx);
    if (tx.private_expense_id) pushMapArray(txBySource.private_expense, tx.private_expense_id, tx);
    if (tx.group_expense_id) pushMapArray(txBySource.group_expense, tx.group_expense_id, tx);
    if (tx.funding_participant_id) pushMapArray(txBySource.funding_participant, tx.funding_participant_id, tx);
    if (tx.income_id) pushMapArray(txBySource.income, tx.income_id, tx);
  }

  /** @type {Map<any, any[]>} */
  const fundingsByGroup = new Map();
  for (const funding of groupFunding) {
    pushMapArray(fundingsByGroup, funding.group_id, funding);
  }

  const activitiesByGroup = new Map();
  for (const activity of groupActivities) {
    pushMapArray(activitiesByGroup, activity.group_id, activity);
  }

  /** @type {Map<any, any[]>} */
  const groupExpensesByFunding = new Map();
  for (const expense of groupExpenses) {
    pushMapArray(groupExpensesByFunding, expense.group_funding_id, expense);
  }

  const participantsByFunding = new Map();
  for (const participant of fundingParticipants) {
    pushMapArray(participantsByFunding, participant.group_funding_id, {
      ...participant,
      transactions: txBySource.funding_participant.get(participant.id) ?? []
    });
  }

  const preparedUsers = users.map((user) => {
    const userKey = user.id;
    const accounts = accountsByUser.get(userKey) ?? [];
    const depotRows = depotsByUser.get(userKey) ?? [];
    const incomesForUser = (incomesByUser.get(userKey) ?? []).map((income) => ({
      income_id: income.id,
      bank_account_id: income.bank_account_id,
      amount: toNumber(income.amount),
      state: income.state,
      cycle: income.cycle,
      pay_date: income.pay_date,
      info: income.info,
      created_at: income.created_at,
      transactions: txBySource.income.get(income.id) ?? []
    }));

    const privateExpensesForUser = (privateExpensesByUser.get(userKey) ?? []).map((expense) => ({
      private_expense_id: expense.id,
      bank_account_id: expense.bank_account_id,
      amount: toNumber(expense.amount),
      theo_amount: toNumber(expense.theo_amount),
      state: expense.state,
      cycle: expense.cycle,
      pay_date: expense.pay_date,
      info: expense.info,
      created_at: expense.created_at,
      transactions: txBySource.private_expense.get(expense.id) ?? []
    }));

    const memberships = membershipsByUser.get(userKey) ?? [];
    const groupContext = memberships.map((membership) => {
      const groupId = membership.group_id;
      const fundingItems = (fundingsByGroup.get(groupId) ?? []).map((funding) => ({
        group_funding_id: funding.id,
        group_activity_id: funding.group_activity_id,
        amount: toNumber(funding.amount),
        info: funding.info,
        created_at: funding.created_at,
        participants: participantsByFunding.get(funding.id) ?? [],
        expenses: (groupExpensesByFunding.get(funding.id) ?? []).map((expense) => ({
          group_expense_id: expense.id,
          amount: toNumber(expense.amount),
          state: expense.state,
          cycle: expense.cycle,
          pay_date: expense.pay_date,
          info: expense.info,
          created_at: expense.created_at,
          transactions: txBySource.group_expense.get(expense.id) ?? []
        }))
      }));

      return {
        ...membership,
        activities: activitiesByGroup.get(groupId) ?? [],
        funding: fundingItems
      };
    });

    const holdings = depotRows.flatMap((depot) =>
      (holdingsByDepot.get(depot.id) ?? []).map((holding) => ({
        share_id: holding.id,
        depot_id: holding.share_account_id || holding.depot_id,
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
        user_id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        age: user.age ?? null,
        created_at: user.created_at
      },
      finance_overview: {
        total_bank_balance: Number(totalBalance.toFixed(2)),
        total_income: Number(totalIncome.toFixed(2)),
        bank_accounts: accounts.map((account) => ({
          bank_account_id: account.id,
          balance: toNumber(account.balance),
          created_at: account.created_at
        }))
      },
      depots: depotRows,
      holdings,
      incomes: incomesForUser,
      budgets: (budgetsByUser.get(userKey) ?? []).map((budget) => ({
        budget_id: budget.id,
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

  return {
    dataset: "v4",
    generated_at: new Date().toISOString(),
    users: preparedUsers
  };
}
