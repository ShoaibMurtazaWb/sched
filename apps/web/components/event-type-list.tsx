"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import {
  Check,
  Edit2,
  Search,
  Plus,
  Link2,
  Inbox,
  ExternalLink,
  Trash2,
  Calendar,
  CopyPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { api, type CurrentUser, type EventType } from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { EventTypeDrawer } from "@/components/event-type-drawer";
import { useScrollLock } from "@/lib/use-scroll-lock";

function EventTypeListContent() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<EventType[]>([]);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Drawer State
  const [drawerState, setDrawerState] = useState<{
    isOpen: boolean;
    eventTypeId: string | null;
  }>({
    isOpen: false,
    eventTypeId: null,
  });

  // Delete Modal State
  const [deleteModalItem, setDeleteModalItem] = useState<EventType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Lock background scroll when delete confirmation modal is open
  useScrollLock(!!deleteModalItem);

  // Sync with URL query params (?new=true or ?edit=[id])
  useEffect(() => {
    const isNew = searchParams.get("new") === "true";
    const editId = searchParams.get("edit");
    if (isNew) {
      setDrawerState({ isOpen: true, eventTypeId: null });
    } else if (editId) {
      setDrawerState({ isOpen: true, eventTypeId: editId });
    }
  }, [searchParams]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (e.key === "Escape") {
        if (deleteModalItem) {
          if (!isDeleting) setDeleteModalItem(null);
        } else if (drawerState.isOpen) {
          closeDrawer();
        } else if (document.activeElement === searchInputRef.current) {
          searchInputRef.current?.blur();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerState.isOpen, deleteModalItem, isDeleting]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [me, allList] = await Promise.all([
        api<CurrentUser>("/auth/me"),
        api<EventType[]>("/event-types"),
      ]);
      setUser(me);
      setItems(allList);
    } catch {
      toast.error("Could not load event types", "Please try refreshing the page.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDuplicate(id: string) {
    try {
      const duplicated = await api<EventType>(`/event-types/${id}/duplicate`, { method: "POST" });
      toast.success("Event type duplicated", `Created "${duplicated.title}".`);
      await loadData();
    } catch (caught) {
      if (caught instanceof ApiError) {
        toast.error("Failed to duplicate event type", caught.message);
      } else {
        toast.error("Could not duplicate event type");
      }
    }
  }

  async function handleToggleActive(item: EventType) {
    const isCurrentlyActive = !item.archivedAt;
    const endpoint = isCurrentlyActive ? `/event-types/${item.id}/archive` : `/event-types/${item.id}/unarchive`;
    const actionLabel = isCurrentlyActive ? "disabled" : "enabled";

    // Optimistic UI update
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, archivedAt: isCurrentlyActive ? new Date().toISOString() : null } : i
      )
    );

    try {
      await api(endpoint, { method: "POST" });
      toast.success(`Event type ${actionLabel}`, `"${item.title}" is now ${actionLabel}.`);
    } catch (caught) {
      // Revert optimistic update
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, archivedAt: item.archivedAt } : i
        )
      );
      if (caught instanceof ApiError) {
        toast.error(`Could not ${isCurrentlyActive ? "disable" : "enable"} event type`, caught.message);
      } else {
        toast.error("Failed to update status");
      }
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function closeDrawer() {
    setDrawerState({ isOpen: false, eventTypeId: null });
    try {
      if (typeof window !== "undefined" && window.location.search) {
        window.history.replaceState(null, "", "/dashboard");
      }
    } catch {
      // Ignore history state errors
    }
  }

  function openCreateDrawer() {
    setDrawerState({ isOpen: true, eventTypeId: null });
  }

  function openEditDrawer(id: string) {
    setDrawerState({ isOpen: true, eventTypeId: id });
  }

  async function handleConfirmDelete() {
    if (!deleteModalItem) return;
    setIsDeleting(true);
    try {
      await api(`/event-types/${deleteModalItem.id}`, { method: "DELETE" });
      toast.success("Event type permanently deleted", `"${deleteModalItem.title}" was removed.`);
      if (drawerState.eventTypeId === deleteModalItem.id) {
        closeDrawer();
      }
      setDeleteModalItem(null);
      await loadData();
    } catch (caught) {
      if (caught instanceof ApiError) {
        toast.error("Cannot delete event type", caught.message);
      } else {
        toast.error("Could not delete the event type");
      }
    } finally {
      setIsDeleting(false);
    }
  }

  function handleCopy(slug: string, id: string) {
    if (!user) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const fullUrl = `${origin}/public/${user.username}/${slug}`;
    void navigator.clipboard.writeText(fullUrl);
    setCopiedId(id);
    toast.success("Link copied to clipboard", fullUrl);
    setTimeout(() => {
      setCopiedId((current) => (current === id ? null : current));
    }, 2000);
  }

  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");

  const filteredItems = useMemo(() => {
    let result = items;
    if (statusFilter === "active") {
      result = result.filter((item) => !item.archivedAt);
    } else if (statusFilter === "archived") {
      result = result.filter((item) => !!item.archivedAt);
    }

    if (!searchQuery.trim()) return result;
    const query = searchQuery.toLowerCase();
    return result.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.slug.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
    );
  }, [items, statusFilter, searchQuery]);

  return (
    <div className="flex w-full h-full min-h-0 items-stretch overflow-hidden px-2 sm:px-3 lg:px-4 pb-2 sm:pb-3 lg:pb-4 pt-0">
      {/* Main Content Section: fixed height container, shrinks when SidePanel opens */}
      <div className="flex-1 min-w-0 h-full min-h-0 flex flex-col transition-all duration-300 ease-in-out bg-surface-subtle rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-7 shadow-xs overflow-hidden">
        {/* Fixed Top Controls: Header, Tabs, Search, and Host Identity */}
        <div className="shrink-0 space-y-4 sm:space-y-5 pb-2">
          {/* Scheduling Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-main">Scheduling</h1>
            </div>

            {/* Right Header Actions: Manage Availability & Create Button */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <Button
                asChild
                variant="outline"
                className="flex-1 sm:flex-initial rounded-full border-border-subtle bg-surface hover:bg-blue-50/70 hover:text-brand px-3.5 sm:px-4 py-2 text-xs font-semibold text-text-main shadow-2xs gap-1.5 transition-all cursor-pointer h-9 justify-center"
              >
                <Link href="/dashboard/availability">
                  <Calendar className="h-3.5 w-3.5 text-text-muted shrink-0" />
                  <span>Availability</span>
                </Link>
              </Button>

              <Button
                type="button"
                onClick={openCreateDrawer}
                className="flex-1 sm:flex-initial rounded-full bg-brand hover:bg-brand-hover text-white px-3.5 sm:px-4 py-2 text-xs font-semibold shadow-2xs gap-1.5 transition-all cursor-pointer h-9 justify-center"
              >
                <Plus className="h-3.5 w-3.5 stroke-[2.5] shrink-0" />
                <span>Create</span>
              </Button>
            </div>
          </div>

          {/* Subtabs Bar */}
          <div className="border-b border-border-subtle">
            <div className="flex items-center gap-6 text-xs font-semibold whitespace-nowrap">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`pb-3 border-b-2 font-bold shrink-0 transition-colors cursor-pointer ${
                  statusFilter === "all"
                    ? "border-brand text-brand"
                    : "border-transparent text-text-muted hover:text-text-main"
                }`}
              >
                All ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("active")}
                className={`pb-3 border-b-2 font-bold shrink-0 transition-colors cursor-pointer ${
                  statusFilter === "active"
                    ? "border-brand text-brand"
                    : "border-transparent text-text-muted hover:text-text-main"
                }`}
              >
                Active ({items.filter((i) => !i.archivedAt).length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("archived")}
                className={`pb-3 border-b-2 font-bold shrink-0 transition-colors cursor-pointer ${
                  statusFilter === "archived"
                    ? "border-brand text-brand"
                    : "border-transparent text-text-muted hover:text-text-main"
                }`}
              >
                Archived ({items.filter((i) => !!i.archivedAt).length})
              </button>
            </div>
          </div>

          {/* Search Bar Input */}
          <div className="w-full sm:max-w-md relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
            <Input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search event types"
              className="h-10 w-full pl-10 pr-4 rounded-xl border-border-subtle bg-surface text-xs shadow-2xs text-text-main placeholder:text-text-muted focus:border-brand"
            />
          </div>

          {/* Host User Identity Strip */}
          {user && (
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand text-[11px] font-bold select-none">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-bold text-text-main truncate">{user.name}</span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <Link
                  href={`/public/${user.username}`}
                  target="_blank"
                  className="text-xs font-semibold text-brand hover:underline flex items-center gap-1.5"
                >
                  <span>View Public Profile</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Dedicated Scroll Container for Event Cards */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3.5 pr-3 sm:pr-4 pt-2">

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="space-y-4 pt-2">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </div>
        )}

        {/* Full-Width Event Cards List with Light Blue Hover & Unchanged Left Accent Border */}
        {!isLoading && filteredItems.length > 0 && (
          <div className="space-y-3.5">
            {filteredItems.map((item) => {
              const isCopied = copiedId === item.id;
              const isCurrentlyEditing =
                drawerState.isOpen && drawerState.eventTypeId === item.id;

              return (
                <Card
                  key={item.id}
                  onClick={() => openEditDrawer(item.id)}
                  className={`group relative flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 rounded-2xl border p-4 sm:p-5 shadow-xs hover:shadow-md transition-all duration-200 border-l-[5px] w-full cursor-pointer ${
                    isCurrentlyEditing
                      ? "border-brand/40 bg-blue-50/70 dark:bg-blue-950/40 ring-2 ring-brand/20 border-l-brand shadow-xs"
                      : "border-border-subtle bg-surface border-l-brand hover:bg-blue-50/60 dark:hover:bg-blue-950/20"
                  }`}
                >
                  {/* Card Header & Meta Info */}
                  <div className="flex items-start justify-between gap-3 min-w-0 flex-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold text-text-main group-hover:text-brand transition-colors text-left inline-block">
                          {item.title}
                        </span>
                        {item.archivedAt ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 select-none">
                            Disabled
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 select-none">
                            Active
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-sub font-medium">
                        <span>{item.durationMinutes} min</span>
                        <span>•</span>
                        <span>{item.location?.type ? item.location.type.replace(/_/g, " ") : "Video Call"}</span>
                      </div>

                      <p className="mt-0.5 text-xs text-text-muted font-normal">
                        Weekdays, hours vary
                      </p>
                    </div>

                    {/* Mobile-only Top Right Action Icons */}
                    <div
                      className="flex items-center gap-1 md:hidden shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleDuplicate(item.id)}
                        className="h-8 w-8 rounded-full text-text-muted hover:text-text-main hover:bg-surface-subtle"
                        title="Duplicate event type"
                      >
                        <CopyPlus className="h-4 w-4" />
                      </Button>
                      {user && (
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full text-text-muted hover:text-text-main hover:bg-surface-subtle"
                          title="Preview booking page"
                        >
                          <Link href={`/public/${user.username}/${item.slug}`} target="_blank">
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteModalItem(item)}
                        className="h-8 w-8 rounded-full text-text-muted hover:text-rose-600 hover:bg-rose-500/10"
                        title="Delete event type"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div
                    className="flex items-center gap-2.5 w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t border-border-subtle md:border-t-0 flex-wrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Enable / Disable Toggle Switch */}
                    <div className="flex items-center gap-2 mr-1">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!item.archivedAt}
                        onClick={() => void handleToggleActive(item)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          !item.archivedAt ? "bg-brand" : "bg-neutral-300 dark:bg-neutral-700"
                        }`}
                        title={!item.archivedAt ? "Disable event type" : "Enable event type"}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            !item.archivedAt ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Copy Link Pill Button */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(item.slug, item.id)}
                      className="flex-1 md:flex-initial h-8.5 rounded-full border-border-subtle bg-surface hover:bg-surface-subtle px-3.5 py-1.5 text-xs font-semibold text-text-main shadow-2xs gap-1.5 transition-all cursor-pointer justify-center"
                    >
                      {isCopied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span className="text-emerald-600">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Link2 className="h-3.5 w-3.5 text-text-muted shrink-0" />
                          <span>Copy link</span>
                        </>
                      )}
                    </Button>

                    {/* Mobile Edit Button */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDrawer(item.id)}
                      className="flex-1 md:hidden h-8.5 rounded-full border-border-subtle bg-surface hover:bg-surface-subtle px-3 text-xs font-semibold text-text-main shadow-2xs gap-1.5 transition-all cursor-pointer justify-center"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-text-muted shrink-0" />
                      <span>Edit</span>
                    </Button>

                    {/* Desktop Action Icons */}
                    <div className="hidden md:flex items-center gap-1">
                      <Tooltip content="Duplicate event type">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleDuplicate(item.id)}
                          className="h-8 w-8 rounded-full text-text-muted hover:text-text-main hover:bg-surface-subtle cursor-pointer"
                        >
                          <CopyPlus className="h-3.5 w-3.5" />
                        </Button>
                      </Tooltip>

                      {user && (
                        <Tooltip content="Preview booking page">
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full text-text-muted hover:text-text-main hover:bg-surface-subtle cursor-pointer"
                          >
                            <Link href={`/public/${user.username}/${item.slug}`} target="_blank">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </Tooltip>
                      )}

                      <Tooltip content="Edit event type">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDrawer(item.id)}
                          className="h-8 w-8 rounded-full text-text-muted hover:text-text-main hover:bg-surface-subtle cursor-pointer"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </Tooltip>

                      <Tooltip content="Delete event type">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteModalItem(item)}
                          className="h-8 w-8 rounded-full text-text-muted hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Empty State when no event types exist */}
        {!isLoading && filteredItems.length === 0 && !searchQuery && (
          <div className="mt-8">
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-subtle bg-surface p-12 text-center shadow-xs">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-subtle text-text-muted shadow-2xs mb-4">
                <Plus className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold tracking-tight text-text-main">
                Welcome to Sched
              </h3>
              <p className="mt-1.5 text-xs text-text-sub max-w-sm leading-relaxed">
                Create your first event type and start sharing your booking page with clients and teammates.
              </p>
              <div className="mt-6">
                <Button
                  type="button"
                  onClick={openCreateDrawer}
                  size="sm"
                  className="rounded-full bg-brand hover:bg-brand-hover text-white font-semibold gap-2 cursor-pointer h-9 px-4"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Event Type</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Empty State for Search Filter */}
        {!isLoading && filteredItems.length === 0 && searchQuery && (
          <div className="mt-8 rounded-2xl border border-border-subtle bg-surface p-12 text-center shadow-2xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-surface-subtle text-text-muted mb-3">
              <Inbox className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-text-main">
              No matching event types
            </h3>
            <p className="mt-1 text-xs text-text-sub max-w-sm mx-auto">
              No results for &ldquo;{searchQuery}&rdquo;. Try a different search keyword.
            </p>
          </div>
        )}
        </div>
      </div>

      {/* Right Integrated Side Panel for Adding/Editing Event Types */}
      <EventTypeDrawer
        isOpen={drawerState.isOpen}
        eventTypeId={drawerState.eventTypeId}
        onClose={closeDrawer}
        onSaved={() => void loadData()}
      />

      {/* Confirmation Modal */}
      {deleteModalItem && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto overscroll-contain backdrop-blur-xs animate-in fade-in-0 duration-150"
          onClick={() => {
            if (!isDeleting) setDeleteModalItem(null);
          }}
        >
          <div
            className="w-full max-w-[460px] rounded-2xl border border-border-subtle bg-surface p-7 sm:p-8 shadow-2xl space-y-6 animate-in fade-in-0 zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-2.5">
              <h3 className="text-lg font-bold text-text-main tracking-tight leading-snug">
                Delete {deleteModalItem.title}?
              </h3>
              <p className="text-xs text-text-sub leading-relaxed font-normal">
                Users will be unable to schedule further meetings with deleted event types. Meetings previously scheduled will not be affected.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2 w-full">
              <Button
                type="button"
                variant="outline"
                disabled={isDeleting}
                onClick={() => setDeleteModalItem(null)}
                className="flex-1 w-full rounded-full border border-border-subtle bg-surface hover:bg-surface-subtle text-text-main font-semibold text-xs py-2.5 h-10 text-center shadow-xs transition-colors cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleConfirmDelete()}
                className="flex-1 w-full rounded-full bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs py-2.5 h-10 text-center shadow-xs transition-colors cursor-pointer"
              >
                {isDeleting ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Spinner size="sm" />
                    <span>Deleting…</span>
                  </span>
                ) : (
                  <span>Yes, Delete</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function EventTypeList() {
  return (
    <Suspense fallback={<div className="w-full h-96 animate-pulse rounded-xl bg-neutral-100" />}>
      <EventTypeListContent />
    </Suspense>
  );
}

