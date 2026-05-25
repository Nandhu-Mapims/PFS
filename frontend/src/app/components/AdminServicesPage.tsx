import { FormEvent, useEffect, useState } from "react";
import {
  createService,
  deleteService,
  getServices,
  updateService,
  type ServiceCatalogItem,
} from "../lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

export function AdminServicesPage() {
  const [list, setList] = useState<ServiceCatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [serviceName, setServiceName] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const localCount = list.filter((row) => row.source === "local").length;
  const tmsCount = list.filter((row) => row.source === "tms").length;

  async function load() {
    try {
      setLoading(true);
      setError(null);
      setList(await getServices());
    } catch {
      setError("Could not load services.");
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
      await createService({
        name: serviceName.trim(),
        description: serviceDescription.trim(),
      });
      setServiceName("");
      setServiceDescription("");
      setSuccess("Service created.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  function onStartEdit(item: ServiceCatalogItem) {
    if (item.readOnly) return;
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
      await updateService(id, {
        name: editName.trim(),
        description: editDescription.trim(),
      });
      onCancelEdit();
      setSuccess("Service updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(`Delete service "${name}"?`)) return;
    try {
      setError(null);
      await deleteService(id);
      setSuccess("Service deleted.");
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
          <CardTitle className="text-lg">Create service</CardTitle>
          <CardDescription>
            Name should match how staff describe the unit (e.g. House Keeping, Laundry).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onCreate(e)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Service name <span className="text-red-500">*</span>
                </label>
                <input
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  required
                  className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-violet-600 outline-none"
                  placeholder="e.g. House Keeping"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <input
                  value={serviceDescription}
                  onChange={(e) => setServiceDescription(e.target.value)}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-violet-600 outline-none"
                  placeholder="Short description"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-violet-700 text-white font-semibold rounded-xl hover:bg-violet-800 shadow-sm"
            >
              Create service
            </button>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <CardHeader className="border-b border-gray-100 bg-gray-50/50">
          <CardTitle className="text-lg">All services</CardTitle>
          <CardDescription>
            {loading
              ? "Loading…"
              : list.length === 0
                ? "No services yet — create one above or connect TMS"
                : `${list.length} total (${localCount} local, ${tmsCount} from TMS)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-gray-500">Loading services…</p>
          ) : list.length === 0 ? (
            <p className="p-8 text-center text-gray-500 text-sm">
              No services in the catalog. Use the form above to add routing services for AI.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {list.map((row) => (
                <li key={`${row.source}-${row._id}`} className="p-6 hover:bg-gray-50/80 transition-colors">
                  {editingId === row._id && !row.readOnly ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="p-3 border-2 border-gray-200 rounded-xl w-full"
                          placeholder="Service name"
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
                          onClick={() => void onSaveEdit(row._id)}
                          className="px-4 py-2 bg-violet-700 text-white rounded-lg text-sm font-semibold"
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
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">{row.name}</h3>
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              row.source === "tms"
                                ? "bg-slate-100 text-slate-700"
                                : "bg-violet-100 text-violet-800"
                            }`}
                          >
                            {row.source === "tms" ? "TMS" : "Local"}
                          </span>
                        </div>
                        {row.description ? (
                          <p className="text-sm text-gray-600 mt-1">{row.description}</p>
                        ) : (
                          <p className="text-sm text-gray-400 mt-1 italic">No description</p>
                        )}
                        {row.readOnly ? (
                          <p className="text-xs text-gray-500 mt-2">
                            Managed in TMS — edit there, not in this app.
                          </p>
                        ) : null}
                      </div>
                      {!row.readOnly ? (
                        <div className="flex shrink-0 gap-3">
                          <button
                            type="button"
                            onClick={() => onStartEdit(row)}
                            className="text-sm font-semibold text-violet-700 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDelete(row._id, row.name)}
                            className="text-sm font-semibold text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
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
