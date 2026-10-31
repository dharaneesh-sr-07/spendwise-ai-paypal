const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export const api = {
  health: () => request("/api/health"),
  transactions: () => request("/api/transactions"),
  addTransaction: (transaction) => request("/api/transactions", { method: "POST", body: JSON.stringify(transaction) }),
  deleteTransaction: (id) => request(`/api/transactions/${id}`, { method: "DELETE" }),
  budget: () => request("/api/budget"),
  setBudget: (amount) => request("/api/budget", { method: "PUT", body: JSON.stringify({ amount }) }),
  insights: (expenses) => request("/api/ai-insights", { method: "POST", body: JSON.stringify({ expenses }) }),
  assistantChat: (message) => request("/api/assistant/chat", {
  method: "POST",
  body: JSON.stringify({ message })
}),
  createPayPalOrder: () => request("/api/paypal/create-order", { method: "POST", body: "{}" }),
  capturePayPalOrder: (orderID) => request("/api/paypal/capture-order", { method: "POST", body: JSON.stringify({ orderID }) })
};
