# SpendWise AI

A starter personal-finance dashboard built with React + Vite, Express, SQLite, Gemini AI, and PayPal Sandbox.

## Important credential safety

Keys were shared in chat earlier. Treat those values as exposed: revoke/rotate the Gemini key and PayPal Secret before using this project. Do not paste replacement secrets into chat or commit them to GitHub.

## Requirements

- Node.js LTS (Node 20 or newer recommended)
- VS Code
- New Gemini API key from Google AI Studio
- PayPal Sandbox app Client ID and Secret from PayPal Developer Dashboard

## Setup (Windows / VS Code)

1. Extract the ZIP and open the `spendwise-ai` folder in VS Code.
2. In the terminal run:

   ```bash
   npm install
   ```

3. Create `server/.env` using `server/.env.example` as a template. Fill in your rotated credentials locally:

   ```env
   PORT=5000
   GEMINI_API_KEY=your_new_gemini_key
   PAYPAL_CLIENT_ID=your_sandbox_client_id
   PAYPAL_CLIENT_SECRET=your_rotated_sandbox_secret
   PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
   ```

4. In the project root, create a file named `.env` with the PayPal Sandbox Client ID (the Client ID is intended to be public in the browser SDK):

   ```env
   VITE_PAYPAL_CLIENT_ID=your_sandbox_client_id
   VITE_API_BASE_URL=http://localhost:5000
   ```

   You can use `.env.frontend.example` as the template. Never put the PayPal Secret or Gemini key in the root `.env`.

5. Run:

   ```bash
   npm run dev
   ```

6. Open `http://localhost:5173`.

The app creates `server/spendwise.sqlite` automatically when the backend starts. Keep both `.env` files private. The provided `.gitignore` excludes `.env` files.

## Features

- Add and delete income/expense transactions
- SQLite persistence for transactions and budget
- Category expense summary
- Gemini-generated spending suggestions
- PayPal Sandbox demo checkout (fixed USD $5.00 demo payment)

## Notes / limitations

- This is a local hackathon/demo starter, not a production financial service.
- It has no login or user isolation yet. Do not put real users' financial data into a public deployment.
- The PayPal payment is a fixed $5.00 demo payment; it is not a transaction for an actual expense and does not move expense data.
- AI requests send the expense data included in the request to Google's Gemini API. Do not include unnecessary personal information.
- Use only Sandbox credentials for testing. Live payments require additional security, ownership validation, verification, error handling, and compliance work.
- If `better-sqlite3` fails to install, use a current Node.js LTS version and rerun `npm install`.


**Windows install note:** This package uses `sql.js` for SQLite storage so installation does not require Visual Studio C++ Build Tools. The database is saved to `server/spendwise.sqlite`.
