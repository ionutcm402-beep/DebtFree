"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { currencyCodes, currencyDetails, CurrencyCode } from "@/lib/currency";

export function CurrencyPicker({ value, onChange }: { value: CurrencyCode; onChange: (value: CurrencyCode) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = currencyDetails(value);
  const matches = useMemo(() => {
    const search = query.trim().toLowerCase();
    return currencyCodes.map(currencyDetails).filter((currency) => !search || currency.code.toLowerCase().includes(search) || currency.label.toLowerCase().includes(search)).slice(0, 80);
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" aria-label={`Change currency. Current currency: ${current.label}`} className="rounded-none bg-white"><Search className="size-4" /> {current.code} {current.symbol}</Button></DialogTrigger>
      <DialogContent className="max-h-[80vh] rounded-none bg-sheet sm:max-w-lg">
        <DialogHeader><DialogTitle className="text-center font-serif text-3xl">Choose currency</DialogTitle><DialogDescription className="text-center">Search all currencies by name or three-letter code. This changes the currency label; it does not convert your entered amounts.</DialogDescription></DialogHeader>
        <Input aria-label="Search currencies" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search GBP, euro, dollar…" className="rounded-none bg-white text-center" />
        <div className="grid max-h-[50vh] gap-px overflow-y-auto bg-rule sm:grid-cols-2">
          {matches.map((currency) => <button type="button" key={currency.code} onClick={() => { onChange(currency.code); setOpen(false); setQuery(""); }} className={`flex min-h-16 flex-col items-center justify-center border border-transparent bg-sheet px-4 py-2 text-center text-sm hover:border-rule hover:bg-muted ${currency.code === value ? "border-positive font-semibold text-positive" : ""}`}><span className="block">{currency.code} · {currency.symbol}</span><span className="mt-1 block text-xs text-muted-ink">{currency.label}</span></button>)}
        </div>
        {matches.length === 0 ? <p className="py-6 text-center text-sm text-muted-ink">No currency found.</p> : null}
      </DialogContent>
    </Dialog>
  );
}
