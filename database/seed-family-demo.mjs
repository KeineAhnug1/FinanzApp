import "dotenv/config";
import { createHash } from "node:crypto";
import { Decimal128, Int32, MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Missing MONGODB_URI env var.");
  process.exit(1);
}

const baseDbName = process.env.MONGODB_DB || "finanzapp";
const dbName = process.env.MONGODB_DB_V3 || `${baseDbName}_v3`;
const client = new MongoClient(uri);

const DEMO_USER = {
  username: "michael.software.vater",
  email: "familienvater.dev@example.com",
  password: "FamilieDev2026!",
  first_name: "Michael",
  last_name: "Becker",
  age: 39,
  income: 6400
};

function d2(value) {
  return Decimal128.fromString(Number(value).toFixed(2));
}

function hashValue(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function dateInMonth(monthDate, day, hour = 9, minute = 0) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const maxDay = new Date(year, month + 1, 0).getDate();
  const safeDay = Math.min(day, maxDay);
  return new Date(Date.UTC(year, month, safeDay, hour, minute, 0, 0));
}

function monthSeries(count) {
  const now = new Date();
  const months = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    months.push(new Date(now.getFullYear(), now.getMonth() - offset, 1));
  }
  return months;
}

async function ensureFinanceRoots(db, userId) {
  let bankAccount = await db.collection("bank_accounts").findOne({ user_id: userId }, { projection: { _id: 1 } });
  if (!bankAccount) {
    const insert = await db.collection("bank_accounts").insertOne({
      user_id: userId,
      balance: d2(0),
      created_at: new Date("2024-01-05T08:00:00.000Z")
    });
    bankAccount = { _id: insert.insertedId };
  }

  const depot = await db.collection("depots").findOne({ user_id: userId }, { projection: { _id: 1 } });
  if (!depot) {
    await db.collection("depots").insertOne({
      user_id: userId,
      created_at: new Date("2024-01-05T08:00:00.000Z")
    });
  }

  return { bankAccountId: bankAccount._id };
}

async function run() {
  await client.connect();
  const db = client.db(dbName);

  await db.collection("users").updateOne(
    { email: DEMO_USER.email },
    {
      $set: {
        username: DEMO_USER.username,
        email: DEMO_USER.email,
        password: DEMO_USER.password,
        hashed_passwort: hashValue(DEMO_USER.password),
        first_name: DEMO_USER.first_name,
        last_name: DEMO_USER.last_name,
        age: new Int32(DEMO_USER.age),
        income: d2(DEMO_USER.income)
      },
      $setOnInsert: {
        created_at: new Date("2024-01-05T08:00:00.000Z")
      }
    },
    { upsert: true }
  );

  const user = await db.collection("users").findOne({ email: DEMO_USER.email }, { projection: { _id: 1 } });
  if (!user) throw new Error("Demo user could not be created.");
  const userId = user._id;
  const { bankAccountId } = await ensureFinanceRoots(db, userId);

  await db.collection("income").deleteMany({ bank_account_id: bankAccountId });
  await db.collection("private_expenses").deleteMany({ bank_account_id: bankAccountId });
  await db.collection("user_categories").deleteMany({ user_id: userId });

  const months = monthSeries(24);
  const incomes = [];
  const expenses = [];

  for (let i = 0; i < months.length; i += 1) {
    const month = months[i];
    const yearlyStep = i >= 12 ? 1 : 0;
    const latestRaise = i >= 20 ? 1 : 0;

    const salary = 5800 + yearlyStep * 280 + latestRaise * 170;
    const childBenefit = 520;
    const grocery = 760 + (i % 5) * 35;
    const utility = 290 + (i % 4) * 18;
    const transport = 420 + (i % 3) * 24;
    const insurance = 250 + (i % 2) * 25;
    const kids = 230 + (i % 3) * 40;

    incomes.push(
      {
        bank_account_id: bankAccountId,
        source: "TechNova GmbH",
        category: "salary",
        amount: d2(salary),
        received_at: dateInMonth(month, 28, 8, 30),
        pay_date: dateInMonth(month, 28, 8, 30),
        note: "Monatsgehalt Softwareentwicklung",
        recurrence: "once",
        cycle: "once",
        state: "open",
        is_active: true,
        info: "TechNova GmbH Monatsgehalt Softwareentwicklung",
        created_at: dateInMonth(month, 28, 8, 32),
        updated_at: dateInMonth(month, 28, 8, 32)
      },
      {
        bank_account_id: bankAccountId,
        source: "Familienkasse",
        category: "other",
        amount: d2(childBenefit),
        received_at: dateInMonth(month, 12, 8, 45),
        pay_date: dateInMonth(month, 12, 8, 45),
        note: "Kindergeld fuer 2 Kinder",
        recurrence: "once",
        cycle: "once",
        state: "open",
        is_active: true,
        info: "Familienkasse Kindergeld fuer 2 Kinder",
        created_at: dateInMonth(month, 12, 8, 46),
        updated_at: dateInMonth(month, 12, 8, 46)
      }
    );

    if ((i + 1) % 3 === 0) {
      incomes.push({
        bank_account_id: bankAccountId,
        source: "TechNova GmbH",
        category: "bonus",
        amount: d2(950 + yearlyStep * 120),
        received_at: dateInMonth(month, 26, 10, 10),
        pay_date: dateInMonth(month, 26, 10, 10),
        note: "Quartalsbonus",
        recurrence: "once",
        cycle: "once",
        state: "open",
        is_active: true,
        info: "TechNova GmbH Quartalsbonus",
        created_at: dateInMonth(month, 26, 10, 11),
        updated_at: dateInMonth(month, 26, 10, 11)
      });
    }

    if (i % 4 === 0) {
      incomes.push({
        bank_account_id: bankAccountId,
        source: "Freelance Projekt API-Migration",
        category: "Consulting",
        amount: d2(640 + (i % 8) * 30),
        received_at: dateInMonth(month, 20, 18, 20),
        pay_date: dateInMonth(month, 20, 18, 20),
        note: "Nebenprojekt am Wochenende",
        recurrence: "once",
        cycle: "once",
        state: "open",
        is_active: true,
        info: "Freelance Projekt API-Migration Nebenprojekt am Wochenende",
        created_at: dateInMonth(month, 20, 18, 21),
        updated_at: dateInMonth(month, 20, 18, 21)
      });
    }

    expenses.push(
      {
        bank_account_id: bankAccountId,
        source: "Vermieter Mueller",
        category: "rent",
        amount: d2(i >= 12 ? 1980 : 1880),
        theo_amount: d2(i >= 12 ? 1980 : 1880),
        spent_at: dateInMonth(month, 3, 7, 30),
        due_date: dateInMonth(month, 3, 7, 30),
        pay_date: dateInMonth(month, 3, 7, 30),
        note: "Miete inkl. Stellplatz",
        recurrence: "once",
        cycle: "once",
        state: "open",
        is_active: true,
        info: "Vermieter Mueller Miete inkl. Stellplatz",
        created_at: dateInMonth(month, 3, 7, 31),
        updated_at: dateInMonth(month, 3, 7, 31)
      },
      {
        bank_account_id: bankAccountId,
        source: "Supermarkt Mix",
        category: "groceries",
        amount: d2(grocery),
        theo_amount: d2(grocery),
        spent_at: dateInMonth(month, 14, 18, 10),
        due_date: dateInMonth(month, 14, 18, 10),
        pay_date: dateInMonth(month, 14, 18, 10),
        note: "Wocheneinkaeufe Familie",
        recurrence: "once",
        cycle: "once",
        state: "open",
        is_active: true,
        info: "Supermarkt Mix Wocheneinkaeufe Familie",
        created_at: dateInMonth(month, 14, 18, 11),
        updated_at: dateInMonth(month, 14, 18, 11)
      },
      {
        bank_account_id: bankAccountId,
        source: "Stadtwerke",
        category: "utilities",
        amount: d2(utility),
        theo_amount: d2(utility),
        spent_at: dateInMonth(month, 8, 9, 5),
        due_date: dateInMonth(month, 8, 9, 5),
        pay_date: dateInMonth(month, 8, 9, 5),
        note: "Strom + Wasser + Gas",
        recurrence: "once",
        cycle: "once",
        state: "open",
        is_active: true,
        info: "Stadtwerke Strom + Wasser + Gas",
        created_at: dateInMonth(month, 8, 9, 6),
        updated_at: dateInMonth(month, 8, 9, 6)
      },
      {
        bank_account_id: bankAccountId,
        source: "Mobilitaetspaket",
        category: "transport",
        amount: d2(transport),
        theo_amount: d2(transport),
        spent_at: dateInMonth(month, 18, 17, 40),
        due_date: dateInMonth(month, 18, 17, 40),
        pay_date: dateInMonth(month, 18, 17, 40),
        note: "Benzin, Bahn, OePNV",
        recurrence: "once",
        cycle: "once",
        state: "open",
        is_active: true,
        info: "Mobilitaetspaket Benzin, Bahn, OePNV",
        created_at: dateInMonth(month, 18, 17, 41),
        updated_at: dateInMonth(month, 18, 17, 41)
      },
      {
        bank_account_id: bankAccountId,
        source: "Versicherungspaket",
        category: "Versicherungen",
        amount: d2(insurance),
        theo_amount: d2(insurance),
        spent_at: dateInMonth(month, 10, 8, 10),
        due_date: dateInMonth(month, 10, 8, 10),
        pay_date: dateInMonth(month, 10, 8, 10),
        note: "Haftpflicht + Hausrat + Rechtsschutz",
        recurrence: "once",
        cycle: "once",
        state: "open",
        is_active: true,
        info: "Versicherungspaket Haftpflicht + Hausrat + Rechtsschutz",
        created_at: dateInMonth(month, 10, 8, 11),
        updated_at: dateInMonth(month, 10, 8, 11)
      },
      {
        bank_account_id: bankAccountId,
        source: "Kinderbetreuung und Schule",
        category: "Kinder",
        amount: d2(kids),
        theo_amount: d2(kids),
        spent_at: dateInMonth(month, 22, 11, 0),
        due_date: dateInMonth(month, 22, 11, 0),
        pay_date: dateInMonth(month, 22, 11, 0),
        note: "Kita, Schulmaterial, Vereinsbeitraege",
        recurrence: "once",
        cycle: "once",
        state: "open",
        is_active: true,
        info: "Kinderbetreuung und Schule Kita, Schulmaterial, Vereinsbeitraege",
        created_at: dateInMonth(month, 22, 11, 1),
        updated_at: dateInMonth(month, 22, 11, 1)
      }
    );

    if (month.getMonth() === 7) {
      expenses.push({
        bank_account_id: bankAccountId,
        source: "Sommerurlaub",
        category: "Urlaub",
        amount: d2(2200 + yearlyStep * 180),
        theo_amount: d2(2200 + yearlyStep * 180),
        spent_at: dateInMonth(month, 5, 14, 30),
        due_date: dateInMonth(month, 5, 14, 30),
        pay_date: dateInMonth(month, 5, 14, 30),
        note: "Familienurlaub",
        recurrence: "once",
        cycle: "once",
        state: "open",
        is_active: true,
        info: "Sommerurlaub Familienurlaub",
        created_at: dateInMonth(month, 5, 14, 31),
        updated_at: dateInMonth(month, 5, 14, 31)
      });
    }

    if (month.getMonth() === 8) {
      expenses.push({
        bank_account_id: bankAccountId,
        source: "Schulanfang",
        category: "Bildung",
        amount: d2(390 + (i % 2) * 40),
        theo_amount: d2(390 + (i % 2) * 40),
        spent_at: dateInMonth(month, 1, 12, 0),
        due_date: dateInMonth(month, 1, 12, 0),
        pay_date: dateInMonth(month, 1, 12, 0),
        note: "Schulmaterial und Kurse",
        recurrence: "once",
        cycle: "once",
        state: "open",
        is_active: true,
        info: "Schulanfang Schulmaterial und Kurse",
        created_at: dateInMonth(month, 1, 12, 1),
        updated_at: dateInMonth(month, 1, 12, 1)
      });
    }
  }

  if (incomes.length) {
    await db.collection("income").insertMany(incomes, { ordered: true });
  }
  if (expenses.length) {
    await db.collection("private_expenses").insertMany(expenses, { ordered: true });
  }

  const customIncomeCategories = ["Consulting"];
  const customExpenseCategories = ["Versicherungen", "Kinder", "Urlaub", "Bildung"];
  const now = new Date();

  for (const category of customIncomeCategories) {
    await db.collection("user_categories").updateOne(
      { user_id: userId, kind: "income", key: category.toLowerCase() },
      {
        $set: { value: category, updated_at: now },
        $setOnInsert: { user_id: userId, kind: "income", key: category.toLowerCase(), created_at: now }
      },
      { upsert: true }
    );
  }

  for (const category of customExpenseCategories) {
    await db.collection("user_categories").updateOne(
      { user_id: userId, kind: "expense", key: category.toLowerCase() },
      {
        $set: { value: category, updated_at: now },
        $setOnInsert: { user_id: userId, kind: "expense", key: category.toLowerCase(), created_at: now }
      },
      { upsert: true }
    );
  }

  console.log("Family demo account created/updated (v3).");
  console.log(`DB: ${dbName}`);
  console.log(`Email: ${DEMO_USER.email}`);
  console.log(`Passwort: ${DEMO_USER.password}`);
  console.log(`Income entries: ${incomes.length}`);
  console.log(`Expense entries: ${expenses.length}`);
}

run()
  .catch((error) => {
    console.error("Family demo seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
