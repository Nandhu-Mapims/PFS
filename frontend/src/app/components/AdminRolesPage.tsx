import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Lock, RotateCcw, Save, ShieldCheck } from "lucide-react";
import {
  getRoles,
  getUsers,
  updateRoleCapabilities,
  type RoleCapabilityGroup,
  type RoleRow,
} from "../lib/api";

/**
 * RBAC administration: a role × capability matrix.
 *
 * Editing here changes the stored role, and the API resolves capabilities per
 * request — so a change takes effect on each affected user's next request
 * without them signing in again.
 */
export function AdminRolesPage() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [catalog, setCatalog] = useState<RoleCapabilityGroup[]>([]);
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [data, users] = await Promise.all([getRoles(), getUsers().catch(() => [])]);
        setRoles(data.roles);
        setCatalog(data.capabilityCatalog);
        setDraft(
          Object.fromEntries(data.roles.map((role) => [role.key, [...role.capabilities]]))
        );
        const counts: Record<string, number> = {};
        for (const user of users) counts[user.role] = (counts[user.role] || 0) + 1;
        setUserCounts(counts);
      } catch {
        setError("Could not load roles. Check that you are signed in as a Super Admin.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const dirtyKeys = useMemo(() => {
    const dirty = new Set<string>();
    for (const role of roles) {
      const current = [...(draft[role.key] || [])].sort().join(",");
      const saved = [...role.capabilities].sort().join(",");
      if (current !== saved) dirty.add(role.key);
    }
    return dirty;
  }, [roles, draft]);

  function toggle(roleKey: string, capability: string): void {
    setSavedKey(null);
    setDraft((prev) => {
      const held = prev[roleKey] || [];
      return {
        ...prev,
        [roleKey]: held.includes(capability)
          ? held.filter((c) => c !== capability)
          : [...held, capability],
      };
    });
  }

  function resetRole(roleKey: string): void {
    const role = roles.find((r) => r.key === roleKey);
    if (!role) return;
    setDraft((prev) => ({ ...prev, [roleKey]: [...role.capabilities] }));
    setSavedKey(null);
  }

  async function save(roleKey: string): Promise<void> {
    setSavingKey(roleKey);
    setError(null);
    try {
      const updated = await updateRoleCapabilities(roleKey, draft[roleKey] || []);
      setRoles((prev) => prev.map((r) => (r.key === roleKey ? updated : r)));
      setDraft((prev) => ({ ...prev, [roleKey]: [...updated.capabilities] }));
      setSavedKey(roleKey);
      window.setTimeout(() => setSavedKey((k) => (k === roleKey ? null : k)), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save role");
    } finally {
      setSavingKey(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 animate-spin" size={18} />
        Loading roles…
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-12">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Roles &amp; permissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each role grants a set of capabilities. Changes apply on the user&apos;s next
          request — nobody has to sign in again.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="space-y-5">
        {roles.map((role) => {
          const held = draft[role.key] || [];
          const isDirty = dirtyKeys.has(role.key);
          const locked = role.isProtected;
          return (
            <section
              key={role.key}
              className="rounded-2xl border border-gray-200 bg-white shadow-sm"
            >
              <header className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-gray-900">{role.label}</h2>
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                      {role.key}
                    </code>
                    {locked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <Lock size={12} /> Always full access
                      </span>
                    ) : null}
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {userCounts[role.key] || 0} user
                      {(userCounts[role.key] || 0) === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>
                </div>

                {!locked ? (
                  <div className="flex shrink-0 items-center gap-2">
                    {isDirty ? (
                      <button
                        type="button"
                        onClick={() => resetRole(role.key)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                      >
                        <RotateCcw size={14} /> Reset
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={!isDirty || savingKey === role.key}
                      onClick={() => void save(role.key)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {savingKey === role.key ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : savedKey === role.key ? (
                        <Check size={14} />
                      ) : (
                        <Save size={14} />
                      )}
                      {savedKey === role.key ? "Saved" : "Save"}
                    </button>
                  </div>
                ) : (
                  <ShieldCheck className="shrink-0 text-amber-500" size={20} />
                )}
              </header>

              <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-3">
                {catalog.map((group) => (
                  <div key={group.group}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {group.group}
                    </h3>
                    <ul className="space-y-1.5">
                      {group.items.map((item) => {
                        const checked = locked || held.includes(item.key);
                        return (
                          <li key={item.key}>
                            <label
                              title={item.description}
                              className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${
                                locked
                                  ? "cursor-not-allowed opacity-60"
                                  : "cursor-pointer hover:bg-gray-50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 shrink-0 accent-gray-900"
                                checked={checked}
                                disabled={locked}
                                onChange={() => toggle(role.key, item.key)}
                              />
                              <span className="min-w-0">
                                <span className="block leading-tight text-gray-800">
                                  {item.label}
                                </span>
                                <span className="block text-xs leading-snug text-gray-500">
                                  {item.description}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
