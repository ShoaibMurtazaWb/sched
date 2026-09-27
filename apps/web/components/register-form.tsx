"use client";

import { registerBodySchema } from "@sched/api-contract";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Globe, Lock, Mail, User, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Logo } from "@/components/logo";
import { api } from "@/lib/api";
import { fieldErrors, formatApiError } from "@/lib/api-error";

const FALLBACK_TIMEZONES = [
  "UTC",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Phoenix",
  "America/Sao_Paulo",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Melbourne",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/Dublin",
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Rome",
  "Pacific/Auckland",
  "Pacific/Honolulu",
];

export function RegisterForm() {
  const [timezones, setTimezones] = useState<string[]>(FALLBACK_TIMEZONES);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check if user is already authenticated & auto-detect timezone
  useEffect(() => {
    api("/auth/me")
      .then(() => {
        window.location.replace("/dashboard");
      })
      .catch(() => {
        setIsCheckingAuth(false);
      });

    try {
      if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
        const supported = Intl.supportedValuesOf("timeZone");
        if (supported.length > 0) {
          setTimezones(supported);
        }
      }
      const userZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (userZone) {
        setTimezone(userZone);
      }
    } catch {
      // fallback
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setFields({});

    const parsed = registerBodySchema.safeParse({
      name,
      username,
      email,
      password,
      timezone,
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!next[key]) next[key] = issue.message;
      }
      setFields(next);
      return;
    }

    setPending(true);
    try {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      window.location.href = "/dashboard";
    } catch (caught) {
      setError(formatApiError(caught, "Could not create the account. Please check your details."));
      setFields(fieldErrors(caught));
      setPending(false);
    }
  }

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-canvas)]">
        <div className="flex flex-col items-center gap-3 text-sm text-[var(--text-secondary)] font-medium">
          <Spinner size="default" />
          <span>Verifying session…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-canvas)] p-4 sm:p-6 py-12">
      <Card className="w-full max-w-lg rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-8 shadow-xs">
        {/* Brand Header */}
        <Link href="/" className="flex items-center gap-2.5 mb-6 group transition-opacity hover:opacity-90">
          <Logo className="h-8 w-8 shrink-0 shadow-2xs group-hover:scale-105 transition-transform duration-150" />
          <div>
            <span className="font-semibold tracking-tight text-[var(--text-primary)] text-base leading-tight">Sched</span>
            <p className="text-[11px] text-[var(--text-muted)] font-mono">Infrastructure for High-Precision Booking</p>
          </div>
        </Link>

        <div className="pb-4 border-b border-[var(--border-subtle)]">
          <CardTitle className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Create your host account
          </CardTitle>
          <CardDescription className="mt-1 text-xs text-[var(--text-muted)]">
            Get started with your custom booking profile and scheduling infrastructure.
          </CardDescription>
        </div>

        <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
          {/* Full Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Shoaib Murtaza"
                required
                className="pl-9"
                aria-invalid={Boolean(fields.name)}
              />
            </div>
            {fields.name && <p className="text-xs text-[var(--status-danger-text)] font-medium">{fields.name}</p>}
          </div>

          {/* Username */}
          <div className="space-y-1.5">
            <Label htmlFor="username">Username & Profile handle</Label>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                placeholder="shoaib"
                required
                className="pl-9 font-mono text-xs"
                aria-invalid={Boolean(fields.username)}
              />
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              Your public link: <span className="font-mono text-[var(--text-secondary)]">sched.com/public/@{username || "username"}</span>
            </p>
            {fields.username && <p className="text-xs text-[var(--status-danger-text)] font-medium">{fields.username}</p>}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="pl-9"
                aria-invalid={Boolean(fields.email)}
              />
            </div>
            {fields.email && <p className="text-xs text-[var(--status-danger-text)] font-medium">{fields.email}</p>}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                required
                className="pl-9"
                aria-invalid={Boolean(fields.password)}
              />
            </div>
            {fields.password && <p className="text-xs text-[var(--status-danger-text)] font-medium">{fields.password}</p>}
          </div>

          {/* Timezone */}
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Host Primary Timezone</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)] z-10 pointer-events-none" />
              <Select
                id="timezone"
                name="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="pl-9 font-mono text-xs"
              >
                {timezones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
            </div>
            {fields.timezone && <p className="text-xs text-[var(--status-danger-text)] font-medium">{fields.timezone}</p>}
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-lg bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] p-3 text-xs text-[var(--status-danger-text)] font-medium">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={pending}
            className="w-full mt-4 gap-2"
          >
            {pending ? (
              <>
                <Spinner size="sm" />
                <span>Creating account…</span>
              </>
            ) : (
              <>
                <span>Create account</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
          Already have an account?{" "}
          <Link className="font-semibold text-[var(--text-primary)] hover:underline" href="/login">
            Log in
          </Link>
        </p>
      </Card>
    </div>
  );
}
