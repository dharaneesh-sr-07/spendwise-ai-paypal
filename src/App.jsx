import { useEffect, useMemo, useState } from "react";
import { PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js";
import {
  Activity, ArrowDownLeft, ArrowUpRight, BrainCircuit, MessageCircle, ChartNoAxesColumn,
  CircleDollarSign, CreditCard, LayoutDashboard, LoaderCircle, Plus, RefreshCw,
  ShieldCheck, Trash2, Wallet, X, Sparkles, Target, CalendarDays
} from "lucide-react";
import { api } from "./api.js";

const categories = ["Food", "Transport", "Shopping", "Bills", "Entertainment", "Health", "Education", "Salary", "Other"];
const money = (value, currency = "INR") => new Intl.NumberFormat("en-IN", {
  style: "currency", currency, maximumFractionDigits: 2
}).format(Number(value) || 0);
const today = new Date().toISOString().slice(0, 10);

function StatCard({ icon: Icon, label, value, note, tone = "" }) {
  return <article className="stat-card">
    <div className={`stat-icon ${tone}`}><Icon size={20} /></div>
    <p className="muted stat-label">{label}</p>
    <h2>{value}</h2>
    <span className="stat-note">{note}</span>
  </article>;
}

function PayPalPanel({ onMessage }) {
  const [{ isPending, isRejected }] = usePayPalScriptReducer();
  return <section className="panel paypal-panel">
    <div className="panel-heading">
      <div><span className="eyebrow">SANDBOX DEMO</span><h2>PayPal test checkout</h2></div>
      <div className="paypal-mark">PayPal</div>
    </div>
    <p className="muted">Try a fixed <strong>$5.00 USD</strong> test payment. This is a demo checkout, not a payment for a recorded expense.</p>
    {isPending && <p className="muted inline-status"><LoaderCircle className="spin" size={16} /> Loading PayPal…</p>}
    {isRejected && <p className="error-text">PayPal SDK failed to load. Check the frontend Sandbox Client ID in the root .env file and restart Vite.</p>}
    {!isPending && !isRejected && <PayPalButtons
      style={{ layout: "vertical", shape: "rect", label: "paypal" }}
      createOrder={async () => {
        const order = await api.createPayPalOrder();
        return order.id;
      }}
      onApprove={async (data) => {
        try {
          const result = await api.capturePayPalOrder(data.orderID);
          onMessage(`Sandbox payment result: ${result.status}.`);
        } catch (error) {
          onMessage(error.message, true);
        }
      }}
      onError={(error) => {
        console.error("PayPal checkout error", error);
        onMessage("PayPal checkout failed. Check backend logs and Sandbox credentials.", true);
      }}
    />}
    <p className="tiny muted"><ShieldCheck size={13} /> Sandbox only — no real money is charged.</p>
  </section>;
}

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [budget, setBudget] = useState(15000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [insights, setInsights] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
const [chatInput, setChatInput] = useState("");
const [chatLoading, setChatLoading] = useState(false);
  const [savingsGoals, setSavingsGoals] = useState([]);
  const [goalForm, setGoalForm] = useState({ name: "Emergency fund", targetAmount: "5000", savedAmount: "0", targetDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) });
  const [goalSaving, setGoalSaving] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [savingsAdvice, setSavingsAdvice] = useState({});
  const [adviceLoading, setAdviceLoading] = useState(null);
  const [budgetDraft, setBudgetDraft] = useState("15000");
  const [form, setForm] = useState({ title: "", amount: "", type: "expense", category: "Food", date: today });

  const notify = (text, isError = false) => {
    setMessage(text);
    setMessageError(isError);
    window.setTimeout(() => setMessage(""), 5000);
  };

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [rows, budgetData, goals] = await Promise.all([api.transactions(), api.budget(), api.savingsGoals()]);
      setTransactions(rows);
      setSavingsGoals(goals);
      setBudget(budgetData.amount);
      setBudgetDraft(String(budgetData.amount));
    } catch (err) {
      setError(`${err.message}. Is the backend running with npm run dev?`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const totals = useMemo(() => transactions.reduce((acc, tx) => {
    if (tx.type === "income") acc.income += Number(tx.amount);
    else acc.expenses += Number(tx.amount);
    return acc;
  }, { income: 0, expenses: 0 }), [transactions]);

  const categoryTotals = useMemo(() => {
    const grouped = {};
    transactions.filter((tx) => tx.type === "expense").forEach((tx) => {
      grouped[tx.category] = (grouped[tx.category] || 0) + Number(tx.amount);
    });
    return Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  }, [transactions]);

  const monthExpenses = useMemo(() => transactions.filter((tx) =>
    tx.type === "expense" && tx.date.slice(0, 7) === today.slice(0, 7)
  ).reduce((sum, tx) => sum + Number(tx.amount), 0), [transactions]);

  async function addTransaction(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await api.addTransaction(form);
      setTransactions((current) => [created, ...current].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id));
      setForm({ title: "", amount: "", type: "expense", category: "Food", date: today });
      setShowForm(false);
      notify("Transaction saved to SQLite.");
    } catch (err) {
      notify(err.message, true);
    } finally {
      setSaving(false);
    }
  }

  async function removeTransaction(id) {
    try {
      await api.deleteTransaction(id);
      setTransactions((current) => current.filter((tx) => tx.id !== id));
      notify("Transaction deleted.");
    } catch (err) { notify(err.message, true); }
  }

  async function saveBudget(event) {
    event.preventDefault();
    try {
      const result = await api.setBudget(Number(budgetDraft));
      setBudget(result.amount);
      notify("Monthly budget saved.");
    } catch (err) { notify(err.message, true); }
  }

  async function getInsights() {
    setAiLoading(true);
    setInsights("");
    try {
      const expenses = transactions.filter((tx) => tx.type === "expense");
      const result = await api.insights(expenses);
      setInsights(result.insights);
    } catch (err) {
      setInsights(err.message);
    } finally { setAiLoading(false); }
  }
async function runSpendingAnalysis() {
  setAnalysisLoading(true);
  try { setAnalysis(await api.spendingAnalysis()); }
  catch (err) { notify(err.message, true); }
  finally { setAnalysisLoading(false); }
}
async function createSavingsGoal(event) {
  event.preventDefault(); setGoalSaving(true);
  try {
    const created = await api.addSavingsGoal({ name: goalForm.name, targetAmount: Number(goalForm.targetAmount), savedAmount: Number(goalForm.savedAmount), targetDate: goalForm.targetDate });
    setSavingsGoals((current) => [...current, created].sort((a, b) => a.target_date.localeCompare(b.target_date)));
    setGoalForm({ name: "", targetAmount: "", savedAmount: "0", targetDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) });
    notify("Savings goal saved to SQLite.");
  } catch (err) { notify(err.message, true); }
  finally { setGoalSaving(false); }
}
async function updateGoalProgress(goal) {
  const entered = window.prompt(`Enter total amount saved for ${goal.name} (₹):`, String(goal.saved_amount));
  if (entered === null) return;
  const amount = Number(entered);
  if (!Number.isFinite(amount) || amount < 0 || amount > Number(goal.target_amount)) return notify("Enter a valid amount not greater than the goal target.", true);
  try { const updated = await api.updateSavingsGoal(goal.id, amount); setSavingsGoals((current) => current.map((item) => item.id === goal.id ? updated : item)); setSavingsAdvice((current) => ({ ...current, [goal.id]: null })); notify("Savings progress updated."); }
  catch (err) { notify(err.message, true); }
}
async function removeGoal(id) {
  try { await api.deleteSavingsGoal(id); setSavingsGoals((current) => current.filter((goal) => goal.id !== id)); notify("Savings goal deleted."); }
  catch (err) { notify(err.message, true); }
}
async function getSavingsAdvice(goal) {
  setAdviceLoading(goal.id);
  try { const result = await api.savingsAdvice({ name: goal.name, targetAmount: Number(goal.target_amount), savedAmount: Number(goal.saved_amount), targetDate: goal.target_date }); setSavingsAdvice((current) => ({ ...current, [goal.id]: result })); }
  catch (err) { notify(err.message, true); }
  finally { setAdviceLoading(null); }
}

async function sendChatMessage(event) {
  event.preventDefault();

  const question = chatInput.trim();
  if (!question || chatLoading) return;

  setChatMessages((current) => [
    ...current,
    { role: "user", text: question }
  ]);
  setChatInput("");
  setChatLoading(true);

  try {
    const result = await api.assistantChat(question);

    setChatMessages((current) => [
      ...current,
      {
        role: "assistant",
        text: result.reply || "No answer was returned."
      }
    ]);
  } catch (err) {
    setChatMessages((current) => [
      ...current,
      {
        role: "assistant",
        text: `Sorry, I couldn't answer: ${err.message}`
      }
    ]);
  } finally {
    setChatLoading(false);
  }
}
  const navItems = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Transactions", icon: Activity },
  { name: "Budget", icon: Wallet },
  { name: "Spending Analyzer", icon: ChartNoAxesColumn },
  { name: "Savings Planner", icon: Target },
  { name: "AI Assistant", icon: MessageCircle }
];

  return <div className="app-shell">
    <aside className="sidebar">
      
  <div className="brand">
    <img
      src="/spendwise-logo.jpeg"
      alt="SpendWise AI Logo"
      className="brand-logo"
    />

    <div className="brand-text">
      <strong>SpendWise <span>AI</span></strong>
      <small>Personal finance</small>
    </div>
  </div>

  
      <div className="nav-caption">WORKSPACE</div>
      <nav>
        {navItems.map(({ name, icon: Icon }) => <button key={name} className={`nav-item ${activeTab === name ? "active" : ""}`} onClick={() => setActiveTab(name)}>
          <Icon size={18} /><span>{name}</span>{name === "AI Insights" && <span className="new-tag">AI</span>}
        </button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="secure-note"><ShieldCheck size={17} /><span>Local demo<br /><small>SQLite + Sandbox</small></span></div>
        <p>Spend smarter. Live better.</p>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div><p className="muted breadcrumb">Personal finance / {activeTab}</p><h1>{activeTab === "AI Insights" ? "Your AI money coach" : activeTab}</h1></div>
        <div className="topbar-actions">
          <span className="connection-pill"><span /> Demo workspace</span>
          <button className="icon-button" aria-label="Refresh data" onClick={loadData}><RefreshCw size={17} /></button>
        </div>
      </header>

      {message && <div className={`toast ${messageError ? "toast-error" : ""}`}>{message}<button onClick={() => setMessage("")} aria-label="Dismiss"><X size={16} /></button></div>}
      {error && <div className="alert error-text">{error}</div>}

      {activeTab === "Dashboard" && <>
        <section className="welcome-card">
          <div className="welcome-copy"><span className="eyebrow light">YOUR MONEY, IN FOCUS</span><h2>Make every rupee<br />work smarter.</h2><p>Track spending, plan your budget, and discover better saving habits.</p>
            <button className="button button-light" onClick={() => { setActiveTab("Transactions"); setShowForm(true); }}><Plus size={17} /> Add transaction</button>
          </div>
          <div className="welcome-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-circle"><ChartNoAxesColumn size={62} /></div><span className="art-chip">✦ smarter habits</span></div>
        </section>
        <section className="stats-grid">
          <StatCard icon={ArrowDownLeft} label="TOTAL INCOME" value={money(totals.income)} note="All recorded income" tone="green" />
          <StatCard icon={ArrowUpRight} label="TOTAL EXPENSES" value={money(totals.expenses)} note="All recorded expenses" tone="orange" />
          <StatCard icon={Wallet} label="BALANCE" value={money(totals.income - totals.expenses)} note="Income minus expenses" tone="blue" />
          <StatCard icon={CreditCard} label="THIS MONTH" value={money(monthExpenses)} note="Expenses this month" tone="purple" />
        </section>
        <div className="content-grid">
          <section className="panel">
            <div className="panel-heading"><div><span className="eyebrow">OVERVIEW</span><h2>Spending by category</h2></div><button className="text-button" onClick={() => setActiveTab("Transactions")}>Transactions →</button></div>
            {categoryTotals.length === 0 ? <div className="empty-state">Add an expense to see your category breakdown.</div> : <div className="category-list">{categoryTotals.slice(0, 6).map(([name, amount], index) => {
              const percent = totals.expenses ? amount / totals.expenses * 100 : 0;
              return <div className="category-row" key={name}><div className="category-top"><span>{name}</span><strong>{money(amount)}</strong></div><div className="bar-track"><div className={`bar-fill bar-${index % 5}`} style={{ width: `${Math.min(percent, 100)}%` }} /></div><small className="muted">{percent.toFixed(1)}% of all expenses</small></div>;
            })}</div>}
          </section>
          <section className="panel budget-panel">
            <div className="panel-heading"><div><span className="eyebrow">MONTHLY PLAN</span><h2>Budget progress</h2></div><div className="round-icon"><Wallet size={18} /></div></div>
            <div className="budget-number">{money(monthExpenses)}<span> / {money(budget)}</span></div>
            <div className="bar-track budget-track"><div className="bar-fill bar-budget" style={{ width: `${budget > 0 ? Math.min(monthExpenses / budget * 100, 100) : monthExpenses ? 100 : 0}%` }} /></div>
            <p className="muted">{budget > monthExpenses ? `${money(budget - monthExpenses)} left in your monthly budget` : "You've reached or exceeded your monthly budget."}</p>
            <button className="button button-outline full-width" onClick={() => setActiveTab("Budget")}>Manage budget</button>
          </section>
        </div>
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">LATEST ACTIVITY</span><h2>Recent transactions</h2></div><button className="text-button" onClick={() => setActiveTab("Transactions")}>View all →</button></div>
          <TransactionList transactions={transactions.slice(0, 5)} onDelete={removeTransaction} />
        </section>
        <PayPalPanel onMessage={notify} />
      </>}

      {activeTab === "Transactions" && <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">YOUR RECORDS</span><h2>Transactions</h2></div><button className="button button-primary" onClick={() => setShowForm(!showForm)}><Plus size={17} /> Add new</button></div>
        {showForm && <form className="transaction-form" onSubmit={addTransaction}>
          <label>Transaction name<input required maxLength="100" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Groceries" /></label>
          <label>Amount (₹)<input required min="0.01" max="100000000" step="0.01" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="500" /></label>
          <label>Type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, category: e.target.value === "income" ? "Salary" : "Food" })}><option value="expense">Expense</option><option value="income">Income</option></select></label>
          <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((cat) => <option key={cat}>{cat}</option>)}</select></label>
          <label>Date<input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <div className="form-actions"><button type="button" className="button button-outline" onClick={() => setShowForm(false)}>Cancel</button><button disabled={saving} className="button button-primary">{saving ? "Saving…" : "Save transaction"}</button></div>
        </form>}
        <TransactionList transactions={transactions} onDelete={removeTransaction} />
      </section>}

      {activeTab === "Budget" && <div className="single-column">
        <section className="panel">
          <span className="eyebrow">STAY ON TRACK</span><h2>Monthly budget</h2>
          <p className="muted">Set a spending limit for the current month.</p>
          <div className="budget-big">{money(monthExpenses)} <span>spent this month</span></div>
          <div className="bar-track budget-track"><div className="bar-fill bar-budget" style={{ width: `${budget ? Math.min(monthExpenses / budget * 100, 100) : 0}%` }} /></div>
          <p>{budget ? `${(monthExpenses / budget * 100).toFixed(1)}% of budget used` : "Set a budget to track your progress."}</p>
          <form className="budget-form" onSubmit={saveBudget}><label>Monthly budget (₹)<input type="number" min="0" step="1" value={budgetDraft} onChange={(e) => setBudgetDraft(e.target.value)} required /></label><button className="button button-primary">Save budget</button></form>
        </section>
      </div>}

      {activeTab === "Spending Analyzer" && <div className="single-column wide-column">
        <section className="ai-hero"><div className="ai-icon"><Sparkles size={28} /></div><span className="eyebrow light">GEMINI POWERED ANALYSIS</span><h2>Understand your spending.</h2><p>Analyze your recorded income and expenses, find your biggest categories, and discover practical ways to save.</p></section>
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">YOUR TRANSACTION DATA</span><h2>Spending overview</h2></div><button className="button button-primary" onClick={runSpendingAnalysis} disabled={analysisLoading || transactions.length === 0}><Sparkles size={16} /> {analysisLoading ? "Analyzing…" : "Analyze with AI"}</button></div>
          <div className="stats-grid analyzer-stats"><StatCard icon={ArrowDownLeft} label="RECORDED INCOME" value={money(totals.income)} note="All saved income" tone="green" /><StatCard icon={ArrowUpRight} label="RECORDED EXPENSES" value={money(totals.expenses)} note="All saved expenses" tone="orange" /><StatCard icon={Wallet} label="NET BALANCE" value={money(totals.income - totals.expenses)} note="Income minus expenses" tone="blue" /></div>
          <h3 className="subheading">Expense categories</h3>
          {categoryTotals.length === 0 ? <div className="empty-state">Add expense transactions to see the analysis.</div> : <div className="category-list">{categoryTotals.map(([name, amount], index) => <div className="category-row" key={name}><div className="category-top"><span>{name}</span><strong>{money(amount)}</strong></div><div className="bar-track"><div className={`bar-fill bar-${index % 5}`} style={{ width: `${totals.expenses ? amount / totals.expenses * 100 : 0}%` }} /></div><small className="muted">{totals.expenses ? (amount / totals.expenses * 100).toFixed(1) : 0}% of recorded expenses</small></div>)}</div>}
        </section>
        {analysis && <section className="panel"><span className="eyebrow">PERSONALIZED AI REPORT</span><h2>What Gemini found</h2><div className="analysis-summary"><div><small>Total income</small><strong>{money(analysis.totalIncome)}</strong></div><div><small>Total expenses</small><strong>{money(analysis.totalExpenses)}</strong></div><div><small>Net balance</small><strong>{money(analysis.net)}</strong></div></div><div className="insight-text">{analysis.analysis}</div></section>}
      </div>}

      {activeTab === "Savings Planner" && <div className="single-column wide-column">
        <section className="ai-hero"><div className="ai-icon"><Target size={28} /></div><span className="eyebrow light">SMART SAVINGS GOALS</span><h2>Turn your plans into progress.</h2><p>Create a target, choose a deadline, and see the daily, weekly and monthly amount needed to reach it.</p></section>
        <section className="panel"><span className="eyebrow">CREATE A GOAL</span><h2>New savings goal</h2><form className="goal-form" onSubmit={createSavingsGoal}>
          <label>Goal name<input required maxLength="80" value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} placeholder="e.g. New laptop" /></label>
          <label>Target amount (₹)<input required type="number" min="1" step="0.01" value={goalForm.targetAmount} onChange={(e) => setGoalForm({ ...goalForm, targetAmount: e.target.value })} /></label>
          <label>Already saved (₹)<input required type="number" min="0" step="0.01" value={goalForm.savedAmount} onChange={(e) => setGoalForm({ ...goalForm, savedAmount: e.target.value })} /></label>
          <label>Target date<input required type="date" min={today} value={goalForm.targetDate} onChange={(e) => setGoalForm({ ...goalForm, targetDate: e.target.value })} /></label>
          <button className="button button-primary" disabled={goalSaving}>{goalSaving ? "Saving…" : "Save savings goal"}</button>
        </form></section>
        <section className="panel"><div className="panel-heading"><div><span className="eyebrow">YOUR PLAN</span><h2>Saved goals</h2></div><span className="goal-count">{savingsGoals.length} goals</span></div>
          {savingsGoals.length === 0 ? <div className="empty-state">No savings goals yet. Create your first goal above.</div> : <div className="goal-list">{savingsGoals.map((goal) => { const remaining = Math.max(0, Number(goal.target_amount) - Number(goal.saved_amount)); const days = Math.max(1, Math.ceil((new Date(`${goal.target_date}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000)); const pct = Math.min(100, Number(goal.saved_amount) / Number(goal.target_amount) * 100); const advice = savingsAdvice[goal.id]; return <article className="goal-card" key={goal.id}>
            <div className="goal-card-top"><div><h3>{goal.name}</h3><small className="muted"><CalendarDays size={13} /> Target: {goal.target_date} · {days} day(s) left</small></div><button className="delete-button" onClick={() => removeGoal(goal.id)} title="Delete goal"><Trash2 size={16} /></button></div>
            <div className="goal-amounts"><strong>{money(goal.saved_amount)}</strong><span>of {money(goal.target_amount)}</span><b>{pct.toFixed(1)}%</b></div><div className="bar-track goal-progress"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
            <p className="muted goal-remaining">{remaining > 0 ? `${money(remaining)} remaining · Save about ${money(remaining / days)} daily` : "Goal completed! Great work."}</p>
            <div className="goal-actions"><button className="button button-outline" onClick={() => updateGoalProgress(goal)}>Update progress</button><button className="button button-primary" onClick={() => getSavingsAdvice(goal)} disabled={adviceLoading === goal.id}><Sparkles size={15} /> {adviceLoading === goal.id ? "Thinking…" : "AI saving tips"}</button></div>
            {advice && <div className="goal-advice"><div className="advice-rates"><span>Daily <strong>{money(advice.daily)}</strong></span><span>Weekly <strong>{money(advice.weekly)}</strong></span><span>Monthly <strong>{money(advice.monthly)}</strong></span></div><p className="insight-text">{advice.advice}</p></div>}
          </article>; })}</div>}
        </section>
      </div>}

      {activeTab === "AI Assistant" && <div className="single-column">
  <section className="ai-hero">
    <div className="ai-icon"><MessageCircle size={30} /></div>
    <span className="eyebrow light">YOUR PERSONAL AI</span>
    <h2>Ask me anything.</h2>
    <p>Get help with questions, coding, writing, travel planning, budgeting, and everyday tasks.</p>
  </section>

  <section className="panel">
    <div className="panel-heading">
      <div>
        <span className="eyebrow">GEMINI POWERED</span>
        <h2>SpendWise AI Assistant</h2>
      </div>
      <button
        className="text-button"
        onClick={() => setChatMessages([])}
        disabled={chatLoading}
      >
        Clear chat
      </button>
    </div>

    <div className="chat-messages" aria-live="polite">
      {chatMessages.length === 0 && (
        <div className="empty-state">
          <MessageCircle size={28} />
          <p>Hi! I'm your AI assistant. What would you like help with?</p>
          <p>Try asking: “Plan a two-day trip to Ooty within ₹5,000.”</p>
        </div>
      )}

      {chatMessages.map((item, index) => (
        <div
          key={index}
          className={`chat-message ${item.role === "user" ? "chat-user" : "chat-ai"}`}
        >
          <strong>{item.role === "user" ? "You" : "SpendWise AI"}</strong>
          <p>{item.text}</p>
        </div>
      ))}

      {chatLoading && (
        <p className="muted inline-status">
          <LoaderCircle className="spin" size={16} />
          Thinking…
        </p>
      )}
    </div>

    <form className="chat-form" onSubmit={sendChatMessage}>
      <textarea
        value={chatInput}
        onChange={(event) => setChatInput(event.target.value)}
        placeholder="Ask anything…"
        aria-label="Your message"
        maxLength={5000}
        rows={3}
        disabled={chatLoading}
        required
      />
      <button
        type="submit"
        className="button button-primary"
        disabled={chatLoading || !chatInput.trim()}
      >
        {chatLoading ? "Sending…" : "Send message"}
      </button>
    </form>

    <p className="tiny muted">
      AI answers can be incorrect. Live prices and payment offers must be verified separately.
      Avoid sharing passwords, API keys, or sensitive financial details.
    </p>
  </section>
</div>}
      
      <footer className="footer"><span>SpendWise AI · Hackathon demo</span><span>Built for smarter everyday money habits</span></footer>
    </main>
  </div>;
}

function TransactionList({ transactions, onDelete }) {
  if (!transactions.length) return <div className="empty-state">No transactions yet. Add your first transaction to get started.</div>;
  return <div className="table-wrap"><table className="transactions-table"><thead><tr><th>Transaction</th><th>Category</th><th>Date</th><th>Amount</th><th /></tr></thead><tbody>
    {transactions.map((tx) => <tr key={tx.id}><td><div className="transaction-name"><span className={`transaction-icon ${tx.type}`} >{tx.type === "income" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span><div><strong>{tx.title}</strong><small>{tx.type === "income" ? "Income" : "Expense"}</small></div></div></td><td><span className="category-pill">{tx.category}</span></td><td className="muted">{tx.date}</td><td className={tx.type === "income" ? "amount-income" : "amount-expense"}>{tx.type === "income" ? "+" : "−"}{money(tx.amount)}</td><td><button className="delete-button" title="Delete transaction" onClick={() => onDelete(tx.id)}><Trash2 size={16} /></button></td></tr>)}
  </tbody></table></div>;
}
