import { FormEvent, useEffect, useState } from "react";
import {
  createDepartment,
  deleteDepartment,
  getDepartments,
  updateDepartment,
  type Department,
} from "../lib/api";

export function AdminDepartmentsPage() {
  const [list, setList] = useState<Department[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError(null);
      setList(await getDepartments());
    } catch {
      setError("Could not load departments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      setError(null);
      await createDepartment({ name: name.trim(), description: description.trim() });
      setName("");
      setDescription("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this department?")) return;
    try {
      await deleteDepartment(id);
      await load();
    } catch {
      setError("Delete failed.");
    }
  }

  function onStartEdit(item: Department) {
    setEditingId(item._id);
    setEditName(item.name);
    setEditDescription(item.description || "");
    setError(null);
  }

  function onCancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
  }

  async function onSaveEdit(id: string) {
    try {
      setError(null);
      await updateDepartment(id, {
        name: editName.trim(),
        description: editDescription.trim(),
      });
      onCancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <div className="w-full">
      <h2 className="text-3xl font-bold text-gray-800 mb-2">Departments</h2>
      <p className="text-gray-600 mb-8">Create hospital departments used across the system.</p>

      <div className="bg-white rounded-xl shadow-md p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Add department</h3>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[#2A6FDB] outline-none"
              placeholder="e.g. Dermatology"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[#2A6FDB] outline-none"
              placeholder="Short description"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            className="px-5 py-2.5 bg-[#2A6FDB] text-white font-semibold rounded-lg hover:bg-[#1e5bbd]"
          >
            Create department
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800">All departments</h3>
        </div>
        {loading ? (
          <p className="p-6 text-gray-500">Loading…</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {list.map((d) => (
              <li
                key={d._id}
                className="px-6 py-4 flex items-start justify-between gap-4 hover:bg-gray-50"
              >
                {editingId === d._id ? (
                  <>
                    <div className="flex-1 space-y-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-lg focus:border-[#2A6FDB] outline-none"
                        placeholder="Department name"
                      />
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        rows={2}
                        className="w-full p-2 border border-gray-300 rounded-lg focus:border-[#2A6FDB] outline-none"
                        placeholder="Description (optional)"
                      />
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => void onSaveEdit(d._id)}
                        className="text-sm text-[#2A6FDB] hover:underline"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={onCancelEdit}
                        className="text-sm text-gray-600 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="font-semibold text-gray-900">{d.name}</p>
                      {d.description ? (
                        <p className="text-sm text-gray-600 mt-1">{d.description}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => onStartEdit(d)}
                        className="text-sm text-[#2A6FDB] hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(d._id)}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
