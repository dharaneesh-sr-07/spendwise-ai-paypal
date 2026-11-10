import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, ".env") });
console.log("Gemini API key loaded:", Boolean(process.env.GEMINI_API_KEY));

import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import { initDb, addTransaction, listTransactions, deleteTransaction, getBudget, setBudget } from "./database.js";

const app = express();
const PORT = Number(process.env.PORT || 5000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json({ limit: "100kb" }));

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "SpendWise AI", database: "sqlite" });
});

app.get("/api/transactions", (_req, res) => {
  res.json(listTransactions());
});

app.post("/api/transactions", (req, res) => {
  const { title, amount, type, category, date } = req.body ?? {};
  const cleanTitle = typeof title === "string" ? title.trim().slice(0, 100) : "";
  const numericAmount = Number(amount);
  const cleanType = type === "income" ? "income" : type === "expense" ? "expense" : null;
  const cleanCategory = typeof category === "string" ? category.trim().slice(0, 40) : "";
  const cleanDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date : new Date().toISOString().slice(0, 10);

  if (!cleanTitle || !Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 100000000 || !cleanType || !cleanCategory) {
    return res.status(400).json({ error: "Enter a title, valid positive amount, type, and category." });
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
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid transaction ID." });
  const removed = deleteTransaction(id);
  if (!removed) return res.status(404).json({ error: "Transaction not found." });
  res.status(204).end();
});

app.get("/api/budget", (_req, res) => {
  res.json({ amount: getBudget() });
});

app.put("/api/budget", (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) {
    return res.status(400).json({ error: "Budget must be a non-negative amount." });
  }
  setBudget(Math.round(amount * 100) / 100);
  res.json({ amount: getBudget() });
});

app.post("/api/ai-insights", async (req, res) => {
  if (!ai) return res.status(503).json({ error: "Gemini is not configured. Add GEMINI_API_KEY to server/.env." });
  const expenses = req.body?.expenses;
  if (!Array.isArray(expenses) || expenses.length > 200) {
    return res.status(400).json({ error: "Send an expenses array with at most 200 records." });
  }

  const safeExpenses = expenses.map((item) => ({
    title: String(item?.title ?? "Expense").slice(0, 80),
    amount: Number(item?.amount) || 0,
    category: String(item?.category ?? "Other").slice(0, 40),
    date: String(item?.date ?? "").slice(0, 10)
  })).filter((item) => item.amount >= 0 && item.amount <= 100000000);

  try {
    const result = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: [
        "You are SpendWise AI, a practical personal budgeting assistant. Analyze the expense records below. Give 3-5 concise, specific saving suggestions, identify the largest spending category if possible, and avoid pretending to know income or account balances that are not supplied. Do not provide investment, tax, or credit advice. Use clear simple English. Expense records (JSON):",
        JSON.stringify(safeExpenses)
      ].join("\n")
    });
    res.json({ insights: result.text || "No insights were returned. Please try again." });
  } catch (error) {
    console.error("Gemini request failed:", error.message);
    res.status(502).json({ error: "Gemini could not generate insights. Check your API key, quota, and model availability." });
  }
});
app.post("/api/assistant/chat", async (req, res) => {
  if (!ai) {
    return res.status(503).json({
      error: "Gemini is not configured. Check server/.env."
    });
  }

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
        model: "gemini-3.8-flash",
        contents: [
          "You are SpendWise AI, a friendly assistant. Answer questions about expenses, budgeting, saving money, coding, writing and travel planning. Give clear and short answers.",
          "User's message:",
          message.trim()
        ].join("\n\n")
      });

      break;
    } catch (error) {
      const errorMessage = String(error?.message || "");
      const temporaryError =
        error?.status === 503 ||
        error?.code === 503 ||
        errorMessage.includes("503") ||
        errorMessage.includes("UNAVAILABLE");

      if (!temporaryError || attempt === 2) {
        throw error;
      }

      await new Promise(resolve =>
        setTimeout(resolve, 1000 * (2 ** attempt))
      );
    }
  }

  res.json({
    reply: result?.text || "Please try asking again."
  });

} catch (error) {
  console.error("AI assistant request failed:", error.message);

  res.status(503).json({
    error: "Gemini AI is temporarily busy. Please try again in a moment."
  });
}
});
async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("PayPal Sandbox credentials are missing from server/.env.");
  const credentials = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const response = await fetch(`${process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com"}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (!response.ok) throw new Error(`PayPal authentication failed (${response.status}).`);
  return (await response.json()).access_token;
}

app.post("/api/paypal/create-order", async (_req, res) => {
  try {
    const token = await getPayPalAccessToken();
    const response = await fetch(`${process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com"}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          amount: { currency_code: "USD", value: "5.00" },
          description: "SpendWise AI hackathon demo payment"
        }]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("PayPal order creation error:", data);
      return res.status(502).json({ error: "PayPal could not create the test order." });
    }
    res.json({ id: data.id });
  } catch (error) {
    console.error("PayPal create-order error:", error.message);
    res.status(500).json({ error: "PayPal setup failed. Check the Sandbox credentials in server/.env." });
  }
});

app.post("/api/paypal/capture-order", async (req, res) => {
  const orderID = req.body?.orderID;
  if (typeof orderID !== "string" || !/^[A-Z0-9-]+$/i.test(orderID)) {
    return res.status(400).json({ error: "A valid PayPal order ID is required." });
  }
  try {
    const token = await getPayPalAccessToken();
    const response = await fetch(`${process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com"}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("PayPal capture error:", data);
      return res.status(502).json({ error: "PayPal could not capture this test payment." });
    }
    res.json({ status: data.status, orderID: data.id });
  } catch (error) {
    console.error("PayPal capture error:", error.message);
    res.status(500).json({ error: "PayPal payment capture failed." });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error." });
});

await initDb();
app.listen(PORT, () => {
  console.log(`SpendWise backend running at http://localhost:${PORT}`);
});
