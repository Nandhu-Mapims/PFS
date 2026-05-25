import { FormEvent, useEffect, useState } from "react";
import {
  createHospitalDepartment,
  deleteHospitalDepartment,
  getHospitalDepartments,
  updateHospitalDepartment,
  type Department,
} from "../lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

export function AdminHospitalDepartmentsPage() {
  const [list, setList] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [deptName, setDeptName] = useState("");
  const [deptDescription, setDeptDescription] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError(null);
      setList(await getHospitalDepartments());
    } catch {
      setError("Could not load departments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      setError(null);
      setSuccess(null);
      await createHospitalDepartment({
        name: deptName.trim(),
        description: deptDescription.trim(),
      });
      setDeptName("");
      setDeptDescription("");
      setSuccess("Department created.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  function onStartEdit(item: Department) {
    setEditingId(item._id);
    setEditName(item.name);
    setEditDescription(item.description || "");
    setError(null);
    setSuccess(null);
  }

  function onCancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
  }

  async function onSaveEdit(id: string) {
    try {
      setError(null);
      setSuccess(null);
      await updateHospitalDepartment(id, {
        name: editName.trim(),
        description: editDescription.trim(),
      });
      onCancelEdit();
      setSuccess("Department updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(`Delete department "${name}"? Staff assignments using it will be cleared.`)) return;
    try {
      setError(null);
      await deleteHospitalDepartment(id);
      setSuccess("Department deleted.");
      await load();
    } catch {
      setError("Delete failed.");
    }
  }

  return (
    <div className="w-full space-y-6 pb-8">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}

      <Card className="rounded-2xl shadow-sm border border-gray-100">
        <CardHeader>
          <CardTitle className="text-lg">Create department</CardTitle>
          <CardDescription>
            Name should match hospital units where possible (e.g. Cardiology, Emergency).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onCreate(e)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Department name <span className="text-red-500">*</span>
                </label>
                <input
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  required
                  className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-[#2A6FDB] outline-none"
                  placeholder="e.g. Cardiology"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <input
                  value={deptDescription}
                  onChange={(e) => setDeptDescription(e.target.value)}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-[#2A6FDB] outline-none"
                  placeholder="Short description"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-[#2A6FDB] text-white font-semibold rounded-xl hover:bg-[#1e5bbd] shadow-sm"
            >
              Create department
            </button>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <CardHeader className="border-b border-gray-100 bg-gray-50/50">
          <CardTitle className="text-lg">All departments</CardTitle>
          <CardDescription>
            {loading ? "Loading…" : `${list.length} department(s) in database`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-gray-500">Loading departments…</p>
          ) : list.length === 0 ? (
            <p className="p-8 text-center text-gray-500">
              No departments yet. Create one using the form above.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {list.map((dept) => (
                <li key={dept._id} className="p-6 hover:bg-gray-50/80 transition-colors">
                  {editingId === dept._id ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="p-3 border-2 border-gray-200 rounded-xl w-full"
                          placeholder="Department name"
                        />
                        <input
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="p-3 border-2 border-gray-200 rounded-xl w-full"
                          placeholder="Description"
                        />
                      </div>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => void onSaveEdit(dept._id)}
                          className="px-4 py-2 bg-[#2A6FDB] text-white rounded-lg text-sm font-semibold"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={onCancelEdit}
                          className="px-4 py-2 border rounded-lg text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900">{dept.name}</h3>
                        {dept.description ? (
                          <p className="text-sm text-gray-600 mt-1">{dept.description}</p>
                        ) : (
                          <p className="text-sm text-gray-400 mt-1 italic">No description</p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-3">
                        <button
                          type="button"
                          onClick={() => onStartEdit(dept)}
                          className="text-sm font-semibold text-[#2A6FDB] hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDelete(dept._id, dept.name)}
                          className="text-sm font-semibold text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
