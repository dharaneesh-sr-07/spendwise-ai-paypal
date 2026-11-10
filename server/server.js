
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

console.log("Gemini API key loaded:", Boolean(process.env.GEMINI_API_KEY));

import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

import {
  initDb,
  addTransaction,
  listTransactions,
  deleteTransaction,
  getBudget,
  setBudget,
  listSavingsGoals,
  addSavingsGoal,
  updateSavingsGoal,
  deleteSavingsGoal
} from "./database.js";

const app = express();
const PORT = Number(process.env.PORT || 5000);

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json({ limit: "100kb" }));

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "SpendWise AI",
    database: "sqlite"
  });
});

// ==========================================
// TRANSACTIONS
// ==========================================

app.get("/api/transactions", (_req, res) => {
  res.json(listTransactions());
});

app.post("/api/transactions", (req, res) => {
  const { title, amount, type, category, date } = req.body ?? {};

  const cleanTitle =
    typeof title === "string" ? title.trim().slice(0, 100) : "";

  const numericAmount = Number(amount);

  const cleanType =
    type === "income" || type === "expense" ? type : null;

  const cleanCategory =
    typeof category === "string" ? category.trim().slice(0, 40) : "";

  const cleanDate =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : new Date().toISOString().slice(0, 10);

  if (
    !cleanTitle ||
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0 ||
    numericAmount > 100000000 ||
    !cleanType ||
    !cleanCategory
  ) {
    return res.status(400).json({
      error: "Enter a title, valid positive amount, type, and category."
    });
  }

  const result = addTransaction({
    title: cleanTitle,
    amount: Math.round(numericAmount * 100) / 100,
    type: cleanType,
    category: cleanCategory,
    date: cleanDate
  });

  res.status(201).json(result);
});

app.delete("/api/transactions/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid transaction ID." });
  }

  if (!deleteTransaction(id)) {
    return res.status(404).json({ error: "Transaction not found." });
  }

  res.status(204).end();
});

// ==========================================
// BUDGET
// ==========================================

app.get("/api/budget", (_req, res) => {
  res.json({ amount: getBudget() });
});

app.put("/api/budget", (req, res) => {
  const amount = Number(req.body?.amount);

  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > 100000000
  ) {
    return res.status(400).json({
      error: "Budget must be a non-negative amount."
    });
  }

  setBudget(Math.round(amount * 100) / 100);

  res.json({ amount: getBudget() });
});

// ==========================================
// GEMINI AI CONFIGURATION
// ==========================================

function requireAI(res) {
  if (!ai) {
    res.status(503).json({
      error: "Gemini is not configured. Add GEMINI_API_KEY to server/.env."
    });

    return false;
  }

  return true;
}

async function generateAI(prompt) {
  const result = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: prompt
  });

  return result.text || "No suggestions were returned. Please try again.";
}

// ==========================================
// AI INSIGHTS
// ==========================================

app.post("/api/ai-insights", async (req, res) => {
  if (!requireAI(res)) return;

  const expenses = req.body?.expenses;

  if (!Array.isArray(expenses) || expenses.length > 200) {
    return res.status(400).json({
      error: "Send an expenses array with at most 200 records."
    });
  }

  const safeExpenses = expenses
    .map((item) => ({
      title: String(item?.title ?? "Expense").slice(0, 80),
      amount: Number(item?.amount) || 0,
      category: String(item?.category ?? "Other").slice(0, 40),
      date: String(item?.date ?? "").slice(0, 10)
    }))
    .filter(
      (item) =>
        item.amount >= 0 &&
        item.amount <= 100000000
    );

  try {
    const insights = await generateAI(`
You are SpendWise AI, a practical budgeting assistant.

Give 3-5 concise saving suggestions and identify the largest category.
Do not invent missing income or balances.
Use Indian Rupees (₹) and simple English.

Expense records:
${JSON.stringify(safeExpenses)}
`);

    res.json({ insights });

  } catch (error) {
    console.error("Gemini insights failed:", error.message);

    res.status(502).json({
      error: "Gemini could not generate insights. Check API quota and model availability."
    });
  }
});

// ==========================================
// AI SPENDING PATTERN ANALYZER
// ==========================================

app.post("/api/spending-analysis", async (_req, res) => {
  if (!requireAI(res)) return;

  const transactions = listTransactions();

  const expenses = transactions.filter(
    (t) => t.type === "expense"
  );

  const income = transactions.filter(
    (t) => t.type === "income"
  );

  const byCategory = {};

  for (const item of expenses) {
    byCategory[item.category] =
      (byCategory[item.category] || 0) + Number(item.amount);
  }

  const totalExpenses = expenses.reduce(
    (sum, t) => sum + Number(t.amount),
    0
  );

  const totalIncome = income.reduce(
    (sum, t) => sum + Number(t.amount),
    0
  );

  const categorySummary = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({
      category,
      amount: Math.round(amount * 100) / 100
    }));

  try {
    const analysis = await generateAI(`
You are SpendWise AI, a personal finance analysis assistant.

Analyze the user's actual recorded transactions.

Explain:
1. Highest spending categories.
2. Income versus expenses.
3. Possible unusual or high spending.
4. Four realistic ways to save money.

Never label something unnecessary without evidence.
Do not invent missing income or balances.
If data is insufficient, clearly mention it.
Use Indian Rupees (₹), not dollars.
Use simple English and clear headings.

Financial summary:
${JSON.stringify({
  totalIncome,
  totalExpenses,
  net: totalIncome - totalExpenses,
  categorySummary,
  transactions: transactions.slice(0, 200)
})}
`);

    res.json({
      analysis,
      totalIncome,
      totalExpenses,
      net: totalIncome - totalExpenses,
      categorySummary,
      transactionCount: transactions.length
    });

  } catch (error) {
    console.error("Spending analysis failed:", error.message);

    res.status(502).json({
      error: "Could not generate spending analysis. Check Gemini quota and try again."
    });
  }
});

// ==========================================
// SMART SAVINGS PLANNER
// ==========================================

// GET: List all savings goals

app.get("/api/savings-goals", (_req, res) => {
  res.json(listSavingsGoals());
});

// POST: Create a savings goal

app.post("/api/savings-goals", (req, res) => {
  const name =
    typeof req.body?.name === "string"
      ? req.body.name.trim().slice(0, 80)
      : "";

  const targetAmount = Number(req.body?.targetAmount);
  const savedAmount = Number(req.body?.savedAmount ?? 0);
  const targetDate = req.body?.targetDate;

  if (
    !name ||
    !Number.isFinite(targetAmount) ||
    targetAmount <= 0 ||
    targetAmount > 100000000 ||
    !Number.isFinite(savedAmount) ||
    savedAmount < 0 ||
    savedAmount > targetAmount ||
    typeof targetDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) ||
    targetDate < new Date().toISOString().slice(0, 10)
  ) {
    return res.status(400).json({
      error: "Enter a goal name, valid target amount, saved amount, and a future target date."
    });
  }

  const result = addSavingsGoal({
    name,
    target_amount: targetAmount,
    saved_amount: savedAmount,
    target_date: targetDate
  });

  res.status(201).json(result);
});

// PUT: Update savings progress

app.put("/api/savings-goals/:id", (req, res) => {
  const id = Number(req.params.id);
  const savedAmount = Number(req.body?.savedAmount);

  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    !Number.isFinite(savedAmount) ||
    savedAmount < 0 ||
    savedAmount > 100000000
  ) {
    return res.status(400).json({
      error: "Enter a valid goal ID and saved amount."
    });
  }

  const goal = listSavingsGoals().find(
    (g) => Number(g.id) === id
  );

  if (!goal) {
    return res.status(404).json({
      error: "Savings goal not found."
    });
  }

  if (savedAmount > Number(goal.target_amount)) {
    return res.status(400).json({
      error: "Saved amount cannot exceed the target amount."
    });
  }

  res.json(updateSavingsGoal(id, savedAmount));
});

// DELETE: Remove a savings goal

app.delete("/api/savings-goals/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "Invalid savings goal ID."
    });
  }

  if (!deleteSavingsGoal(id)) {
    return res.status(404).json({
      error: "Savings goal not found."
    });
  }

  res.status(204).end();
});

// ==========================================
// AI SAVINGS ADVICE
// ==========================================

app.post("/api/savings-advice", async (req, res) => {
  if (!requireAI(res)) return;

  const {
    name,
    targetAmount,
    savedAmount = 0,
    targetDate
  } = req.body ?? {};

  const target = Number(targetAmount);
  const saved = Number(savedAmount);

  if (
    typeof name !== "string" ||
    !name.trim() ||
    !Number.isFinite(target) ||
    target <= 0 ||
    !Number.isFinite(saved) ||
    saved < 0 ||
    saved > target ||
    typeof targetDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)
  ) {
    return res.status(400).json({
      error: "Provide valid savings goal details."
    });
  }

  const remaining = target - saved;

  const today = new Date(
    new Date().toISOString().slice(0, 10) + "T00:00:00Z"
  );

  const deadline = new Date(targetDate + "T00:00:00Z");

  if (Number.isNaN(deadline.getTime())) {
    return res.status(400).json({
      error: "Enter a valid target date."
    });
  }

  const days = Math.max(
    1,
    Math.ceil((deadline - today) / 86400000)
  );

  const transactions = listTransactions();

  const expenseTotal = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const daily = remaining / days;
  const weekly = daily * 7;
  const monthly = daily * 30;

  try {
    const advice = await generateAI(`
You are SpendWise AI, a practical savings coach.

Create realistic savings advice in simple English.

Goal: ${name}
Target amount: ₹${target}
Already saved: ₹${saved}
Remaining amount: ₹${remaining}
Days left: ${days}

Required savings:
Daily: ₹${daily.toFixed(2)}
Weekly: ₹${weekly.toFixed(2)}
Monthly: ₹${monthly.toFixed(2)}

Recorded lifetime expenses: ₹${expenseTotal}

Suggest realistic expense reductions using the recorded data.
Do not assume the user's income.
Do not call a category unnecessary without evidence.
Use Indian Rupees (₹).
`);

    res.json({
      advice,
      remaining,
      days,
      daily,
      weekly,
      monthly
    });

  } catch (error) {
    console.error("Savings advice failed:", error.message);

    res.status(502).json({
      error: "Could not generate savings advice. Check Gemini quota and try again."
    });
  }
});

// ==========================================
// GENERAL AI ASSISTANT
// ==========================================

app.post("/api/assistant/chat", async (req, res) => {
  if (!requireAI(res)) return;

  const message = req.body?.message;

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({
      error: "Please enter a question."
    });
  }

  if (message.length > 5000) {
    return res.status(400).json({
      error: "Your message is too long. Maximum 5000 characters."
    });
  }

  try {
    let result;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await ai.models.generateContent({
          model: "gemini-3.5-flash-lite",
          contents: [
            "You are SpendWise AI, a friendly assistant. Answer questions about expenses, budgeting, saving money, coding, writing and travel planning. Give clear and short answers.",
            "User's message:",
            message.trim()
          ].join("\n\n")
        });

        break;

      } catch (error) {
        const msg = String(error?.message || "");

        const temporary =
          error?.status === 503 ||
          error?.code === 503 ||
          msg.includes("503") ||
          msg.includes("UNAVAILABLE");

        if (!temporary || attempt === 2) {
          throw error;
        }

        await new Promise(
          (resolve) => setTimeout(resolve, 1000 * (2 ** attempt))
        );
      }
    }

    res.json({
      reply: result?.text || "Please try asking again."
    });

  } catch (error) {
    console.error("AI assistant failed:", error.message);

    res.status(503).json({
      error: "Gemini AI is temporarily busy. Please try again in a moment."
    });
  }
});

// ==========================================
// PAYPAL SANDBOX CONFIGURATION
// ==========================================

async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !secret) {
    throw new Error(
      "PayPal Sandbox credentials are missing from server/.env."
    );
  }

  const credentials = Buffer
    .from(`${clientId}:${secret}`)
    .toString("base64");

  const response = await fetch(
    `${process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com"}/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    }
  );

  if (!response.ok) {
    throw new Error(
      `PayPal authentication failed (${response.status}).`
    );
  }

  const data = await response.json();

  return data.access_token;
}

// ==========================================
// PAYPAL CREATE ORDER
// ==========================================

app.post("/api/paypal/create-order", async (_req, res) => {
  try {
    const token = await getPayPalAccessToken();

    const response = await fetch(
      `${process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com"}/v2/checkout/orders`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              amount: {
                currency_code: "USD",
                value: "5.00"
              },
              description: "SpendWise AI hackathon demo payment"
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("PayPal order error:", data);

      return res.status(502).json({
        error: "PayPal could not create the test order."
      });
    }

    res.json({ id: data.id });

  } catch (error) {
    console.error("PayPal create-order error:", error.message);

    res.status(500).json({
      error: "PayPal setup failed. Check the Sandbox credentials in server/.env."
    });
  }
});

// ==========================================
// PAYPAL CAPTURE ORDER
// ==========================================

app.post("/api/paypal/capture-order", async (req, res) => {
  const orderID = req.body?.orderID;

  if (
    typeof orderID !== "string" ||
    !/^[A-Z0-9-]+$/i.test(orderID)
  ) {
    return res.status(400).json({
      error: "A valid PayPal order ID is required."
    });
  }

  try {
    const token = await getPayPalAccessToken();

    const response = await fetch(
      `${process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com"}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("PayPal capture error:", data);

      return res.status(502).json({
        error: "PayPal could not capture this test payment."
      });
    }

    res.json({
      status: data.status,
      orderID: data.id
    });

  } catch (error) {
    console.error("PayPal capture error:", error.message);

    res.status(500).json({
      error: "PayPal payment capture failed."
    });
  }
});

// ==========================================
// ERROR HANDLER
// ==========================================

app.use((err, _req, res, _next) => {
  console.error(err);

  res.status(500).json({
    error: "Unexpected server error."
  });
});

// ==========================================
// START SERVER
// ==========================================

await initDb();

app.listen(PORT, () => {
  console.log(`SpendWise backend running at http://localhost:${PORT}`);
});
