"use client";

import { useEffect, useState } from "react";
import {
  User as UserIcon,
  Bell,
  Clock,
  Shield,
  Check,
  AlertCircle,
  Camera,
  Upload,
  KeyRound,
  Eye,
  EyeOff,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { TimezonePicker } from "@/components/timezone-picker";
import { api, type UserSettingsResponse } from "@/lib/api";
import { ApiError, formatApiError } from "@/lib/api-error";

export default function SettingsPage() {
  const [_settings, setSettings] = useState<UserSettingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "notifications" | "scheduling">("profile");

  // Profile Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password / Security Form State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Notifications Form State
  const [emailReminders, setEmailReminders] = useState(true);
  const [bookingConfirmations, setBookingConfirmations] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

  // Scheduling Form State
  const [defaultDuration, setDefaultDuration] = useState(30);
  const [defaultBuffer, setDefaultBuffer] = useState(0);
  const [defaultTimezone, setDefaultTimezone] = useState("UTC");
  const [isSavingScheduling, setIsSavingScheduling] = useState(false);

  // Feedback notifications
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    void loadSettings();

    // Check URL parameters for tab selection (e.g. ?tab=security from login alert email)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam && ["profile", "security", "notifications", "scheduling"].includes(tabParam)) {
        setActiveTab(tabParam as "profile" | "security" | "notifications" | "scheduling");
      }
    }
  }, []);

  function handleTabChange(tab: "profile" | "security" | "notifications" | "scheduling") {
    setActiveTab(tab);
    setFeedback(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState(null, "", url.toString());
    }
  }

  async function loadSettings() {
    setIsLoading(true);
    setFeedback(null);
    try {
      const data = await api<UserSettingsResponse>("/settings");
      setSettings(data);
      setName(data.profile.name);
      setEmail(data.profile.email);
      setUsername(data.profile.username);
      setTimezone(data.profile.timezone);
      setAvatarUrl(data.profile.avatarUrl || "");

      setEmailReminders(data.notificationPreferences.emailReminders);
      setBookingConfirmations(data.notificationPreferences.bookingConfirmations);
      setMarketingEmails(data.notificationPreferences.marketingEmails);

      setDefaultDuration(data.schedulingPreferences.defaultMeetingDuration);
      setDefaultBuffer(data.schedulingPreferences.defaultBufferMinutes);
      setDefaultTimezone(data.schedulingPreferences.defaultTimezone || data.profile.timezone);
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to load account settings.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingProfile(true);
    setFeedback(null);
    try {
      const updated = await api<UserSettingsResponse>("/settings/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          username: username.trim(),
          timezone,
          avatarUrl: avatarUrl.trim() || null,
        }),
      });
      setSettings(updated);
      setFeedback({ type: "success", message: "Profile settings saved successfully." });
      
      // Real-time synchronization with Header and Sidebar user buttons
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("sched_user_updated", { detail: updated.profile })
        );
      }
    } catch (err) {
      const msg = formatApiError(err, "Failed to update profile.");
      setFeedback({ type: "error", message: msg });
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    if (newPassword.length < 8) {
      setFeedback({ type: "error", message: "New password must be at least 8 characters long." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setFeedback({ type: "error", message: "New passwords do not match. Please re-enter." });
      return;
    }

    setIsSavingPassword(true);
    try {
      const response = await api<{ success: boolean; message: string }>("/settings/password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      setFeedback({ type: "success", message: response.message || "Your password has been changed successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      let msg = formatApiError(err, "Failed to update password.");
      if (err instanceof ApiError && err.body.error.code === "INVALID_CURRENT_PASSWORD") {
        msg = "The current password you entered is incorrect.";
      }
      setFeedback({ type: "error", message: msg });
    } finally {
      setIsSavingPassword(false);
    }
  }

  async function handleSaveNotifications(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingNotifications(true);
    setFeedback(null);
    try {
      const updated = await api<UserSettingsResponse>("/settings/notifications", {
        method: "PATCH",
        body: JSON.stringify({
          emailReminders,
          bookingConfirmations,
          marketingEmails,
        }),
      });
      setSettings(updated);
      setFeedback({ type: "success", message: "Notification preferences updated." });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to update notification preferences.",
      });
    } finally {
      setIsSavingNotifications(false);
    }
  }

  async function handleSaveScheduling(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingScheduling(true);
    setFeedback(null);
    try {
      const updated = await api<UserSettingsResponse>("/settings/scheduling", {
        method: "PATCH",
        body: JSON.stringify({
          defaultMeetingDuration: Number(defaultDuration),
          defaultBufferMinutes: Number(defaultBuffer),
          defaultTimezone,
        }),
      });
      setSettings(updated);
      setFeedback({ type: "success", message: "Default scheduling preferences saved." });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to update scheduling preferences.",
      });
    } finally {
      setIsSavingScheduling(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setFeedback({ type: "error", message: "Please select a valid image file (PNG, JPG, WebP)." });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFeedback({ type: "error", message: "Image size must be less than 5MB." });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 256;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
          setAvatarUrl(compressedDataUrl);
          setFeedback({ type: "success", message: "Photo loaded! Click 'Save Profile' to apply your new avatar." });
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 md:px-10 lg:px-14 py-4 sm:py-6 md:py-8 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex gap-2 border-b border-[var(--border-subtle)] pb-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 md:px-10 lg:px-14 py-4 sm:py-6 md:py-8 w-full space-y-6 max-w-4xl pb-12">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Account Settings
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-[var(--text-secondary)]">
          Manage your personal profile, security credentials, delivery preferences, and scheduling defaults.
        </p>
      </div>

      {/* Global Feedback Alert */}
      {feedback && (
        <div
          className={`flex items-start gap-3 rounded-xl border p-4 text-xs transition-all duration-150 shadow-2xs ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {feedback.type === "success" ? (
            <Check className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
          )}
          <span className="font-semibold leading-relaxed">{feedback.message}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={() => handleTabChange("profile")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "profile"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-neutral-600 hover:text-neutral-900 hover:border-neutral-300"
          }`}
        >
          <UserIcon className="h-4 w-4" />
          <span>Profile</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("security")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "security"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-neutral-600 hover:text-neutral-900 hover:border-neutral-300"
          }`}
        >
          <KeyRound className="h-4 w-4" />
          <span>Security & Password</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("notifications")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "notifications"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-neutral-600 hover:text-neutral-900 hover:border-neutral-300"
          }`}
        >
          <Bell className="h-4 w-4" />
          <span>Notifications</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("scheduling")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "scheduling"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-neutral-600 hover:text-neutral-900 hover:border-neutral-300"
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>Scheduling Preferences</span>
        </button>
      </div>

      {/* Tab 1: Profile Settings */}
      {activeTab === "profile" && (
        <form onSubmit={handleSaveProfile} className="space-y-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-8 shadow-xs">
          {/* Avatar Upload Section */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 pb-6 border-b border-[var(--border-subtle)]">
            <div className="relative group">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-2xl select-none overflow-hidden ring-4 ring-neutral-100 shadow-xs">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
                ) : (
                  name.charAt(0).toUpperCase() || "U"
                )}
              </div>
              <label
                htmlFor="avatar-file-upload"
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Upload profile photo"
              >
                <Camera className="h-6 w-6" />
              </label>
              <input
                id="avatar-file-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            <div className="space-y-1.5 flex-1">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Profile Photo</h2>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <label
                  htmlFor="avatar-file-upload"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-neutral-300 bg-white text-xs font-semibold text-neutral-800 hover:bg-neutral-50 transition-colors cursor-pointer shadow-2xs"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{avatarUrl ? "Change Image" : "Upload Image"}</span>
                </label>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl("")}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    Remove Photo
                  </button>
                )}
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">Upload a PNG, JPG, or WebP photo up to 5MB.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label htmlFor="name" className="text-xs font-semibold text-[var(--text-primary)]">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition-shadow"
                placeholder="e.g. Shoaib Murtaza"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="username" className="text-xs font-semibold text-[var(--text-primary)]">
                Username Handle
              </label>
              <div className="flex items-center rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-900 focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-600 transition-shadow">
                <span className="text-neutral-400 font-mono select-none">/public/</span>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full bg-transparent font-mono text-xs text-neutral-900 focus:outline-none ml-0.5"
                  placeholder="username"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-[var(--text-primary)]">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition-shadow"
                placeholder="e.g. user@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="timezone" className="text-xs font-semibold text-[var(--text-primary)]">
                Default Timezone
              </label>
              <TimezonePicker
                id="timezone"
                value={timezone}
                onChange={setTimezone}
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end border-t border-[var(--border-subtle)]">
            <Button type="submit" disabled={isSavingProfile} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 h-10 text-xs">
              {isSavingProfile && <Spinner size="sm" className="mr-2" />}
              Save Profile Changes
            </Button>
          </div>
        </form>
      )}

      {/* Tab 2: Security & Change Password */}
      {activeTab === "security" && (
        <div className="space-y-6">
          <form onSubmit={handleSavePassword} className="space-y-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-8 shadow-xs">
            <div className="flex items-start gap-4 pb-5 border-b border-[var(--border-subtle)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shrink-0">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)]">Change Password</h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Update your password regularly to ensure your account and connected calendars stay safe.
                </p>
              </div>
            </div>

            <div className="space-y-4 max-w-lg">
              {/* Current Password */}
              <div className="space-y-1.5">
                <label htmlFor="current-password" className="text-xs font-semibold text-[var(--text-primary)]">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    id="current-password"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="Enter your current password"
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-900 pr-10 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition-shadow"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer"
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="space-y-1.5">
                <label htmlFor="new-password" className="text-xs font-semibold text-[var(--text-primary)]">
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="At least 8 characters"
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-900 pr-10 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition-shadow"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div className="space-y-1.5">
                <label htmlFor="confirm-password" className="text-xs font-semibold text-[var(--text-primary)]">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Repeat your new password"
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-900 pr-10 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition-shadow"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Password Requirements Guide */}
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-xs text-neutral-600 space-y-2">
              <div className="font-semibold text-neutral-900 text-xs flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-blue-600" />
                <span>Password Best Practices:</span>
              </div>
              <ul className="space-y-1 text-[11px] text-neutral-600 list-disc list-inside">
                <li>Minimum of 8 characters (longer is always stronger)</li>
                <li>Combine uppercase, lowercase, numbers, and special symbols</li>
                <li>Never share your credentials with unauthorized third parties</li>
              </ul>
            </div>

            <div className="pt-4 flex items-center justify-end border-t border-[var(--border-subtle)]">
              <Button
                type="submit"
                disabled={isSavingPassword || !currentPassword || !newPassword || !confirmPassword}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 h-10 text-xs"
              >
                {isSavingPassword && <Spinner size="sm" className="mr-2" />}
                Update Password
              </Button>
            </div>
          </form>

          {/* Security Status Box */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-neutral-900">Argon2id Hash Encryption Active</h3>
                <p className="text-[11px] text-neutral-500">Your credentials are cryptographically secured with salted Argon2id memory-hard hashing.</p>
              </div>
            </div>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 border border-emerald-200">
              Protected
            </span>
          </div>
        </div>
      )}

      {/* Tab 3: Delivery Notifications */}
      {activeTab === "notifications" && (
        <form onSubmit={handleSaveNotifications} className="space-y-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-8 shadow-xs">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Email Notifications</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">Choose which transactional emails and system reminders you receive.</p>
          </div>

          <div className="space-y-3 divide-y divide-[var(--border-subtle)]">
            <label className="flex items-start justify-between pt-3 cursor-pointer">
              <div className="space-y-0.5 pr-4">
                <span className="text-xs font-semibold text-[var(--text-primary)]">Email Reminders</span>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Receive automated reminders (24 hours and 1 hour before scheduled bookings).
                </p>
              </div>
              <input
                type="checkbox"
                checked={emailReminders}
                onChange={(e) => setEmailReminders(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-600 mt-1 cursor-pointer"
              />
            </label>

            <label className="flex items-start justify-between pt-3 cursor-pointer">
              <div className="space-y-0.5 pr-4">
                <span className="text-xs font-semibold text-[var(--text-primary)]">Booking Confirmations</span>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Get notified whenever an attendee creates, reschedules, or cancels a booking.
                </p>
              </div>
              <input
                type="checkbox"
                checked={bookingConfirmations}
                onChange={(e) => setBookingConfirmations(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-600 mt-1 cursor-pointer"
              />
            </label>

            <label className="flex items-start justify-between pt-3 cursor-pointer">
              <div className="space-y-0.5 pr-4">
                <span className="text-xs font-semibold text-[var(--text-primary)]">Product Updates & Tips</span>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Occasional feature announcements and tips to optimize your scheduling workflow.
                </p>
              </div>
              <input
                type="checkbox"
                checked={marketingEmails}
                onChange={(e) => setMarketingEmails(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-600 mt-1 cursor-pointer"
              />
            </label>
          </div>

          <div className="pt-4 flex items-center justify-end border-t border-[var(--border-subtle)]">
            <Button type="submit" disabled={isSavingNotifications} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 h-10 text-xs">
              {isSavingNotifications && <Spinner size="sm" className="mr-2" />}
              Save Preferences
            </Button>
          </div>
        </form>
      )}

      {/* Tab 4: Default Scheduling Preferences */}
      {activeTab === "scheduling" && (
        <form onSubmit={handleSaveScheduling} className="space-y-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-8 shadow-xs">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Default Scheduling Rules</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">Set default duration and buffer presets used when creating new event types.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label htmlFor="duration" className="text-xs font-semibold text-[var(--text-primary)]">
                Default Meeting Duration (Minutes)
              </label>
              <select
                id="duration"
                value={defaultDuration}
                onChange={(e) => setDefaultDuration(Number(e.target.value))}
                className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition-shadow"
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes (1 hour)</option>
                <option value={90}>90 minutes</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="buffer" className="text-xs font-semibold text-[var(--text-primary)]">
                Default Buffer Time (Minutes)
              </label>
              <select
                id="buffer"
                value={defaultBuffer}
                onChange={(e) => setDefaultBuffer(Number(e.target.value))}
                className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none transition-shadow"
              >
                <option value={0}>0 minutes (No buffer)</option>
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="defaultTimezone" className="text-xs font-semibold text-[var(--text-primary)]">
              Default Scheduling Timezone
            </label>
            <TimezonePicker
              id="defaultTimezone"
              value={defaultTimezone}
              onChange={setDefaultTimezone}
            />
          </div>

          <div className="pt-4 flex items-center justify-end border-t border-[var(--border-subtle)]">
            <Button type="submit" disabled={isSavingScheduling} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 h-10 text-xs">
              {isSavingScheduling && <Spinner size="sm" className="mr-2" />}
              Save Scheduling Defaults
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
