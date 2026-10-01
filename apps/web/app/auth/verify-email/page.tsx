"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Logo } from "@/components/logo";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/api-error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("No verification token was provided in the link.");
      return;
    }

    let isMounted = true;
    api<{ success: boolean; message: string }>("/auth/verify-email/confirm", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(() => {
        if (isMounted) setStatus("success");
      })
      .catch((err) => {
        if (isMounted) {
          setStatus("error");
          setErrorMessage(formatApiError(err, "Verification failed. The link may have expired or already been used."));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-6 text-center">
        <Spinner size="default" />
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Verifying email address…</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">Please wait while we confirm your security token.</p>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="space-y-5 text-left">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div>
          <CardTitle className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Email Verified Successfully!
          </CardTitle>
          <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
            Your email address has been verified. Your account is now fully activated and secured.
          </p>
        </div>
        <div className="pt-2 flex flex-col gap-2">
          <Link href="/dashboard">
            <Button className="w-full bg-brand hover:bg-brand-hover text-white text-xs font-semibold rounded-xl h-10">
              Go to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-left">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
        <AlertCircle className="h-6 w-6" />
      </div>
      <div>
        <CardTitle className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          Verification Failed
        </CardTitle>
        <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
          {errorMessage}
        </p>
      </div>
      <div className="pt-2 flex flex-col gap-2">
        <Link href="/dashboard/settings">
          <Button className="w-full bg-brand hover:bg-brand-hover text-white text-xs font-semibold rounded-xl h-10">
            Go to Settings to Resend
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
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
          <VerifyEmailContent />
        </Suspense>
      </Card>
    </div>
  );
}
