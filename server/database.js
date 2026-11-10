
import initSqlJs from "sql.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(here, "spendwise.sqlite");
let db;

export async function initDb() {
  fs.mkdirSync(here, { recursive: true });

  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const bytes = fs.readFileSync(dbPath);
    db = new SQL.Database(new Uint8Array(bytes));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings (key, value)
    VALUES ('monthly_budget', '15000');

    CREATE TABLE IF NOT EXISTS savings_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      saved_amount REAL NOT NULL DEFAULT 0,
      target_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  saveDb();
}

function ensureDb() {
  if (!db) throw new Error("Database is not initialized.");
}

function saveDb() {
  ensureDb();
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function rows(sql, params = []) {
  ensureDb();

  const stmt = db.prepare(sql);

  try {
    stmt.bind(params);
    const result = [];

    while (stmt.step()) {
      result.push(stmt.getAsObject());
    }

    return result;
  } finally {
    stmt.free();
  }
}

// TRANSACTIONS

export function listTransactions() {
  return rows(
    `SELECT id, title, amount, type, category, date
     FROM transactions
     ORDER BY date DESC, id DESC`
  );
}

export function addTransaction(transaction) {
  ensureDb();

  const stmt = db.prepare(
    `INSERT INTO transactions
     (title, amount, type, category, date)
     VALUES (?, ?, ?, ?, ?)`
  );

  try {
    stmt.run([
      transaction.title,
      transaction.amount,
      transaction.type,
      transaction.category,
      transaction.date
    ]);
  } finally {
    stmt.free();
  }

  const id = db.exec(
    "SELECT last_insert_rowid() AS id"
  )[0].values[0][0];

  saveDb();

  return rows(
    "SELECT id, title, amount, type, category, date FROM transactions WHERE id = ?",
    [id]
  )[0];
}

export function deleteTransaction(id) {
  ensureDb();

  db.run("DELETE FROM transactions WHERE id = ?", [id]);

  const changed = db.getRowsModified() > 0;

  if (changed) saveDb();

  return changed;
}

// MONTHLY BUDGET

export function getBudget() {
  return Number(
    rows(
      "SELECT value FROM settings WHERE key = 'monthly_budget'"
    )[0]?.value ?? 15000
  );
}

export function setBudget(amount) {
  ensureDb();

  db.run(
    `INSERT INTO settings (key, value)
     VALUES ('monthly_budget', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(amount)]
  );

  saveDb();
}

// SAVINGS GOALS

export function listSavingsGoals() {
  return rows(
    `SELECT id, name, target_amount, saved_amount, target_date, created_at
     FROM savings_goals
     ORDER BY id DESC`
  );
}

export function addSavingsGoal(goal) {
  ensureDb();

  const stmt = db.prepare(
    `INSERT INTO savings_goals
     (name, target_amount, saved_amount, target_date)
     VALUES (?, ?, ?, ?)`
  );

  try {
    stmt.run([
      goal.name,
      goal.target_amount,
      goal.saved_amount,
      goal.target_date
    ]);
  } finally {
    stmt.free();
  }

  const id = db.exec(
    "SELECT last_insert_rowid() AS id"
  )[0].values[0][0];

  saveDb();

  return rows(
    "SELECT * FROM savings_goals WHERE id = ?",
    [id]
  )[0];
}

export function updateSavingsGoal(id, savedAmount) {
  ensureDb();

  db.run(
    "UPDATE savings_goals SET saved_amount = ? WHERE id = ?",
    [savedAmount, id]
  );

  saveDb();

  return rows(
    "SELECT * FROM savings_goals WHERE id = ?",
    [id]
  )[0];
}

export function deleteSavingsGoal(id) {
  ensureDb();

  db.run(
    "DELETE FROM savings_goals WHERE id = ?",
    [id]
  );

  const changed = db.getRowsModified() > 0;

  if (changed) saveDb();

  return changed;
}
