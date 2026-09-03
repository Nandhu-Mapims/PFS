import { FormEvent, useEffect, useState } from "react";
import {
  createUser,
  deleteUser,
  getHospitalDepartments,
  getServices,
  getUsers,
  type Department,
  type ServiceCatalogItem,
  type UserRow,
  updateUser,
} from "../lib/api";
import type { UserRole } from "../lib/auth";

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

function MappingChecklist({
  title,
  description,
  items,
  selectedIds,
  onChange,
  emptyLabel,
}: {
  title: string;
  description: string;
  items: Array<{ _id: string; name: string }>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyLabel: string;
}) {
  return (
    <div>
      <div className="mb-2">
        <label className="block text-sm font-medium text-gray-700">{title}</label>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg p-3">
          {emptyLabel}
        </p>
      ) : (
        <div className="max-h-52 overflow-y-auto border-2 border-gray-200 rounded-lg divide-y divide-gray-100">
          {items.map((item) => {
            const checked = selectedIds.includes(item._id);
            return (
              <label
                key={item._id}
                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer text-sm ${
                  checked ? "bg-blue-50" : "bg-white hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange(toggleId(selectedIds, item._id))}
                  className="h-4 w-4 rounded border-gray-300 text-[#2A6FDB] focus:ring-[#2A6FDB]"
                />
                <span className="text-gray-800">{item.name}</span>
              </label>
            );
          })}
        </div>
      )}
      {selectedIds.length > 0 ? (
        <p className="text-xs text-gray-500 mt-1.5">{selectedIds.length} selected</p>
      ) : null}
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

export function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("staff");
  const [departmentId, setDepartmentId] = useState("");
  const [hodDepartmentIds, setHodDepartmentIds] = useState<string[]>([]);
  const [hodServiceIds, setHodServiceIds] = useState<string[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    setRole("staff");
    setDepartmentId("");
    setHodDepartmentIds([]);
    setHodServiceIds([]);
    setEditingUserId(null);
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  function startEdit(user: UserRow) {
    setEditingUserId(user._id);
    setUsername(user.username);
    setPassword("");
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
  }

  function cancelEdit() {
    resetForm();
    setError(null);
  }

  async function onDeleteUser(userId: string) {
    if (!confirm("Delete this user?")) return;
    try {
      setError(null);
      await deleteUser(userId);
      if (editingUserId === userId) {
        cancelEdit();
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

  return (
    <div className="w-full">
      <h2 className="text-3xl font-bold text-gray-800 mb-2">Users</h2>
      <p className="text-gray-600 mb-8">
        Create admin, staff, or HOD accounts. HOD users can be mapped to multiple departments and
        services.
      </p>

      <div className="bg-white rounded-xl shadow-md p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          {editingUserId ? "Edit user" : "Add user"}
        </h3>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="off"
              className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[#2A6FDB] outline-none"
              placeholder="login id (lowercase)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!editingUserId}
              minLength={editingUserId ? undefined : 6}
              className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[#2A6FDB] outline-none"
              placeholder={editingUserId ? "Leave blank to keep current password" : "min 6 characters"}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => onRoleChange(e.target.value as UserRole)}
              className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[#2A6FDB] outline-none bg-white"
            >
              <option value="staff">Staff</option>
              <option value="hod">HOD (Head of Department)</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {role === "staff" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Department (required)
              </label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                required
                className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[#2A6FDB] outline-none bg-white"
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
            <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
              <p className="text-sm text-gray-700">
                Select all departments and services this HOD should own. Tickets for any selected
                mapping will appear in their queue.
              </p>
              <MappingChecklist
                title="Departments"
                description="Check or uncheck to add or remove department mappings."
                items={departments}
                selectedIds={hodDepartmentIds}
                onChange={setHodDepartmentIds}
                emptyLabel="No departments in the catalog yet."
              />
              <MappingChecklist
                title="Services"
                description="Check or uncheck to add or remove service mappings."
                items={services}
                selectedIds={hodServiceIds}
                onChange={setHodServiceIds}
                emptyLabel="No routing services in the catalog yet."
              />
            </div>
          ) : null}

          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#2A6FDB] text-white font-semibold rounded-lg hover:bg-[#1e5bbd]"
            >
              {editingUserId ? "Update user" : "Create user"}
            </button>
            {editingUserId ? (
              <button
                type="button"
                onClick={cancelEdit}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800">All users</h3>
        </div>
        {loading ? (
          <p className="p-6 text-gray-500">Loading…</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {users.map((u) => {
              const mappings = hodMappingLabels(u);
              return (
                <li key={u._id} className="px-6 py-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <span className="font-mono font-semibold text-gray-900">{u.username}</span>
                    <span className="text-sm text-gray-600 capitalize">{u.role}</span>
                    {u.role === "staff" &&
                    u.departmentId &&
                    typeof u.departmentId === "object" &&
                    "name" in u.departmentId ? (
                      <span className="text-sm text-gray-500">
                        Dept: {(u.departmentId as { name: string }).name}
                      </span>
                    ) : null}
                    {u.role === "hod" && mappings.departments.length > 0 ? (
                      <div className="text-sm text-gray-500">
                        <span className="font-medium text-gray-600">Departments: </span>
                        {mappings.departments.join(", ")}
                      </div>
                    ) : null}
                    {u.role === "hod" && mappings.services.length > 0 ? (
                      <div className="text-sm text-gray-500">
                        <span className="font-medium text-gray-600">Services: </span>
                        {mappings.services.join(", ")}
                      </div>
                    ) : null}
                    {u.role === "hod" &&
                    mappings.departments.length === 0 &&
                    mappings.services.length === 0 ? (
                      <span className="text-sm text-amber-700">No department or service mappings</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(u)}
                      className="text-sm text-[#2A6FDB] hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteUser(u._id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
