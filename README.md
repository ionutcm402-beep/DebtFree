# Debt Payoff Planner

A Next.js App Router application that compares debt avalanche and snowball payoff plans, estimates unknown APRs, and saves each user's ledger with Supabase.

It also includes named, repeatable income and essential-expense rows, a payoff-target calculator up to 100 years, searchable world currencies, per-debt extra-payment and date tracking, an actual-payment ledger, monthly debt snapshots with progress milestones, a receipt-powered spending tracker, and a separate money ledger for cash, accounts, crypto, investments, property, pensions, and other assets.

## Local setup

1. Create a Supabase project.
2. Open **SQL Editor**, paste the contents of `supabase/schema.sql`, and run it once.
3. In **Authentication → Providers**, keep Email enabled. Enable Google and add the Google client ID and secret if you want Google login.
4. In **Authentication → URL Configuration**, set the Site URL and add these redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://YOUR_DOMAIN/auth/callback`
5. Copy `.env.example` to `.env.local` and add the project URL and publishable key from **Project Settings → API**. Private receipt scanning works without another key. To enable the optional AI receipt scan, also add `OPENAI_API_KEY`.
6. Install and run:

```bash
pnpm install
pnpm dev
```

Never put a Supabase secret key or `service_role` key in a `NEXT_PUBLIC_` variable.

## Vercel deployment

1. Push this project to a Git repository and import it into Vercel.
2. Add these environment variables for Production, Preview and Development:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` (your production URL)
   - `OPENAI_API_KEY` (optional, enables AI receipt scanning)
   - `OPENAI_RECEIPT_MODEL` (optional, defaults to `gpt-4o-mini`)
3. Deploy, then add the final `https://YOUR_DOMAIN/auth/callback` URL to Supabase's allowed redirect URLs.

The app uses Row Level Security, so the browser can only read and write rows owned by the logged-in user. The payoff calculation is isolated in `lib/simulate.ts`.

## Calculation rules

Each simulated month accrues interest first, pays every active debt's minimum, then sends the remaining fixed monthly budget to the selected priority order. Avalanche uses highest APR first; snowball uses smallest remaining balance first. Simulations stop after 600 months and report debts that do not reach zero.

The target calculator uses the same simulation and a bisection search to find the smallest payment that reaches zero within the selected number of months.
