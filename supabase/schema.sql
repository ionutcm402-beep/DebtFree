create extension if not exists "pgcrypto";

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  balance numeric(14, 2) not null check (balance >= 0),
  apr numeric(8, 4) not null check (apr >= 0),
  min_payment numeric(14, 2) not null check (min_payment >= 0),
  extra_payment numeric(14, 2) not null default 0 check (extra_payment >= 0),
  start_date date not null default current_date,
  account_type text not null default 'Other debt',
  created_at timestamptz not null default now()
);

create index if not exists debts_user_id_created_at_idx on public.debts (user_id, created_at);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  extra_payment numeric(14, 2) not null default 0 check (extra_payment >= 0),
  monthly_income numeric(14, 2) not null default 0 check (monthly_income >= 0),
  housing_cost numeric(14, 2) not null default 0 check (housing_cost >= 0),
  utilities_cost numeric(14, 2) not null default 0 check (utilities_cost >= 0),
  food_cost numeric(14, 2) not null default 0 check (food_cost >= 0),
  transport_cost numeric(14, 2) not null default 0 check (transport_cost >= 0),
  other_essential_cost numeric(14, 2) not null default 0 check (other_essential_cost >= 0),
  hourly_rate numeric(10, 2) not null default 0 check (hourly_rate >= 0),
  tax_code text not null default '1257L' check (char_length(tax_code) between 1 and 8),
  ni_category text not null default 'A' check (ni_category in ('A','B','C','D','E','F','H','I','J','K','L','M','N','S','V','Z')),
  pension_percent numeric(5, 2) not null default 0 check (pension_percent between 0 and 100)
);

alter table public.debts add column if not exists extra_payment numeric(14, 2) not null default 0 check (extra_payment >= 0);
alter table public.debts add column if not exists start_date date not null default current_date;
alter table public.debts add column if not exists account_type text not null default 'Other debt';
alter table public.user_settings add column if not exists currency text not null default 'GBP';
alter table public.user_settings drop constraint if exists user_settings_currency_check;
alter table public.user_settings add constraint user_settings_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.user_settings add column if not exists monthly_income numeric(14, 2) not null default 0 check (monthly_income >= 0);
alter table public.user_settings add column if not exists housing_cost numeric(14, 2) not null default 0 check (housing_cost >= 0);
alter table public.user_settings add column if not exists utilities_cost numeric(14, 2) not null default 0 check (utilities_cost >= 0);
alter table public.user_settings add column if not exists food_cost numeric(14, 2) not null default 0 check (food_cost >= 0);
alter table public.user_settings add column if not exists transport_cost numeric(14, 2) not null default 0 check (transport_cost >= 0);
alter table public.user_settings add column if not exists other_essential_cost numeric(14, 2) not null default 0 check (other_essential_cost >= 0);
alter table public.user_settings add column if not exists hourly_rate numeric(10, 2) not null default 0 check (hourly_rate >= 0);
alter table public.user_settings add column if not exists tax_code text not null default '1257L' check (char_length(tax_code) between 1 and 8);
alter table public.user_settings add column if not exists ni_category text not null default 'A' check (ni_category in ('A','B','C','D','E','F','H','I','J','K','L','M','N','S','V','Z'));
alter table public.user_settings add column if not exists pension_percent numeric(5, 2) not null default 0 check (pension_percent between 0 and 100);
alter table public.user_settings add column if not exists forecast_starting_balance numeric(14, 2) not null default 0;
alter table public.user_settings add column if not exists forecast_horizon smallint not null default 30 check (forecast_horizon in (30, 60, 90));
alter table public.user_settings add column if not exists debt_payment_day smallint not null default 28 check (debt_payment_day between 1 and 31);

create table if not exists public.cashflow_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('income', 'essential')),
  name text not null check (char_length(name) between 1 and 120),
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  pay_day smallint not null default 1 check (pay_day between 1 and 31),
  created_at timestamptz not null default now()
);

create index if not exists cashflow_entries_user_id_created_at_idx on public.cashflow_entries (user_id, created_at);
alter table public.cashflow_entries add column if not exists pay_day smallint not null default 1 check (pay_day between 1 and 31);

create table if not exists public.work_shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  hours numeric(6, 2) not null default 0 check (hours between 0 and 24),
  direct_tips numeric(14, 2) not null default 0 check (direct_tips >= 0),
  payroll_gratuity numeric(14, 2) not null default 0 check (payroll_gratuity >= 0),
  other_income numeric(14, 2) not null default 0 check (other_income >= 0),
  note text not null default '' check (char_length(note) <= 240),
  created_at timestamptz not null default now(),
  unique (user_id, work_date)
);

create index if not exists work_shifts_user_id_work_date_idx on public.work_shifts (user_id, work_date desc);

create table if not exists public.money_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  asset_type text not null,
  value numeric(16, 2) not null default 0 check (value >= 0),
  created_at timestamptz not null default now()
);

create index if not exists money_accounts_user_id_created_at_idx on public.money_accounts (user_id, created_at);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant text not null check (char_length(merchant) between 1 and 160),
  expense_date date not null default current_date,
  amount numeric(14, 2) not null check (amount >= 0),
  category text not null,
  source text not null default 'manual' check (source in ('manual', 'receipt_private', 'receipt_ai')),
  created_at timestamptz not null default now()
);

create index if not exists expenses_user_id_expense_date_idx on public.expenses (user_id, expense_date desc);

create table if not exists public.waste_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  waste_date date not null default current_date,
  amount numeric(14, 2) not null check (amount >= 0),
  reason text not null,
  category text not null default 'Other',
  created_at timestamptz not null default now()
);

create index if not exists waste_entries_user_id_waste_date_idx on public.waste_entries (user_id, waste_date desc);

create table if not exists public.saving_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  saving_date date not null default current_date,
  amount numeric(14, 2) not null check (amount >= 0),
  reason text not null,
  category text not null default 'Other',
  allocation_type text not null default 'unassigned' check (allocation_type in ('unassigned', 'available', 'emergency', 'debt')),
  allocation_target text not null default '',
  allocation_label text not null default '',
  allocation_complete boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists saving_entries_user_id_saving_date_idx on public.saving_entries (user_id, saving_date desc);
alter table public.saving_entries add column if not exists allocation_type text not null default 'unassigned' check (allocation_type in ('unassigned', 'available', 'emergency', 'debt'));
alter table public.saving_entries add column if not exists allocation_target text not null default '';
alter table public.saving_entries add column if not exists allocation_label text not null default '';
alter table public.saving_entries add column if not exists allocation_complete boolean not null default false;

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  due_day smallint not null check (due_day between 1 and 31),
  category text not null default 'Other',
  autopay boolean not null default false,
  last_paid_month text check (last_paid_month is null or last_paid_month ~ '^[0-9]{4}-[0-9]{2}$'),
  created_at timestamptz not null default now()
);

create index if not exists bills_user_id_due_day_idx on public.bills (user_id, due_day);

create table if not exists public.money_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  goal_type text not null default 'Custom',
  target_amount numeric(14, 2) not null default 0 check (target_amount >= 0),
  current_amount numeric(14, 2) not null default 0 check (current_amount >= 0),
  target_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists money_goals_user_id_target_date_idx on public.money_goals (user_id, target_date);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  category text not null default 'Other',
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual')),
  renewal_date date not null,
  decision text not null default 'review' check (decision in ('keep', 'review', 'cancel')),
  created_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_renewal_date_idx on public.subscriptions (user_id, renewal_date);

create table if not exists public.category_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (char_length(category) between 1 and 80),
  monthly_limit numeric(14, 2) not null default 0 check (monthly_limit >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, category)
);

create index if not exists category_budgets_user_id_category_idx on public.category_budgets (user_id, category);

create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  debt_id uuid not null references public.debts(id) on delete cascade,
  payment_date date not null default current_date,
  amount numeric(14, 2) not null check (amount > 0),
  note text not null default '' check (char_length(note) <= 240),
  created_at timestamptz not null default now()
);

create index if not exists debt_payments_user_id_payment_date_idx on public.debt_payments (user_id, payment_date desc);
create index if not exists debt_payments_debt_id_idx on public.debt_payments (debt_id);

create table if not exists public.debt_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null default current_date,
  total_balance numeric(16, 2) not null check (total_balance >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

create index if not exists debt_snapshots_user_id_snapshot_date_idx on public.debt_snapshots (user_id, snapshot_date);

alter table public.debts enable row level security;
alter table public.user_settings enable row level security;
alter table public.cashflow_entries enable row level security;
alter table public.work_shifts enable row level security;
alter table public.money_accounts enable row level security;
alter table public.expenses enable row level security;
alter table public.waste_entries enable row level security;
alter table public.saving_entries enable row level security;
alter table public.bills enable row level security;
alter table public.money_goals enable row level security;
alter table public.subscriptions enable row level security;
alter table public.category_budgets enable row level security;
alter table public.debt_payments enable row level security;
alter table public.debt_snapshots enable row level security;

revoke all on table public.debts from anon;
revoke all on table public.user_settings from anon;
revoke all on table public.cashflow_entries from anon;
revoke all on table public.work_shifts from anon;
revoke all on table public.money_accounts from anon;
revoke all on table public.expenses from anon;
revoke all on table public.waste_entries from anon;
revoke all on table public.saving_entries from anon;
revoke all on table public.bills from anon;
revoke all on table public.money_goals from anon;
revoke all on table public.subscriptions from anon;
revoke all on table public.category_budgets from anon;
revoke all on table public.debt_payments from anon;
revoke all on table public.debt_snapshots from anon;
grant select, insert, update, delete on table public.debts to authenticated;
grant select, insert, update, delete on table public.user_settings to authenticated;
grant select, insert, update, delete on table public.cashflow_entries to authenticated;
grant select, insert, update, delete on table public.work_shifts to authenticated;
grant select, insert, update, delete on table public.money_accounts to authenticated;
grant select, insert, update, delete on table public.expenses to authenticated;
grant select, insert, update, delete on table public.waste_entries to authenticated;
grant select, insert, update, delete on table public.saving_entries to authenticated;
grant select, insert, update, delete on table public.bills to authenticated;
grant select, insert, update, delete on table public.money_goals to authenticated;
grant select, insert, update, delete on table public.subscriptions to authenticated;
grant select, insert, update, delete on table public.category_budgets to authenticated;
grant select, insert, update, delete on table public.debt_payments to authenticated;
grant select, insert, update, delete on table public.debt_snapshots to authenticated;

drop policy if exists "Users can read their own debts" on public.debts;
drop policy if exists "Users can add their own debts" on public.debts;
drop policy if exists "Users can update their own debts" on public.debts;
drop policy if exists "Users can delete their own debts" on public.debts;
drop policy if exists "Users can read their own settings" on public.user_settings;
drop policy if exists "Users can add their own settings" on public.user_settings;
drop policy if exists "Users can update their own settings" on public.user_settings;
drop policy if exists "Users can delete their own settings" on public.user_settings;
drop policy if exists "Users can read their own cashflow" on public.cashflow_entries;
drop policy if exists "Users can add their own cashflow" on public.cashflow_entries;
drop policy if exists "Users can update their own cashflow" on public.cashflow_entries;
drop policy if exists "Users can delete their own cashflow" on public.cashflow_entries;
drop policy if exists "Users can read their own work shifts" on public.work_shifts;
drop policy if exists "Users can add their own work shifts" on public.work_shifts;
drop policy if exists "Users can update their own work shifts" on public.work_shifts;
drop policy if exists "Users can delete their own work shifts" on public.work_shifts;
drop policy if exists "Users can read their own money accounts" on public.money_accounts;
drop policy if exists "Users can add their own money accounts" on public.money_accounts;
drop policy if exists "Users can update their own money accounts" on public.money_accounts;
drop policy if exists "Users can delete their own money accounts" on public.money_accounts;
drop policy if exists "Users can read their own expenses" on public.expenses;
drop policy if exists "Users can add their own expenses" on public.expenses;
drop policy if exists "Users can update their own expenses" on public.expenses;
drop policy if exists "Users can delete their own expenses" on public.expenses;
drop policy if exists "Users can read their own waste entries" on public.waste_entries;
drop policy if exists "Users can add their own waste entries" on public.waste_entries;
drop policy if exists "Users can update their own waste entries" on public.waste_entries;
drop policy if exists "Users can delete their own waste entries" on public.waste_entries;
drop policy if exists "Users can read their own saving entries" on public.saving_entries;
drop policy if exists "Users can add their own saving entries" on public.saving_entries;
drop policy if exists "Users can update their own saving entries" on public.saving_entries;
drop policy if exists "Users can delete their own saving entries" on public.saving_entries;
drop policy if exists "Users can read their own bills" on public.bills;
drop policy if exists "Users can add their own bills" on public.bills;
drop policy if exists "Users can update their own bills" on public.bills;
drop policy if exists "Users can delete their own bills" on public.bills;
drop policy if exists "Users can read their own money goals" on public.money_goals;
drop policy if exists "Users can add their own money goals" on public.money_goals;
drop policy if exists "Users can update their own money goals" on public.money_goals;
drop policy if exists "Users can delete their own money goals" on public.money_goals;
drop policy if exists "Users can read their own subscriptions" on public.subscriptions;
drop policy if exists "Users can add their own subscriptions" on public.subscriptions;
drop policy if exists "Users can update their own subscriptions" on public.subscriptions;
drop policy if exists "Users can delete their own subscriptions" on public.subscriptions;
drop policy if exists "Users can read their own category budgets" on public.category_budgets;
drop policy if exists "Users can add their own category budgets" on public.category_budgets;
drop policy if exists "Users can update their own category budgets" on public.category_budgets;
drop policy if exists "Users can delete their own category budgets" on public.category_budgets;
drop policy if exists "Users can read their own debt payments" on public.debt_payments;
drop policy if exists "Users can add their own debt payments" on public.debt_payments;
drop policy if exists "Users can update their own debt payments" on public.debt_payments;
drop policy if exists "Users can delete their own debt payments" on public.debt_payments;
drop policy if exists "Users can read their own debt snapshots" on public.debt_snapshots;
drop policy if exists "Users can add their own debt snapshots" on public.debt_snapshots;
drop policy if exists "Users can update their own debt snapshots" on public.debt_snapshots;
drop policy if exists "Users can delete their own debt snapshots" on public.debt_snapshots;

create policy "Users can read their own debts"
on public.debts for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can add their own debts"
on public.debts for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own debts"
on public.debts for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own debts"
on public.debts for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own settings"
on public.user_settings for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can add their own settings"
on public.user_settings for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own settings"
on public.user_settings for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own settings"
on public.user_settings for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own cashflow"
on public.cashflow_entries for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can add their own cashflow"
on public.cashflow_entries for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can update their own cashflow"
on public.cashflow_entries for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete their own cashflow"
on public.cashflow_entries for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own work shifts"
on public.work_shifts for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can add their own work shifts"
on public.work_shifts for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can update their own work shifts"
on public.work_shifts for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete their own work shifts"
on public.work_shifts for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own money accounts"
on public.money_accounts for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can add their own money accounts"
on public.money_accounts for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can update their own money accounts"
on public.money_accounts for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete their own money accounts"
on public.money_accounts for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own expenses"
on public.expenses for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can add their own expenses"
on public.expenses for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can update their own expenses"
on public.expenses for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete their own expenses"
on public.expenses for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own waste entries"
on public.waste_entries for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can add their own waste entries"
on public.waste_entries for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can update their own waste entries"
on public.waste_entries for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete their own waste entries"
on public.waste_entries for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own saving entries"
on public.saving_entries for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can add their own saving entries"
on public.saving_entries for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can update their own saving entries"
on public.saving_entries for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete their own saving entries"
on public.saving_entries for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own bills"
on public.bills for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can add their own bills"
on public.bills for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can update their own bills"
on public.bills for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete their own bills"
on public.bills for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own money goals"
on public.money_goals for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can add their own money goals"
on public.money_goals for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can update their own money goals"
on public.money_goals for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete their own money goals"
on public.money_goals for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own subscriptions"
on public.subscriptions for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can add their own subscriptions"
on public.subscriptions for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can update their own subscriptions"
on public.subscriptions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete their own subscriptions"
on public.subscriptions for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own category budgets"
on public.category_budgets for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can add their own category budgets"
on public.category_budgets for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can update their own category budgets"
on public.category_budgets for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete their own category budgets"
on public.category_budgets for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own debt payments"
on public.debt_payments for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can add their own debt payments"
on public.debt_payments for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.debts
    where debts.id = debt_payments.debt_id
      and debts.user_id = (select auth.uid())
  )
);
create policy "Users can update their own debt payments"
on public.debt_payments for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.debts
    where debts.id = debt_payments.debt_id
      and debts.user_id = (select auth.uid())
  )
);
create policy "Users can delete their own debt payments"
on public.debt_payments for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own debt snapshots"
on public.debt_snapshots for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can add their own debt snapshots"
on public.debt_snapshots for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can update their own debt snapshots"
on public.debt_snapshots for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users can delete their own debt snapshots"
on public.debt_snapshots for delete to authenticated
using ((select auth.uid()) = user_id);
