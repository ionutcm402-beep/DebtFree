"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlannerHeader } from "@/components/PlannerHeader";
import { PageIntro } from "@/components/PageIntro";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CurrencyCode, currencyDetails, formatMoney, isCurrencyCode } from "@/lib/currency";
import { previewAccounts } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/client";
import { createId } from "@/lib/id";
import { loadPreviewState, savePreviewState } from "@/lib/preview-storage";

type MoneyAccount = { id: string; name: string; asset_type: string; value: number };
const accountTypes = ["Cash", "Current account", "Savings account", "Debit / prepaid card", "Fixed deposit", "ISA", "Brokerage account", "Crypto", "Stocks", "ETF", "Mutual fund", "Bonds", "Pension", "Property", "Land", "Business ownership", "Precious metals", "Collectibles", "Investment fund", "Other asset"];

export function MoneyLedger({ demo = false }: { demo?: boolean }) {
  const supabase = useMemo(() => demo ? null : createClient(), [demo]);
  const [userId, setUserId] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [accounts, setAccounts] = useState<MoneyAccount[]>(demo ? previewAccounts : []);
  const [loaded, setLoaded] = useState(demo);
  const [status, setStatus] = useState(demo ? "Saved in this browser" : "All changes saved");
  const initial = useRef(true);

  useEffect(() => {
    if (demo) {
      const preview = loadPreviewState();
      queueMicrotask(() => {
        setAccounts(preview.accounts);
        setCurrency(preview.currency);
        initial.current = false;
      });
      return;
    }
    if (!supabase) { window.location.replace("/preview/ledger"); return; }
    let active = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.replace("/login"); return; }
      const [accountsResult, settingsResult] = await Promise.all([
        supabase.from("money_accounts").select("id,name,asset_type,value").order("created_at"),
        supabase.from("user_settings").select("currency").maybeSingle(),
      ]);
      if (!active) return;
      if (accountsResult.error || settingsResult.error) { setStatus("Couldn’t load the ledger"); setLoaded(true); return; }
      setUserId(user.id);
      setAccounts((accountsResult.data ?? []).map((account) => ({ ...account, value: Number(account.value) })));
      setCurrency(isCurrencyCode(settingsResult.data?.currency) ? settingsResult.data.currency : "GBP");
      setLoaded(true);
      queueMicrotask(() => { initial.current = false; });
    })();
    return () => { active = false; };
  }, [demo, supabase]);

  useEffect(() => {
    if (demo || !supabase || !loaded || !userId || initial.current) return;
    setStatus("Saving…");
    const timeout = window.setTimeout(async () => {
      const rows = accounts.map((account) => ({ ...account, user_id: userId }));
      const results = await Promise.all([
        rows.length ? supabase.from("money_accounts").upsert(rows, { onConflict: "id" }) : Promise.resolve({ error: null }),
        supabase.from("user_settings").upsert({ user_id: userId, currency }, { onConflict: "user_id" }),
      ]);
      setStatus(results.some((result) => result.error) ? "Couldn’t save changes" : "All changes saved");
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [accounts, currency, demo, loaded, supabase, userId]);

  function addAccount() {
    const next = [...accounts, { id: createId(), name: "New account", asset_type: "Cash", value: 0 }];
    setAccounts(next);
    if (demo) savePreviewState({ accounts: next });
  }

  function updateAccount(id: string, field: keyof MoneyAccount, value: string) {
    const next = accounts.map((account) => account.id === id ? { ...account, [field]: field === "value" ? Math.max(0, Number(value)) : value } : account);
    setAccounts(next);
    if (demo) savePreviewState({ accounts: next });
  }

  async function removeAccount(id: string) {
    const next = accounts.filter((account) => account.id !== id);
    setAccounts(next);
    if (demo) savePreviewState({ accounts: next });
    if (supabase && !demo) await supabase.from("money_accounts").delete().eq("id", id);
  }

  const total = accounts.reduce((sum, account) => sum + account.value, 0);
  if (!loaded) return <main className="grid min-h-screen place-items-center bg-paper"><p className="font-serif text-2xl">Loading your money ledger…</p></main>;

  return (
    <main className="min-h-screen bg-paper pb-20 text-center text-ink">
      <PlannerHeader demo={demo} active="ledger" currency={currency} onCurrencyChange={(nextCurrency) => { setCurrency(nextCurrency); if (demo) savePreviewState({ currency: nextCurrency }); }} status={status} />
      <div className="planner-content">
        <PageIntro icon={WalletCards} title="Money ledger" description="Keep cash, bank accounts, investments, property and other assets in one place. These values do not change your debt-payoff calculation." />
        <div className="mx-auto mt-8 max-w-xl border-y border-rule bg-sheet px-5 py-5"><p className="text-sm text-muted-ink">Total assets recorded</p><p className="mt-1 font-serif text-5xl">{formatMoney(total, currency)}</p></div>
        <div className="mt-8 border-y border-rule bg-sheet">
          <Table><TableHeader><TableRow className="hover:bg-transparent [&_th]:text-center"><TableHead className="min-w-56">Type</TableHead><TableHead className="min-w-56">Account or asset name</TableHead><TableHead className="min-w-48">Current value</TableHead><TableHead className="w-16"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>
            {accounts.map((account) => <TableRow key={account.id}><TableCell><Select value={account.asset_type} onValueChange={(value) => updateAccount(account.id, "asset_type", value)}><SelectTrigger aria-label={`${account.name} asset type`} className="rounded-none bg-white text-center"><SelectValue /></SelectTrigger><SelectContent>{accountTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></TableCell><TableCell><Input aria-label="Account or asset name" value={account.name} onChange={(event) => updateAccount(account.id, "name", event.target.value)} className="rounded-none bg-white text-center" /></TableCell><TableCell><div className="flex items-center justify-center"><span className="mr-2 text-muted-ink">{currencyDetails(currency).symbol}</span><Input aria-label={`${account.name} current value`} type="number" min="0" step="0.01" value={account.value} onChange={(event) => updateAccount(account.id, "value", event.target.value)} className="rounded-none bg-white text-center tabular-nums" /></div></TableCell><TableCell><Button variant="ghost" size="icon-sm" onClick={() => void removeAccount(account.id)} title={`Delete ${account.name}`}><Trash2 /></Button></TableCell></TableRow>)}
          </TableBody></Table>
          <button type="button" onClick={addAccount} className="action-row-button"><Plus className="size-4" /> Add another account or asset</button>
        </div>
      </div>
    </main>
  );
}
