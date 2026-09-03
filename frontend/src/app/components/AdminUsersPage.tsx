import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Building2,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserCog,
  Users as UsersIcon,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import {
  createUser,
  deleteUser,
  getHospitalDepartments,
  getRoles,
  getServices,
  getUsers,
  updateUser,
  type Department,
  type RoleRow,
  type ServiceCatalogItem,
  type UserRow,
} from "../lib/api";
import type { UserRole } from "../lib/auth";

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#2A6FDB] focus:ring-4 focus:ring-blue-500/10";

const LABEL_CLASS = "mb-1.5 block text-[13px] font-medium text-gray-700";

/** Per-role tint. Muted on purpose — the table should read as data, not confetti. */
const ROLE_TONES: Record<string, string> = {
  superadmin: "bg-violet-50 text-violet-700 ring-violet-100",
  management: "bg-sky-50 text-sky-700 ring-sky-100",
  admin: "bg-blue-50 text-blue-700 ring-blue-100",
  hod: "bg-amber-50 text-amber-700 ring-amber-100",
  staff: "bg-emerald-50 text-emerald-700 ring-emerald-100",
};

function roleTone(role: string): string {
  return ROLE_TONES[role] || "bg-gray-50 text-gray-600 ring-gray-200";
}

function RoleBadge({ role, label }: { role: string; label?: string }) {
  // Registry labels are already cased; only the raw key fallback needs it, and
  // `capitalize` would title-case a multi-word label.
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
        label ? "" : "capitalize"
      } ${roleTone(role)}`}
    >
      {label || role}
    </span>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-600 ring-1 ring-inset ring-gray-200/70">
      {children}
    </span>
  );
}

function StatTile({
  icon,
  label,
  value,
  gradient,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  gradient: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-3 rounded-xl bg-gradient-to-br p-4 text-left text-white shadow-sm transition ${gradient} ${
        active ? "ring-4 ring-offset-2 ring-gray-900/20" : "opacity-90 hover:opacity-100"
      }`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/15">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-bold leading-none">{value}</span>
        <span className="mt-1 block truncate text-xs opacity-90">{label}</span>
      </span>
    </button>
  );
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

function MappingChecklist({
  title,
  items,
  selectedIds,
  onChange,
  emptyLabel,
}: {
  title: string;
  items: Array<{ _id: string; name: string }>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyLabel: string;
}) {
  const [filter, setFilter] = useState("");
  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.name.toLowerCase().includes(query));
  }, [items, filter]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-gray-700">{title}</span>
        {selectedIds.length > 0 ? (
          <span className="rounded-md bg-[#2A6FDB] px-1.5 py-0.5 text-[11px] font-medium text-white">
            {selectedIds.length}
          </span>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-500">
          {emptyLabel}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <div className="relative border-b border-gray-100">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              size={14}
            />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Filter ${title.toLowerCase()}…`}
              aria-label={`Filter ${title}`}
              className="w-full bg-white py-2 pl-8 pr-3 text-sm outline-none placeholder:text-gray-400"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-500">No match.</p>
            ) : (
              visible.map((item) => {
                const checked = selectedIds.includes(item._id);
                return (
                  <label
                    key={item._id}
                    className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm transition ${
                      checked ? "bg-gray-50" : "hover:bg-gray-50/70"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onChange(toggleId(selectedIds, item._id))}
                      className="h-4 w-4 shrink-0 rounded border-gray-300 accent-[#2A6FDB]"
                    />
                    <span className={checked ? "font-medium text-gray-900" : "text-gray-600"}>
                      {item.name}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function hodMappingLabels(user: UserRow): { departments: string[]; services: string[] } {
  const departments =
    user.hodDepartments?.map((row) => row.name) ||
    (user.departmentId && typeof user.departmentId === "object" && "name" in user.departmentId
      ? [user.departmentId.name]
      : []);
  const services =
    user.hodServices?.map((row) => row.name) ||
    (user.serviceId && typeof user.serviceId === "object" && "name" in user.serviceId
      ? [user.serviceId.name]
      : []);
  return { departments, services };
}

function staffDepartmentName(user: UserRow): string {
  return user.departmentId && typeof user.departmentId === "object" && "name" in user.departmentId
    ? (user.departmentId as { name: string }).name
    : "";
}

/**
 * The chips a row shows, by role. Staff carry a single department; HODs carry
 * their department and service mappings. Both are deduped — hodMappingLabels
 * falls back to departmentId.name, so a HOD holding a legacy departmentId would
 * otherwise render the same name twice (and collide on the React key).
 */
function mappingChips(user: UserRow): string[] {
  const mappings = hodMappingLabels(user);
  const names =
    user.role === "staff"
      ? [staffDepartmentName(user)]
      : user.role === "hod"
        ? [...mappings.departments, ...mappings.services]
        : [];
  return [...new Set(names.filter(Boolean))];
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>("staff");
  // Roles are data now, so the picker is driven by the registry rather than a
  // hardcoded list — a role added in the RBAC screen shows up here.
  const [roleOptions, setRoleOptions] = useState<RoleRow[]>([]);

  useEffect(() => {
    void getRoles()
      .then((data) => setRoleOptions(data.roles))
      .catch(() => setRoleOptions([]));
  }, []);
  const [departmentId, setDepartmentId] = useState("");
  const [hodDepartmentIds, setHodDepartmentIds] = useState<string[]>([]);
  const [hodServiceIds, setHodServiceIds] = useState<string[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const roleLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const option of roleOptions) map[option.key] = option.label;
    return map;
  }, [roleOptions]);

  const counts = useMemo(() => {
    const byRole: Record<string, number> = {};
    for (const user of users) byRole[user.role] = (byRole[user.role] || 0) + 1;
    return {
      total: users.length,
      privileged: (byRole.superadmin || 0) + (byRole.admin || 0) + (byRole.management || 0),
      hod: byRole.hod || 0,
      staff: byRole.staff || 0,
    };
  }, [users]);

  /**
   * Search spans everything a row displays — username, the role as both key and
   * label, and every mapping chip — so looking up "cardiology" finds the row the
   * same way reading it would. The role tiles narrow the same list.
   */
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter === "privileged") {
        if (!["superadmin", "admin", "management"].includes(user.role)) return false;
      } else if (roleFilter !== "all" && user.role !== roleFilter) {
        return false;
      }
      if (!query) return true;
      const mappings = hodMappingLabels(user);
      return [
        user.username,
        user.role,
        roleLabels[user.role] || "",
        staffDepartmentName(user),
        ...mappings.departments,
        ...mappings.services,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [users, search, roleFilter, roleLabels]);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [u, d, s] = await Promise.all([getUsers(), getHospitalDepartments(), getServices()]);
      setUsers(u);
      setDepartments(d);
      setServices(s);
    } catch {
      setError("Could not load data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setUsername("");
    setPassword("");
    setShowPassword(false);
    setRole("staff");
    setDepartmentId("");
    setHodDepartmentIds([]);
    setHodServiceIds([]);
    setEditingUserId(null);
  }

  function openCreate() {
    resetForm();
    setError(null);
    setSheetOpen(true);
  }

  function startEdit(user: UserRow) {
    setEditingUserId(user._id);
    setUsername(user.username);
    setPassword("");
    setShowPassword(false);
    setRole(user.role);

    if (user.role === "staff") {
      const userDept =
        user.departmentId && typeof user.departmentId === "object" && "_id" in user.departmentId
          ? user.departmentId._id
          : "";
      setDepartmentId(userDept);
      setHodDepartmentIds([]);
      setHodServiceIds([]);
    } else if (user.role === "hod") {
      setDepartmentId("");
      setHodDepartmentIds(user.hodDepartments?.map((row) => row._id) || []);
      setHodServiceIds(user.hodServices?.map((row) => row._id) || []);
    } else {
      setDepartmentId("");
      setHodDepartmentIds([]);
      setHodServiceIds([]);
    }
    setError(null);
    setSheetOpen(true);
  }

  /** Closing by any route — X, overlay, Escape — must not strand form state. */
  function onSheetOpenChange(open: boolean) {
    setSheetOpen(open);
    if (!open) {
      resetForm();
      setError(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (role === "staff" && !departmentId) {
      setError("Department is required for staff accounts.");
      return;
    }
    if (role === "hod" && hodDepartmentIds.length === 0 && hodServiceIds.length === 0) {
      setError("Select at least one department or service for this HOD.");
      return;
    }

    const payload = {
      username: username.trim(),
      role,
      ...(role === "staff"
        ? { departmentId }
        : role === "hod"
          ? {
              departmentIds: hodDepartmentIds,
              serviceIds: hodServiceIds,
            }
          : {}),
    };

    try {
      setError(null);
      setSaving(true);
      if (editingUserId) {
        await updateUser(editingUserId, {
          ...payload,
          ...(password.trim() ? { password } : {}),
        });
      } else {
        await createUser({
          ...payload,
          password,
        });
      }
      resetForm();
      setSheetOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteUser(userId: string) {
    if (!confirm("Delete this user?")) return;
    try {
      setError(null);
      await deleteUser(userId);
      if (editingUserId === userId) {
        resetForm();
        setSheetOpen(false);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function onRoleChange(nextRole: UserRole) {
    setRole(nextRole);
    if (nextRole !== "hod") {
      setHodDepartmentIds([]);
      setHodServiceIds([]);
    }
    if (nextRole !== "staff") {
      setDepartmentId("");
    }
    if (nextRole === "admin") {
      setHodDepartmentIds([]);
      setHodServiceIds([]);
    }
  }

  const isFiltering = search.trim().length > 0 || roleFilter !== "all";

  return (
    <div className="w-full pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Users</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage admin, staff and HOD accounts, and the departments they own.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#2A6FDB] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#1e5bbd] focus:outline-none focus:ring-4 focus:ring-blue-500/20"
        >
          <Plus size={16} />
          Add user
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<UsersIcon size={17} />}
          label="All accounts"
          value={counts.total}
          gradient="from-[#2A6FDB] to-blue-800"
          active={roleFilter === "all"}
          onClick={() => setRoleFilter("all")}
        />
        <StatTile
          icon={<ShieldCheck size={17} />}
          label="Admin & management"
          value={counts.privileged}
          gradient="from-violet-600 to-violet-800"
          active={roleFilter === "privileged"}
          onClick={() => setRoleFilter("privileged")}
        />
        <StatTile
          icon={<Stethoscope size={17} />}
          label="Heads of department"
          value={counts.hod}
          gradient="from-amber-500 to-amber-600"
          active={roleFilter === "hod"}
          onClick={() => setRoleFilter("hod")}
        />
        <StatTile
          icon={<UserCog size={17} />}
          label="Staff"
          value={counts.staff}
          gradient="from-emerald-500 to-emerald-700"
          active={roleFilter === "staff"}
          onClick={() => setRoleFilter("staff")}
        />
      </div>

      {error && !sheetOpen ? (
        <div className="mt-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 shrink-0" size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200/80 bg-white">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="relative sm:w-80">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={15}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, role or department…"
              aria-label="Search users"
              className={`${FIELD_CLASS} py-2 pl-9 ${search ? "pr-9" : ""}`}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-0 top-0 grid h-full w-9 place-items-center text-gray-400 transition hover:text-gray-700"
              >
                <X size={15} />
              </button>
            ) : null}
          </div>
          <p className="text-xs text-gray-500">
            {loading
              ? "Loading…"
              : isFiltering
                ? `${filteredUsers.length} of ${users.length} accounts`
                : `${users.length} accounts`}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-16 text-sm text-gray-500">
            <Loader2 className="animate-spin" size={16} />
            Loading users…
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-16 text-center">
            <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-gray-50 text-gray-400">
              {users.length === 0 ? <UsersIcon size={20} /> : <Search size={20} />}
            </div>
            <p className="text-sm font-medium text-gray-800">
              {users.length === 0 ? "No users yet" : "No matching users"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
              {users.length === 0
                ? "Create the first account to get started."
                : "Try a different search term, or clear the filters."}
            </p>
            {users.length === 0 ? (
              <button
                type="button"
                onClick={openCreate}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#2A6FDB] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1e5bbd]"
              >
                <Plus size={15} />
                Add user
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setRoleFilter("all");
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                <X size={15} />
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                    User
                  </th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Role
                  </th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Departments &amp; services
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const allMappings = mappingChips(u);
                  return (
                    <tr
                      key={u._id}
                      className="group border-b border-gray-100 transition last:border-b-0 hover:bg-gray-50/60"
                    >
                      <td className="px-4 py-3 align-middle">
                        <span className="font-mono text-sm font-medium text-gray-900">
                          {u.username}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <RoleBadge role={u.role} label={roleLabels[u.role]} />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {allMappings.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {allMappings.map((name) => (
                              <Chip key={name}>{name}</Chip>
                            ))}
                          </div>
                        ) : u.role === "hod" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                            <AlertCircle size={12} />
                            No mappings
                          </span>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center justify-end gap-1 opacity-60 transition group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => startEdit(u)}
                            aria-label={`Edit ${u.username}`}
                            className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 transition hover:bg-blue-50 hover:text-[#2A6FDB]"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDeleteUser(u._id)}
                            aria-label={`Delete ${u.username}`}
                            className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={onSheetOpenChange}>
        <SheetContent className="w-full gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-gray-100 px-5 py-4">
            <SheetTitle className="text-base font-semibold text-gray-900">
              {editingUserId ? "Edit user" : "Add user"}
            </SheetTitle>
            <SheetDescription className="text-sm text-gray-500">
              {editingUserId
                ? "Leave the password blank to keep the current one."
                : "The account can sign in as soon as it is created."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div>
                <label className={LABEL_CLASS}>Username</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="off"
                  className={`${FIELD_CLASS} font-mono`}
                  placeholder="login id (lowercase)"
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required={!editingUserId}
                    minLength={editingUserId ? undefined : 6}
                    className={`${FIELD_CLASS} pr-11`}
                    placeholder={editingUserId ? "Leave blank to keep current" : "min 6 characters"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 grid w-11 place-items-center text-gray-400 transition hover:text-gray-700"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>Role</label>
                <select
                  value={role}
                  onChange={(e) => onRoleChange(e.target.value as UserRole)}
                  className={FIELD_CLASS}
                >
                  {roleOptions.length ? (
                    roleOptions.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="staff">Staff</option>
                      <option value="hod">HOD (Head of Department)</option>
                      <option value="admin">Admin</option>
                    </>
                  )}
                </select>
              </div>

              {role === "staff" ? (
                <div>
                  <label className={LABEL_CLASS}>
                    Department <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    required
                    className={FIELD_CLASS}
                  >
                    <option value="">— Select department —</option>
                    {departments.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {role === "hod" ? (
                <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                  <div className="flex items-start gap-2.5">
                    <Building2 className="mt-0.5 shrink-0 text-gray-400" size={16} />
                    <p className="text-[13px] leading-relaxed text-gray-600">
                      Tickets for any selected department or service appear in this HOD&rsquo;s
                      queue.
                    </p>
                  </div>
                  <MappingChecklist
                    title="Departments"
                    items={departments}
                    selectedIds={hodDepartmentIds}
                    onChange={setHodDepartmentIds}
                    emptyLabel="No departments in the catalog yet."
                  />
                  <MappingChecklist
                    title="Services"
                    items={services}
                    selectedIds={hodServiceIds}
                    onChange={setHodServiceIds}
                    emptyLabel="No routing services in the catalog yet."
                  />
                </div>
              ) : null}

              {error ? (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 shrink-0" size={16} />
                  <span>{error}</span>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={() => onSheetOpenChange(false)}
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-[#2A6FDB] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#1e5bbd] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="animate-spin" size={15} />
                ) : (
                  <Check size={15} />
                )}
                {editingUserId ? "Save changes" : "Create user"}
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
