import { FormEvent, useEffect, useState } from "react";
import {
  createUser,
  deleteUser,
  getDepartments,
  getServices,
  getUsers,
  type Department,
  type ServiceCatalogItem,
  type UserRow,
  updateUser,
} from "../lib/api";
import type { UserRole } from "../lib/auth";

type HodAssignType = "department" | "service";

export function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("staff");
  const [departmentId, setDepartmentId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [hodAssignType, setHodAssignType] = useState<HodAssignType>("department");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [u, d, s] = await Promise.all([getUsers(), getDepartments(), getServices()]);
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
    setServiceId("");
    setHodAssignType("department");
    setEditingUserId(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (role === "staff" && !departmentId) {
      setError("Department is required for staff accounts.");
      return;
    }
    if (role === "hod") {
      if (hodAssignType === "department" && !departmentId) {
        setError("Select a department for this HOD.");
        return;
      }
      if (hodAssignType === "service" && !serviceId) {
        setError("Select a service for this HOD.");
        return;
      }
    }

    const payload = {
      username: username.trim(),
      role,
      departmentId: role === "hod" && hodAssignType === "service" ? null : departmentId || null,
      serviceId: role === "hod" && hodAssignType === "service" ? serviceId : null,
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

    const userService =
      user.serviceId && typeof user.serviceId === "object" && "_id" in user.serviceId
        ? user.serviceId._id
        : "";
    const userDept =
      user.departmentId && typeof user.departmentId === "object" && "_id" in user.departmentId
        ? user.departmentId._id
        : "";

    if (user.role === "hod" && userService) {
      setHodAssignType("service");
      setServiceId(userService);
      setDepartmentId("");
    } else {
      setHodAssignType("department");
      setDepartmentId(userDept);
      setServiceId("");
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
      setServiceId("");
      setHodAssignType("department");
    }
    if (nextRole === "admin") {
      setDepartmentId("");
      setServiceId("");
    }
  }

  return (
    <div className="w-full">
      <h2 className="text-3xl font-bold text-gray-800 mb-2">Users</h2>
      <p className="text-gray-600 mb-8">Create admin, staff, or HOD accounts (passwords stored securely on the server).</p>

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

          {role === "hod" ? (
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-2">HOD assignment (required)</span>
              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="hodAssignType"
                    checked={hodAssignType === "department"}
                    onChange={() => {
                      setHodAssignType("department");
                      setServiceId("");
                    }}
                  />
                  Department
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="hodAssignType"
                    checked={hodAssignType === "service"}
                    onChange={() => {
                      setHodAssignType("service");
                      setDepartmentId("");
                    }}
                  />
                  Service
                </label>
              </div>
            </div>
          ) : null}

          {role === "staff" || (role === "hod" && hodAssignType === "department") ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Department {role === "staff" || role === "hod" ? "(required)" : "(optional)"}
              </label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                required={role === "staff" || (role === "hod" && hodAssignType === "department")}
                className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[#2A6FDB] outline-none bg-white"
              >
                <option value="">— None —</option>
                {departments.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {role === "hod" && hodAssignType === "service" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Service (required)</label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                required
                className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[#2A6FDB] outline-none bg-white"
              >
                <option value="">— None —</option>
                {services.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
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
            {users.map((u) => (
              <li key={u._id} className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="font-mono font-semibold text-gray-900">{u.username}</span>
                  <span className="text-sm text-gray-600 capitalize">{u.role}</span>
                  {u.departmentId && typeof u.departmentId === "object" && "name" in u.departmentId ? (
                    <span className="text-sm text-gray-500">
                      Dept: {(u.departmentId as { name: string }).name}
                    </span>
                  ) : null}
                  {u.serviceId && typeof u.serviceId === "object" && "name" in u.serviceId ? (
                    <span className="text-sm text-gray-500">
                      Service: {(u.serviceId as { name: string }).name}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
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
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
