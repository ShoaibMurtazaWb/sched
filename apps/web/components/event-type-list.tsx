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
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    try {
      const [me, activeList] = await Promise.all([
        api<CurrentUser>("/auth/me"),
        api<EventType[]>("/event-types?status=active"),
      ]);
      setUser(me);
      setItems(activeList);
    } catch {
      setError("Could not load event types.");
    } finally {
      setIsLoading(false);
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

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.slug.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
    );
  }, [items, searchQuery]);

  return (
    <div className="flex w-full min-h-[calc(100vh-4rem)] sm:min-h-[calc(100vh-5rem)] items-start">
      {/* Main Content Section: smoothly shrinks horizontally when SidePanel opens */}
      <div className="flex-1 min-w-0 transition-all duration-300 ease-in-out px-4 sm:px-6 md:px-10 lg:px-14 py-4 sm:py-6 md:py-8 space-y-6">
        {/* Calendly Secondary Header Row (Directly under Top Navbar) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">Scheduling</h1>
          </div>

          {/* Right Header Actions: Manage Availability & Create Pill */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Button
              asChild
              variant="outline"
              className="flex-1 sm:flex-initial rounded-full border-neutral-300 bg-white hover:bg-neutral-50 px-3.5 sm:px-4 py-2 text-xs font-semibold text-neutral-800 shadow-2xs gap-1.5 transition-all cursor-pointer h-9 justify-center"
            >
              <Link href="/dashboard/availability">
                <Calendar className="h-3.5 w-3.5 text-neutral-600 shrink-0" />
                <span>Availability</span>
              </Link>
            </Button>

            <Button
              type="button"
              onClick={openCreateDrawer}
              className="flex-1 sm:flex-initial rounded-full bg-blue-600 hover:bg-blue-700 text-white px-3.5 sm:px-4 py-2 text-xs font-semibold shadow-2xs gap-1.5 transition-all cursor-pointer h-9 justify-center"
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5] shrink-0" />
              <span>Create</span>
            </Button>
          </div>
        </div>

        {/* Subtabs Bar */}
        <div className="border-b border-neutral-200">
          <div className="flex items-center text-xs font-semibold whitespace-nowrap">
            <button
              type="button"
              className="pb-3 border-b-2 border-blue-600 text-blue-600 font-bold shrink-0 transition-colors"
            >
              Event types
            </button>
          </div>
        </div>

        {/* Search Bar Input - full width on mobile, max-w-md on desktop */}
        <div className="w-full sm:max-w-md relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
          <Input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search event types"
            className="h-10 w-full pl-10 pr-4 rounded-xl border-neutral-200 bg-white text-xs shadow-2xs focus:border-neutral-400"
          />
        </div>

        {/* Host User Identity Strip */}
        {user && (
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold select-none">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-bold text-neutral-900 truncate">{user.name}</span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <Link
                href={`/public/${user.username}`}
                target="_blank"
                className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
              >
                <span>View landing page</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-700 font-medium">
            {error}
          </div>
        )}

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="space-y-4 pt-2">
            <Skeleton className="h-28 w-full rounded-xl border border-neutral-200" />
            <Skeleton className="h-28 w-full rounded-xl border border-neutral-200" />
          </div>
        )}

        {/* Full-Width Event Cards List */}
        {!isLoading && filteredItems.length > 0 && (
          <div className="space-y-4">
            {filteredItems.map((item) => {
              const isCopied = copiedId === item.id;
              const isCurrentlyEditing =
                drawerState.isOpen && drawerState.eventTypeId === item.id;

              return (
                <Card
                  key={item.id}
                  onClick={() => openEditDrawer(item.id)}
                  className={`group relative flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 rounded-2xl border p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all duration-200 border-l-[6px] w-full cursor-pointer hover:bg-blue-50/30 hover:border-blue-300 ${
                    isCurrentlyEditing
                      ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-500 border-l-blue-600 shadow-2xs"
                      : "border-neutral-200 bg-white border-l-blue-600 hover:border-l-blue-700"
                  }`}
                >
                  {/* Card Header & Meta Info */}
                  <div className="flex items-start justify-between gap-3 min-w-0 w-full md:w-auto">
                    <div className="min-w-0 flex-1">
                      <span className="text-base font-bold text-neutral-900 group-hover:text-blue-600 transition-colors text-left inline-block">
                        {item.title}
                      </span>

                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-600 font-medium">
                        <span>{item.durationMinutes} min</span>
                        <span>•</span>
                        <span>{item.location?.type ? item.location.type.replace(/_/g, " ") : "Video Call"}</span>
                        <span>•</span>
                        <span>One-on-One</span>
                      </div>

                      <p className="mt-0.5 text-xs text-neutral-500 font-normal">
                        Weekdays, hours vary
                      </p>
                    </div>

                    {/* Mobile-only Top Right Action Icons */}
                    <div
                      className="flex items-center gap-1 md:hidden shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {user && (
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
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
                        className="h-8 w-8 rounded-full text-neutral-400 hover:text-red-600 hover:bg-red-50"
                        title="Delete event type"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Card Actions (Full-width touch buttons on mobile, compact on desktop) */}
                  <div
                    className="flex items-center gap-2 w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t border-neutral-100 md:border-t-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Copy Link Pill Button */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(item.slug, item.id)}
                      className="flex-1 md:flex-initial h-9 rounded-full border-neutral-300 bg-white hover:bg-neutral-50 px-3.5 py-1.5 text-xs font-semibold text-neutral-800 shadow-2xs gap-1.5 transition-all cursor-pointer justify-center"
                    >
                      {isCopied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span className="text-emerald-700">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Link2 className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
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
                      className="flex-1 md:hidden h-9 rounded-full border-neutral-300 bg-white hover:bg-neutral-50 px-3 text-xs font-semibold text-neutral-800 shadow-2xs gap-1.5 transition-all cursor-pointer justify-center"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
                      <span>Edit</span>
                    </Button>

                    {/* Desktop Action Icons */}
                    <div className="hidden md:flex items-center gap-1">
                      {user && (
                        <Tooltip content="Preview booking page">
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full text-neutral-500 hover:text-black hover:bg-neutral-100 cursor-pointer"
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
                          className="h-8 w-8 rounded-full text-neutral-500 hover:text-black hover:bg-neutral-100 cursor-pointer"
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
                          className="h-8 w-8 rounded-full text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
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
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white p-12 text-center shadow-xs">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 shadow-2xs mb-4">
                <Plus className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold tracking-tight text-black">
                Welcome to Sched
              </h3>
              <p className="mt-1.5 text-xs text-neutral-600 max-w-sm leading-relaxed">
                Create your first event type and start sharing your booking page with clients and teammates.
              </p>
              <div className="mt-6">
                <Button
                  type="button"
                  onClick={openCreateDrawer}
                  size="sm"
                  className="rounded-full bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-2 cursor-pointer"
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
          <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-12 text-center shadow-2xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500 mb-3">
              <Inbox className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-black">
              No matching event types
            </h3>
            <p className="mt-1 text-xs text-neutral-600 max-w-sm mx-auto">
              No results for &ldquo;{searchQuery}&rdquo;. Try a different search keyword.
            </p>
          </div>
        )}
      </div>

      {/* Right Sidebar Drawer for Adding/Editing Event Types (Matching Screenshot) */}
      <EventTypeDrawer
        isOpen={drawerState.isOpen}
        eventTypeId={drawerState.eventTypeId}
        onClose={closeDrawer}
        onSaved={() => void loadData()}
      />

      {/* Custom Confirmation Popup Modal Matching Screenshot */}
      {deleteModalItem && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto overscroll-contain backdrop-blur-xs animate-in fade-in-0 duration-150"
          onClick={() => {
            if (!isDeleting) setDeleteModalItem(null);
          }}
        >
          <div
            className="w-full max-w-[480px] rounded-2xl border border-neutral-100 bg-white p-8 sm:p-9 shadow-2xl space-y-7 animate-in fade-in-0 zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-neutral-900 tracking-tight leading-snug">
                Delete {deleteModalItem.title}?
              </h3>
              <p className="text-sm text-neutral-700 leading-relaxed font-normal">
                Users will be unable to schedule further meetings with deleted event types. Meetings previously scheduled will not be affected.
              </p>
            </div>

            <div className="flex items-center gap-3.5 pt-2 w-full">
              <Button
                type="button"
                variant="outline"
                disabled={isDeleting}
                onClick={() => setDeleteModalItem(null)}
                className="flex-1 w-full rounded-full border border-neutral-800 bg-white hover:bg-neutral-50 text-neutral-900 font-semibold text-sm py-3 px-6 text-center shadow-xs transition-colors cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleConfirmDelete()}
                className="flex-1 w-full rounded-full bg-[#C23600] hover:bg-[#A92E00] text-white font-semibold text-sm py-3 px-6 text-center shadow-xs transition-colors cursor-pointer"
              >
                {isDeleting ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Spinner size="sm" />
                    <span>Deleting…</span>
                  </span>
                ) : (
                  <span>Yes</span>
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

