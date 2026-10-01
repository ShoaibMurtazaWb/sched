"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Logo } from "@/components/logo";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/api-error";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="space-y-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Invalid Reset Link</h2>
          <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
            This password reset link is missing a valid security token. Please request a new link.
          </p>
        </div>
        <div className="pt-2">
          <Link href="/auth/forgot-password">
            <Button className="w-full bg-brand hover:bg-brand-hover text-white text-xs font-semibold rounded-xl h-10">
              Request new reset link
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setPending(true);
    try {
      await api<{ success: boolean; message: string }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token,
          newPassword,
        }),
      });
      setSubmitted(true);
    } catch (err) {
      setError(formatApiError(err, "Failed to reset password. The link may have expired or already been used."));
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <div className="space-y-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Password Reset Complete</h2>
          <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
            Your password has been successfully updated. You can now log in with your new credentials.
          </p>
        </div>
        <div className="pt-2">
          <Link href="/login">
            <Button className="w-full bg-brand hover:bg-brand-hover text-white text-xs font-semibold rounded-xl h-10">
              Sign in with new password
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="pb-2 border-b border-[var(--border-subtle)]">
        <CardTitle className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          Set new password
        </CardTitle>
        <CardDescription className="mt-1 text-xs text-[var(--text-secondary)]">
          Choose a strong password with at least 8 characters.
        </CardDescription>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="newPassword">New Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <Input
              id="newPassword"
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="At least 8 characters"
              required
              autoFocus
              className="pl-9 pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Re-enter new password"
              required
              className="pl-9 pr-9"
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
          Reset Password
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-canvas)] p-4 sm:p-6">
      <Card className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-8 shadow-xs">
        <Link href="/" className="flex items-center gap-2.5 mb-6 group transition-opacity hover:opacity-90">
          <Logo className="h-8 w-8 shrink-0 shadow-2xs group-hover:scale-105 transition-transform duration-150" />
          <div>
            <span className="font-semibold tracking-tight text-[var(--text-primary)] text-base leading-tight">Sched</span>
            <p className="text-[11px] text-[var(--text-muted)] font-mono">Infrastructure for High-Precision Booking</p>
          </div>
        </Link>
        <Suspense fallback={
          <div className="flex justify-center p-8">
            <Spinner size="default" />
          </div>
        }>
          <ResetPasswordForm />
        </Suspense>
      </Card>
    </div>
  );
}
