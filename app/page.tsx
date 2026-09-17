import { ArrowRight, Check, Snowflake, TrendingDown } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-3 border-b border-rule px-5 py-5 text-center lg:px-8">
        <Link href="/" target="_top" className="font-serif text-xl font-semibold tracking-tight">Debt Payoff Planner</Link>
        <div className="flex items-center gap-3">
          <a href="/login" target="_top" className="text-sm font-medium text-muted-ink hover:text-ink">Log in</a>
          <a href="/preview" target="_top" className="inline-flex h-11 items-center justify-center bg-ink px-5 text-sm font-semibold text-paper transition hover:bg-ink/85">Open planner</a>
        </div>
      </nav>

      <section className="mx-auto grid max-w-5xl gap-12 px-5 py-16 text-center md:py-24 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-serif text-5xl leading-[.98] tracking-[-.04em] sm:text-6xl lg:text-7xl">See the month your debt ends.</h1>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-muted-ink">Enter each balance once. Compare debt avalanche and snowball, see the interest cost, and keep your plan saved for next time.</p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <a href="/preview" target="_top" className="inline-flex h-11 items-center justify-center gap-2 bg-ink px-5 font-semibold text-paper transition hover:bg-ink/85">Try the working planner <ArrowRight className="size-4" /></a>
            <span className="text-sm text-muted-ink">Preview first. Connect an account when ready.</span>
          </div>
        </div>

        <div className="mx-auto w-full max-w-3xl border-y border-rule bg-sheet px-5 py-4 sm:px-7 sm:py-6">
          <div className="flex items-end justify-center gap-5 border-b border-rule pb-5">
            <div><p className="text-sm text-muted-ink">Example debt-free date</p><p className="mt-1 font-serif text-4xl tracking-tight">October 2029</p></div>
            <TrendingDown className="mb-1 size-7 text-avalanche" />
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] border-b border-rule py-4 text-sm font-medium text-muted-ink"><span>Debt</span><span className="px-5">APR</span><span>Balance</span></div>
          {[
            ["Credit card", "24.9%", "£4,820"],
            ["Car finance", "8.7%", "£7,250"],
            ["Overdraft", "39.9%", "£1,400"],
          ].map((row) => (
            <div key={row[0]} className="grid grid-cols-[1fr_auto_auto] border-b border-rule py-4 text-[15px]">
              <span>{row[0]}</span><span className="px-5 tabular-nums">{row[1]}</span><span className="tabular-nums">{row[2]}</span>
            </div>
          ))}
          <div className="mt-6 grid grid-cols-2 gap-px bg-rule">
            <div className="bg-sheet p-4"><span className="inline-flex items-center gap-2 text-sm font-semibold text-avalanche"><TrendingDown className="size-4" /> Avalanche</span><p className="mt-3 font-serif text-2xl">£3,126 interest</p></div>
            <div className="bg-sheet p-4"><span className="inline-flex items-center gap-2 text-sm font-semibold text-snowball"><Snowflake className="size-4" /> Snowball</span><p className="mt-3 font-serif text-2xl">£3,484 interest</p></div>
          </div>
        </div>
      </section>

      <section className="border-y border-rule bg-sheet">
        <div className="mx-auto grid max-w-7xl gap-px bg-rule md:grid-cols-3">
          {["Compare both payoff methods on your real numbers", "Estimate an unknown APR from your statement", "Return anytime — changes save automatically"].map((item) => (
            <div key={item} className="flex items-center justify-center gap-3 bg-sheet px-6 py-7 text-center lg:px-8"><Check className="size-5 shrink-0 text-positive" /><p className="leading-7">{item}</p></div>
          ))}
        </div>
      </section>
    </main>
  );
}
