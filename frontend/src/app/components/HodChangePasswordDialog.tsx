import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { changeHodPassword } from "../lib/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export function HodChangePasswordDialog({
  open,
  onOpenChange,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
  }

  function handleOpenChange(next: boolean) {
    if (saving) return;
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    try {
      setSaving(true);
      await changeHodPassword(userId, currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[#2A6FDB]" />
            Change password
          </DialogTitle>
          <DialogDescription>
            Enter your current password, then choose a new password.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Password changed successfully. Use the new password the next time you log in.
            </p>
            <DialogFooter>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="rounded-lg bg-[#2A6FDB] px-4 py-2 text-sm font-semibold text-white"
              >
                Done
              </button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              Current password
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                autoComplete="current-password"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-[#2A6FDB] focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-[#2A6FDB] focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-[#2A6FDB] focus:ring-2 focus:ring-blue-100"
              />
            </label>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <DialogFooter>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                disabled={saving}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#2A6FDB] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Changing…" : "Change password"}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
