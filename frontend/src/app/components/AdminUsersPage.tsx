import { FormEvent, useEffect, useState } from "react";
import {
  createUser,
  deleteUser,
  getDepartments,
  getUsers,
  type Department,
  type UserRow,
  updateUser,
} from "../lib/api";
import type { UserRole } from "../lib/auth";

export function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("staff");
  const [departmentId, setDepartmentId] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [u, d] = await Promise.all([getUsers(), getDepartments()]);
      setUsers(u);
      setDepartments(d);
    } catch {
      setError("Could not load data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if ((role === "staff" || role === "hod") && !departmentId) {
      setError("Department is required for staff and HOD accounts.");
      return;
    }
    try {
      setError(null);
      if (editingUserId) {
        await updateUser(editingUserId, {
          username: username.trim(),
          role,
          departmentId: departmentId || null,
          ...(password.trim() ? { password } : {}),
        });
      } else {
        await createUser({
          username: username.trim(),
          password,
          role,
          departmentId: departmentId || null,
        });
      }
      setUsername("");
      setPassword("");
      setRole("staff");
      setDepartmentId("");
      setEditingUserId(null);
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
    setDepartmentId(
      user.departmentId && typeof user.departmentId === "object" && "_id" in user.departmentId
        ? user.departmentId._id
        : ""
    );
    setError(null);
  }

  function cancelEdit() {
    setEditingUserId(null);
    setUsername("");
    setPassword("");
    setRole("staff");
    setDepartmentId("");
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
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[#2A6FDB] outline-none bg-white"
            >
              <option value="staff">Staff</option>
              <option value="hod">HOD (Head of Department)</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Department {role === "staff" || role === "hod" ? "(required)" : "(optional)"}
            </label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              required={role === "staff" || role === "hod"}
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
