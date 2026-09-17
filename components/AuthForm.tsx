"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "forgot" | "reset";

export function AuthForm({ mode }: { mode: Mode }) {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(params.get("error") ?? "");
  const [busy, setBusy] = useState(false);
  const isReset = mode === "reset";
  const needsPassword = mode === "login" || mode === "signup" || isReset;
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

  async function submit() {
    if (busy) return;
    const cleanEmail = email.trim();
    if (!isReset && !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setMessage("Enter a valid email address.");
      return;
    }
    if (needsPassword && password.length < 8) {
      setMessage("Password must contain at least 8 characters.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
        window.location.assign("/app");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/app` } });
        if (error) throw error;
        if (data.session) window.location.assign("/app");
        else setMessage("Check your email to confirm your account.");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
        if (error) throw error;
        setMessage("Password reset instructions are on their way.");
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        window.location.assign("/app");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  async function googleSignIn() {
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback?next=/app` } });
      if (error) throw error;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google sign-in could not start.");
      setBusy(false);
    }
  }

  const title = mode === "login" ? "Welcome back" : mode === "signup" ? "Start your payoff plan" : mode === "forgot" ? "Reset your password" : "Choose a new password";
  const submitLabel = mode === "login" ? "Log in" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Update password";

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-5 py-12 text-ink">
      <section className="w-full max-w-md border-y border-ink bg-sheet px-6 py-8 text-center sm:px-9 sm:py-10">
        <Link href="/" target="_top" className="text-sm font-semibold text-muted-ink hover:text-ink">← Debt Payoff Planner</Link>
        <h1 className="mt-8 font-serif text-4xl tracking-tight">{title}</h1>
        <p className="mt-2 text-[15px] leading-6 text-muted-ink">
          {mode === "forgot" ? "Enter the email address linked to your account." : mode === "reset" ? "Use at least eight characters for your new password." : "Your debts and plan are private to your account."}
        </p>
        {(mode === "login" || mode === "signup") && googleEnabled && <Button type="button" variant="outline" className="mt-7 h-11 w-full rounded-none bg-sheet" onClick={googleSignIn} disabled={busy}>Continue with Google</Button>}
        {(mode === "login" || mode === "signup") && googleEnabled && <div className="my-6 flex items-center gap-3 text-xs text-muted-ink"><span className="h-px flex-1 bg-rule" />or use email<span className="h-px flex-1 bg-rule" /></div>}
        <form onSubmit={submitForm} noValidate className={mode === "forgot" || !googleEnabled ? "mt-7 space-y-5" : "space-y-5"}>
          {!isReset && <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11 rounded-none bg-white text-center" /></div>}
          {needsPassword && <div className="space-y-2"><div className="flex justify-center gap-4"><Label htmlFor="password">Password</Label>{mode === "login" && <a href="/forgot-password" target="_top" className="text-sm text-muted-ink underline underline-offset-4">Forgot password?</a>}</div><Input id="password" type="password" minLength={8} autoComplete={isReset ? "new-password" : mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11 rounded-none bg-white text-center" /></div>}
          {message && <p role="status" aria-live="polite" className="border-l-2 border-snowball pl-3 text-sm leading-6 text-muted-ink">{message}</p>}
          <button type="submit" className="inline-flex h-11 w-full items-center justify-center gap-2 bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50" disabled={busy}>
            {busy ? "Please wait…" : submitLabel}<ArrowRight className="size-4" />
          </button>
        </form>
        {mode === "login" && <p className="mt-7 text-center text-sm text-muted-ink">New here? <a href="/signup" target="_top" className="font-semibold text-ink underline underline-offset-4">Create an account</a></p>}
        {mode === "signup" && <p className="mt-7 text-center text-sm text-muted-ink">Already have an account? <a href="/login" target="_top" className="font-semibold text-ink underline underline-offset-4">Log in</a></p>}
      </section>
    </main>
  );
}
