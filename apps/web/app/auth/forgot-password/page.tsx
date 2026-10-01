"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Logo } from "@/components/logo";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/api-error";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Please enter your account email address.");
      return;
    }

    setPending(true);
    try {
      await api<{ success: boolean; message: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: trimmed }),
      });
      setSubmitted(true);
    } catch (err) {
      setError(formatApiError(err, "Failed to send reset link. Please try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-canvas)] p-4 sm:p-6">
      <Card className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-8 shadow-xs">
        {/* Brand Header */}
        <Link href="/" className="flex items-center gap-2.5 mb-6 group transition-opacity hover:opacity-90">
          <Logo className="h-8 w-8 shrink-0 shadow-2xs group-hover:scale-105 transition-transform duration-150" />
          <div>
            <span className="font-semibold tracking-tight text-[var(--text-primary)] text-base leading-tight">Sched</span>
            <p className="text-[11px] text-[var(--text-muted)] font-mono">Infrastructure for High-Precision Booking</p>
          </div>
        </Link>

        {submitted ? (
          <div className="space-y-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Check your inbox</h2>
              <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                If an account exists for <span className="font-mono font-medium text-[var(--text-primary)]">{email}</span>, you will receive password reset instructions shortly.
              </p>
            </div>
            <div className="pt-2">
              <Link href="/login">
                <Button className="w-full bg-[var(--bg-surface-subtle)] border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] text-xs font-semibold rounded-xl h-10">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Return to sign in
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="pb-2 border-b border-[var(--border-subtle)]">
              <CardTitle className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                Reset your password
              </CardTitle>
              <CardDescription className="mt-1 text-xs text-[var(--text-secondary)]">
                Enter your registered email address and we'll send you a link to reset your password.
              </CardDescription>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="you@company.com"
                    required
                    autoFocus
                    className="pl-9"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] p-3 text-xs text-[var(--status-danger-text)] font-medium">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={pending}
                className="w-full bg-brand hover:bg-brand-hover text-white font-semibold rounded-xl h-10 text-xs shadow-xs"
              >
                {pending ? <Spinner size="sm" className="mr-2" /> : null}
                Send reset link
              </Button>
            </form>

            <div className="text-center pt-2">
              <Link href="/login" className="inline-flex items-center text-xs font-semibold text-brand hover:underline">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back to sign in
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
