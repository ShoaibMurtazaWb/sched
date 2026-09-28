"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log client/render error in dev environment
    console.error("Dashboard error caught by boundary:", error);
  }, [error]);

  return (
    <div className="flex min-h-[420px] items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface p-7 sm:p-8 text-center shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 mb-4 border border-rose-500/20">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-base font-bold text-text-main">
          Something went wrong
        </h2>
        <p className="mt-1.5 text-xs text-text-sub leading-relaxed max-w-xs mx-auto">
          We encountered an unexpected error loading this section. Please try again.
        </p>
        <div className="mt-6 flex justify-center">
          <Button
            type="button"
            size="sm"
            onClick={() => reset()}
            className="gap-2 rounded-full bg-brand hover:bg-brand-hover text-white font-semibold text-xs px-5 h-9 shadow-xs cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Try Again</span>
          </Button>
        </div>
      </Card>
    </div>
  );
}
