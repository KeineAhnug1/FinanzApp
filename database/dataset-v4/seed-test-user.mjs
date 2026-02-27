import { ObjectId } from "mongodb";
import { dbName, withDb } from "./db-client.mjs";
import {
  createAnswerLikeEntity,
  createBankAccountEntity,
  createBudgetEntity,
  createDepotEntity,
  createFundingParticipantEntity,
  createGlobalAnswerEntity,
  createGlobalQuestionEntity,
  createGroupActivityEntity,
  createGroupEntity,
  createGroupExpenseEntity,
  createGroupFundingEntity,
  createGroupMemberEntity,
  createIncomeEntity,
  createPrivateExpenseEntity,
  createQuestionLikeEntity,
  createRequestEntity,
  createShareEntity,
  createTransactionEntity,
  createUserEntity
} from "./entity-factory.mjs";

const TEST_EMAIL = "test@test.test";

const ids = {
  users: {
    test: new ObjectId("77a100000000000000000001"),
    lisa: new ObjectId("77a100000000000000000002"),
    marco: new ObjectId("77a100000000000000000003"),
    nina: new ObjectId("77a100000000000000000004"),
    finzbro: new ObjectId("77a100000000000000000005")
  },
  groups: {
    testFinanceCrew: new ObjectId("77a200000000000000000001")
  },
  group_members: {
    testAdmin: new ObjectId("77a210000000000000000001"),
    lisaMember: new ObjectId("77a210000000000000000002"),
    marcoMember: new ObjectId("77a210000000000000000003"),
    ninaMember: new ObjectId("77a210000000000000000004")
  },
  bank_accounts: {
    test: new ObjectId("77a220000000000000000001"),
    lisa: new ObjectId("77a220000000000000000002"),
    marco: new ObjectId("77a220000000000000000003"),
    nina: new ObjectId("77a220000000000000000004")
  },
  depots: {
    test: new ObjectId("77a230000000000000000001"),
    lisa: new ObjectId("77a230000000000000000002")
  },
  private_expenses: {
    testRent: new ObjectId("77a300000000000000000001"),
    testEnergy: new ObjectId("77a300000000000000000002")
  },
  group_activities: {
    planningMeeting: new ObjectId("77a600000000000000000001")
  },
  group_funding: {
    marchBudget: new ObjectId("77a400000000000000000001")
  },
  funding_participants: {
    test: new ObjectId("77a700000000000000000001"),
    lisa: new ObjectId("77a700000000000000000002"),
    marco: new ObjectId("77a700000000000000000003")
  },
  group_expenses: {
    cleaningSupplies: new ObjectId("77a410000000000000000001")
  },
  income: {
    testSalary: new ObjectId("77a800000000000000000001"),
    testSideIncome: new ObjectId("77a800000000000000000002")
  },
  requests: {
    marcoToTestStreaming: new ObjectId("77a500000000000000000001")
  },
  questions: {
    taxes: new ObjectId("77aa00000000000000000001"),
    etf: new ObjectId("77aa00000000000000000002")
  },
  answers: {
    lisaTaxes: new ObjectId("77ab00000000000000000001"),
    testEtf: new ObjectId("77ab00000000000000000002")
  },
  question_likes: {
    testLikesTaxes: new ObjectId("77ac00000000000000000001"),
    lisaLikesEtf: new ObjectId("77ac00000000000000000002")
  },
  answer_likes: {
    testLikesLisaAnswer: new ObjectId("77ad00000000000000000001")
  }
};

const createdAt = new Date("2026-02-20T09:00:00.000Z");

function buildUsers() {
  return [
    createUserEntity({
      _id: ids.users.test,
      username: "test",
      email: TEST_EMAIL,
      password: "test123456",
      first_name: "Test",
      last_name: "User",
      age: 29,
      verification_code: null,
      created_at: createdAt
    }),
    createUserEntity({
      _id: ids.users.lisa,
      username: "lisa.demo",
      email: "lisa.demo@test.test",
      password: "lisa123456",
      first_name: "Lisa",
      last_name: "Mayer",
      age: 27,
      verification_code: null,
      created_at: createdAt
    }),
    createUserEntity({
      _id: ids.users.marco,
      username: "marco.demo",
      email: "marco.demo@test.test",
      password: "marco123456",
      first_name: "Marco",
      last_name: "Schulz",
      age: 31,
      verification_code: null,
      created_at: createdAt
    }),
    createUserEntity({
      _id: ids.users.nina,
      username: "nina.demo",
      email: "nina.demo@test.test",
      password: "nina123456",
      first_name: "Nina",
      last_name: "Becker",
      age: 25,
      verification_code: null,
      created_at: createdAt
    }),
    createUserEntity({
      _id: ids.users.finzbro,
      username: "finzbro",
      email: "finzbro@finanzapp.local",
      password: "finzbro123456",
      first_name: "Finzbro",
      last_name: "Bot",
      age: null,
      verification_code: null,
      created_at: createdAt
    })
  ];
}

function buildData() {
  return {
    groups: [
      createGroupEntity({
        _id: ids.groups.testFinanceCrew,
        name: "Test Finance Crew",
        info: "Demo group for test@test.test",
        address: "Musterstrasse 1, 10115 Berlin",
        created_at: createdAt
      })
    ],
    group_members: [
      createGroupMemberEntity({
        _id: ids.group_members.testAdmin,
        group_id: ids.groups.testFinanceCrew,
        user_id: ids.users.test,
        role: "admin",
        status: "accepted"
      }),
      createGroupMemberEntity({
        _id: ids.group_members.lisaMember,
        group_id: ids.groups.testFinanceCrew,
        user_id: ids.users.lisa,
        role: "member",
        status: "accepted"
      }),
      createGroupMemberEntity({
        _id: ids.group_members.marcoMember,
        group_id: ids.groups.testFinanceCrew,
        user_id: ids.users.marco,
        role: "member",
        status: "accepted"
      }),
      createGroupMemberEntity({
        _id: ids.group_members.ninaMember,
        group_id: ids.groups.testFinanceCrew,
        user_id: ids.users.nina,
        role: "member",
        status: "accepted"
      })
    ],
    bank_accounts: [
      createBankAccountEntity({ _id: ids.bank_accounts.test, user_id: ids.users.test, balance: 3260.5, created_at: createdAt }),
      createBankAccountEntity({ _id: ids.bank_accounts.lisa, user_id: ids.users.lisa, balance: 1890.2, created_at: createdAt }),
      createBankAccountEntity({ _id: ids.bank_accounts.marco, user_id: ids.users.marco, balance: 1435.7, created_at: createdAt }),
      createBankAccountEntity({ _id: ids.bank_accounts.nina, user_id: ids.users.nina, balance: 2122.4, created_at: createdAt })
    ],
    depots: [
      createDepotEntity({ _id: ids.depots.test, user_id: ids.users.test, created_at: createdAt }),
      createDepotEntity({ _id: ids.depots.lisa, user_id: ids.users.lisa, created_at: createdAt })
    ],
    private_expenses: [
      createPrivateExpenseEntity({
        _id: ids.private_expenses.testRent,
        bank_account_id: ids.bank_accounts.test,
        amount: 980,
        theo_amount: 980,
        info: "Rent",
        state: "open",
        cycle: "monthly",
        pay_date: "2026-03-03T00:00:00.000Z",
        created_at: "2026-02-26T11:00:00.000Z"
      }),
      createPrivateExpenseEntity({
        _id: ids.private_expenses.testEnergy,
        bank_account_id: ids.bank_accounts.test,
        amount: 82.4,
        theo_amount: 82.4,
        info: "Energy provider",
        state: "paid",
        cycle: "monthly",
        pay_date: "2026-02-15T00:00:00.000Z",
        created_at: "2026-02-10T08:30:00.000Z"
      })
    ],
    group_activities: [
      createGroupActivityEntity({
        _id: ids.group_activities.planningMeeting,
        group_id: ids.groups.testFinanceCrew,
        info: "Monthly budget planning",
        date: "2026-03-01T18:30:00.000Z",
        created_at: "2026-02-27T16:00:00.000Z"
      })
    ],
    group_funding: [
      createGroupFundingEntity({
        _id: ids.group_funding.marchBudget,
        group_id: ids.groups.testFinanceCrew,
        group_activity_id: ids.group_activities.planningMeeting,
        amount: 600,
        info: "March apartment budget",
        created_at: "2026-03-01T19:00:00.000Z"
      })
    ],
    funding_participants: [
      createFundingParticipantEntity({
        _id: ids.funding_participants.test,
        group_funding_id: ids.group_funding.marchBudget,
        bank_account_id: ids.bank_accounts.test,
        amount: 250,
        created_at: "2026-03-01T19:02:00.000Z"
      }),
      createFundingParticipantEntity({
        _id: ids.funding_participants.lisa,
        group_funding_id: ids.group_funding.marchBudget,
        bank_account_id: ids.bank_accounts.lisa,
        amount: 200,
        created_at: "2026-03-01T19:03:00.000Z"
      }),
      createFundingParticipantEntity({
        _id: ids.funding_participants.marco,
        group_funding_id: ids.group_funding.marchBudget,
        bank_account_id: ids.bank_accounts.marco,
        amount: 150,
        created_at: "2026-03-01T19:04:00.000Z"
      })
    ],
    group_expenses: [
      createGroupExpenseEntity({
        _id: ids.group_expenses.cleaningSupplies,
        group_funding_id: ids.group_funding.marchBudget,
        amount: 73.5,
        info: "Cleaning supplies",
        state: "paid",
        cycle: null,
        pay_date: "2026-03-02T00:00:00.000Z",
        created_at: "2026-03-02T11:10:00.000Z"
      })
    ],
    income: [
      createIncomeEntity({
        _id: ids.income.testSalary,
        bank_account_id: ids.bank_accounts.test,
        amount: 3450,
        info: "Monthly salary",
        state: "received",
        cycle: "monthly",
        pay_date: "2026-02-28T00:00:00.000Z",
        created_at: "2026-02-28T07:01:00.000Z"
      }),
      createIncomeEntity({
        _id: ids.income.testSideIncome,
        bank_account_id: ids.bank_accounts.test,
        amount: 220,
        info: "Freelance side project",
        state: "received",
        cycle: null,
        pay_date: "2026-02-19T00:00:00.000Z",
        created_at: "2026-02-19T18:05:00.000Z"
      })
    ],
    requests: [
      createRequestEntity({
        _id: ids.requests.marcoToTestStreaming,
        from_bank_account_id: ids.bank_accounts.marco,
        to_bank_account_id: ids.bank_accounts.test,
        amount: 14.99,
        due_date: "2026-03-10T00:00:00.000Z",
        info: "Streaming split",
        category: "media",
        status: "pending",
        cycle: "monthly",
        pay_date: null,
        created_at: "2026-03-01T12:30:00.000Z"
      })
    ],
    transactions: [
      createTransactionEntity({
        income_id: ids.income.testSalary,
        created_at: "2026-02-28T07:03:00.000Z"
      }),
      createTransactionEntity({
        group_expense_id: ids.group_expenses.cleaningSupplies,
        created_at: "2026-03-02T11:20:00.000Z"
      }),
      createTransactionEntity({
        funding_participant_id: ids.funding_participants.test,
        created_at: "2026-03-01T19:06:00.000Z"
      })
    ],
    shares: [
      createShareEntity({
        depot_id: ids.depots.test,
        symbol: "NVDA",
        units: 2.4,
        bought_at: "2025-08-14T10:00:00.000Z",
        bought_for: 258
      }),
      createShareEntity({
        depot_id: ids.depots.test,
        symbol: "NVDA",
        units: 1.8,
        bought_at: "2025-11-21T10:00:00.000Z",
        bought_for: 243
      }),
      createShareEntity({
        depot_id: ids.depots.test,
        symbol: "NVDA",
        units: 1.1,
        bought_at: "2026-01-24T10:00:00.000Z",
        bought_for: 154
      }),
      createShareEntity({
        depot_id: ids.depots.test,
        symbol: "NVDA",
        units: 0.9,
        bought_at: "2026-02-13T10:00:00.000Z",
        bought_for: 131
      }),
      createShareEntity({
        depot_id: ids.depots.test,
        symbol: "MSFT",
        units: 2.2,
        bought_at: "2025-09-05T10:00:00.000Z",
        bought_for: 910
      }),
      createShareEntity({
        depot_id: ids.depots.test,
        symbol: "MSFT",
        units: 1.4,
        bought_at: "2025-12-12T10:00:00.000Z",
        bought_for: 614
      }),
      createShareEntity({
        depot_id: ids.depots.test,
        symbol: "MSFT",
        units: 0.8,
        bought_at: "2026-02-06T10:00:00.000Z",
        bought_for: 356
      }),
      createShareEntity({
        depot_id: ids.depots.test,
        symbol: "AAPL",
        units: 3.1,
        bought_at: "2025-10-03T10:00:00.000Z",
        bought_for: 592
      }),
      createShareEntity({
        depot_id: ids.depots.test,
        symbol: "AAPL",
        units: 2.0,
        bought_at: "2026-01-10T10:00:00.000Z",
        bought_for: 384
      }),
      createShareEntity({
        depot_id: ids.depots.test,
        symbol: "AAPL",
        units: 1.3,
        bought_at: "2026-02-20T10:00:00.000Z",
        bought_for: 251
      }),
      createShareEntity({
        depot_id: ids.depots.lisa,
        symbol: "MSFT",
        units: 3.1,
        bought_at: "2026-01-15T10:00:00.000Z",
        bought_for: 930
      })
    ],
    budgets: [
      createBudgetEntity({
        user_id: ids.users.test,
        category: "living",
        target_amount: 1400,
        current_amount: 1062.4,
        reset_date: "2026-04-01T00:00:00.000Z",
        created_at: createdAt
      }),
      createBudgetEntity({
        user_id: ids.users.test,
        category: "investing",
        target_amount: 500,
        current_amount: 310,
        reset_date: "2026-04-01T00:00:00.000Z",
        created_at: createdAt
      })
    ],
    global_questions: [
      createGlobalQuestionEntity({
        _id: ids.questions.taxes,
        from_user_id: ids.users.test,
        thema: "Wie viele Steuern zahle ich auf Aktiengewinne?",
        message: "Ich habe dieses Jahr Aktien mit Gewinn verkauft. Wie hoch ist die steuerliche Belastung in Deutschland?",
        answered: true,
        edited: false,
        created_at: "2026-02-20T11:00:00.000Z"
      }),
      createGlobalQuestionEntity({
        _id: ids.questions.etf,
        from_user_id: ids.users.lisa,
        thema: "ETF Sparplan oder Einzelkauf?",
        message: "Was ist fuer einen langfristigen Einstieg besser: monatlicher Sparplan oder Einzelkauf?",
        answered: true,
        edited: false,
        created_at: "2026-02-21T09:30:00.000Z"
      })
    ],
    global_answers: [
      createGlobalAnswerEntity({
        _id: ids.answers.lisaTaxes,
        question_id: ids.questions.taxes,
        from_user_id: ids.users.lisa,
        message: "In Deutschland faellt in der Regel Abgeltungsteuer plus Soli an. Pruefe Freibetraege.",
        edited: false,
        created_at: "2026-02-20T12:20:00.000Z"
      }),
      createGlobalAnswerEntity({
        _id: ids.answers.testEtf,
        question_id: ids.questions.etf,
        from_user_id: ids.users.test,
        message: "Fuer viele ist ein Sparplan einfacher, weil er den Einstiegszeitpunkt streut.",
        edited: true,
        created_at: "2026-02-21T10:10:00.000Z"
      })
    ],
    question_likes: [
      createQuestionLikeEntity({
        _id: ids.question_likes.testLikesTaxes,
        user_id: ids.users.test,
        question_id: ids.questions.taxes,
        created_at: "2026-02-20T12:30:00.000Z"
      }),
      createQuestionLikeEntity({
        _id: ids.question_likes.lisaLikesEtf,
        user_id: ids.users.lisa,
        question_id: ids.questions.etf,
        created_at: "2026-02-21T10:25:00.000Z"
      })
    ],
    answer_likes: [
      createAnswerLikeEntity({
        _id: ids.answer_likes.testLikesLisaAnswer,
        answer_id: ids.answers.lisaTaxes,
        user_id: ids.users.test,
        created_at: "2026-02-20T12:31:00.000Z"
      })
    ]
  };
}

const upsertOrder = [
  "users",
  "groups",
  "group_members",
  "bank_accounts",
  "depots",
  "private_expenses",
  "group_activities",
  "group_funding",
  "funding_participants",
  "group_expenses",
  "income",
  "requests",
  "transactions",
  "shares",
  "budgets",
  "global_questions",
  "global_answers",
  "question_likes",
  "answer_likes"
];

async function resolveUserIds(db) {
  const seedUsers = [
    { key: "test", email: TEST_EMAIL, username: "test" },
    { key: "lisa", email: "lisa.demo@test.test", username: "lisa.demo" },
    { key: "marco", email: "marco.demo@test.test", username: "marco.demo" },
    { key: "nina", email: "nina.demo@test.test", username: "nina.demo" },
    { key: "finzbro", email: "finzbro@finanzapp.local", username: "finzbro" }
  ];

  for (const user of seedUsers) {
    const byEmail = await db.collection("users").findOne(
      { email: user.email },
      { projection: { _id: 1 } }
    );
    const byUsername = await db.collection("users").findOne(
      { username: user.username },
      { projection: { _id: 1 } }
    );
    const existing = byEmail || byUsername;
    if (existing?._id) {
      ids.users[user.key] = existing._id;
    }
  }
}

async function upsertUsers(db) {
  const users = buildUsers();

  for (const user of users) {
    await db.collection("users").replaceOne({ _id: user._id }, user, { upsert: true });
    await db.collection("users").deleteMany({ email: user.email, _id: { $ne: user._id } });
    await db.collection("users").deleteMany({ username: user.username, _id: { $ne: user._id } });
  }
}

async function upsertCollectionDocs(db, collectionName, docs) {
  if (!Array.isArray(docs) || docs.length === 0) return 0;
  let changed = 0;

  for (const doc of docs) {
    if (!doc?._id) continue;
    const result = await db.collection(collectionName).replaceOne({ _id: doc._id }, doc, { upsert: true });
    changed += Number(result.modifiedCount || 0) + Number(result.upsertedCount || 0);
  }

  return changed;
}

async function run() {
  try {
    await withDb(async (db) => {
      await resolveUserIds(db);
      await upsertUsers(db);
      console.log(`Users upserted in ${dbName}.users for ${TEST_EMAIL} and demo members.`);

      const data = buildData();
      const depotIdsForSeedShares = Array.from(
        new Set((data.shares || []).map((share) => String(share?.depot_id || "").trim()).filter(Boolean))
      );
      const objectDepotIdsForSeedShares = depotIdsForSeedShares.map((id) => new ObjectId(id));
      if (objectDepotIdsForSeedShares.length) {
        await db.collection("shares").deleteMany({ depot_id: { $in: objectDepotIdsForSeedShares } });
      }
      console.log(`Cleared existing shares for seed depots [${depotIdsForSeedShares.join(", ")}] in ${dbName}.shares`);
      for (const name of upsertOrder) {
        if (name === "users") continue;
        if (name === "shares") continue;
        const changed = await upsertCollectionDocs(db, name, data[name] || []);
        console.log(`Upserted ${changed} docs in ${dbName}.${name}`);
      }
      if (Array.isArray(data.shares) && data.shares.length) {
        const result = await db.collection("shares").insertMany(data.shares, { ordered: true });
        console.log(`Inserted ${Object.keys(result?.insertedIds || {}).length} docs in ${dbName}.shares`);
      } else {
        console.log(`Inserted 0 docs in ${dbName}.shares`);
      }
    });

    console.log(`Test seed for "${TEST_EMAIL}" finished in database "${dbName}".`);
  } catch (error) {
    console.error("Test seed failed:", error);
    process.exitCode = 1;
  }
}

run();
