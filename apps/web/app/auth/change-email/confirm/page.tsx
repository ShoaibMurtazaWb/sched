"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/api-error";

function ConfirmEmailChangeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("No confirmation token was provided in the link.");
      return;
    }

    let isMounted = true;
    api<{ success: boolean; message: string }>("/auth/email-change/confirm", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(() => {
        if (isMounted) setStatus("success");
      })
      .catch((err) => {
        if (isMounted) {
          setStatus("error");
          setErrorMessage(formatApiError(err, "Failed to confirm email change. The link may have expired or already been used."));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  if (status === "loading") {
    return (
      <div className="flex justify-center p-8">
        <Logo className="h-8 w-8 animate-logo-pulse shrink-0" />
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
            Email Address Updated!
          </CardTitle>
          <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
            Your primary account email address has been successfully updated and verified.
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
          Email Change Failed
        </CardTitle>
        <p className="mt-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
          {errorMessage}
        </p>
      </div>
      <div className="pt-2 flex flex-col gap-2">
        <Link href="/dashboard/settings">
          <Button className="w-full bg-brand hover:bg-brand-hover text-white text-xs font-semibold rounded-xl h-10">
            Back to Settings
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function ConfirmEmailChangePage() {
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
            <Logo className="h-8 w-8 animate-logo-pulse shrink-0" />
          </div>
        }>
          <ConfirmEmailChangeContent />
        </Suspense>
      </Card>
    </div>
  );
}
