import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Layers,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
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
  createService,
  deleteService,
  getServices,
  getUsers,
  updateService,
  type ServiceCatalogItem,
  type UserRow,
} from "../lib/api";
import { HodAssignSelect } from "./HodAssignSelect";

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-violet-600 focus:ring-4 focus:ring-violet-500/10";

const LABEL_CLASS = "mb-1.5 block text-[13px] font-medium text-gray-700";

type HodFilter = "all" | "assigned" | "unassigned";

function StatTile({
  icon,
  label,
  value,
  gradient,
  active,
  onClick,
}: {
  icon: React.ReactNode;
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

export function AdminServicesPage() {
  const [list, setList] = useState<ServiceCatalogItem[]>([]);
  const [hodUsers, setHodUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [hodFilter, setHodFilter] = useState<HodFilter>("all");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hodUserId, setHodUserId] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [services, users] = await Promise.all([getServices(), getUsers()]);
      setList(services);
      setHodUsers(users.filter((u) => u.role === "hod"));
    } catch {
      setError("Could not load services.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(() => {
    const assigned = list.filter((s) => s.hodUserId?.username).length;
    return { total: list.length, assigned, unassigned: list.length - assigned };
  }, [list]);

  const filteredList = useMemo(() => {
    const query = search.trim().toLowerCase();
    return list.filter((svc) => {
      const hasHod = Boolean(svc.hodUserId?.username);
      if (hodFilter === "assigned" && !hasHod) return false;
      if (hodFilter === "unassigned" && hasHod) return false;
      if (!query) return true;
      return [svc.name, svc.description || "", svc.hodUserId?.username || ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [list, search, hodFilter]);

  const isFiltering = search.trim().length > 0 || hodFilter !== "all";

  function resetForm() {
    setName("");
    setDescription("");
    setHodUserId("");
    setEditingId(null);
  }

  function openCreate() {
    resetForm();
    setError(null);
    setSheetOpen(true);
  }

  function startEdit(svc: ServiceCatalogItem) {
    if (svc.readOnly) return;
    setEditingId(svc._id);
    setName(svc.name);
    setDescription(svc.description || "");
    setHodUserId(svc.hodUserId?._id || "");
    setError(null);
    setSheetOpen(true);
  }

  function onSheetOpenChange(open: boolean) {
    setSheetOpen(open);
    if (!open) {
      resetForm();
      setError(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      setError(null);
      setSaving(true);
      if (editingId) {
        await updateService(editingId, {
          name: name.trim(),
          description: description.trim(),
          hodUserId: hodUserId || null,
        });
      } else {
        await createService({ name: name.trim(), description: description.trim() });
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

  async function onDelete(id: string, svcName: string) {
    if (!confirm(`Delete service "${svcName}"?`)) return;
    try {
      setError(null);
      await deleteService(id);
      if (editingId === id) {
        resetForm();
        setSheetOpen(false);
      }
      await load();
    } catch {
      setError("Delete failed.");
    }
  }

  return (
    <div className="w-full pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Services</h1>
          <p className="mt-1 text-sm text-gray-500">
            Routing services AI assigns complaints to, and the HOD accountable for each.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-800 focus:outline-none focus:ring-4 focus:ring-violet-500/20"
        >
          <Plus size={16} />
          Add service
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          icon={<Layers size={17} />}
          label="All services"
          value={counts.total}
          gradient="from-violet-600 to-violet-800"
          active={hodFilter === "all"}
          onClick={() => setHodFilter("all")}
        />
        <StatTile
          icon={<ShieldCheck size={17} />}
          label="With HOD"
          value={counts.assigned}
          gradient="from-emerald-500 to-emerald-700"
          active={hodFilter === "assigned"}
          onClick={() => setHodFilter("assigned")}
        />
        <StatTile
          icon={<ShieldQuestion size={17} />}
          label="Unassigned"
          value={counts.unassigned}
          gradient="from-amber-500 to-amber-600"
          active={hodFilter === "unassigned"}
          onClick={() => setHodFilter("unassigned")}
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
              placeholder="Search by name or HOD…"
              aria-label="Search services"
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
                ? `${filteredList.length} of ${list.length} services`
                : `${list.length} services`}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-16 text-sm text-gray-500">
            <Loader2 className="animate-spin" size={16} />
            Loading services…
          </div>
        ) : filteredList.length === 0 ? (
          <div className="p-16 text-center">
            <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-gray-50 text-gray-400">
              {list.length === 0 ? <Layers size={20} /> : <Search size={20} />}
            </div>
            <p className="text-sm font-medium text-gray-800">
              {list.length === 0 ? "No services yet" : "No matching services"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
              {list.length === 0
                ? "Add routing services for AI to get started."
                : "Try a different search term, or clear the filters."}
            </p>
            {list.length === 0 ? (
              <button
                type="button"
                onClick={openCreate}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-800"
              >
                <Plus size={15} />
                Add service
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setHodFilter("all");
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
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Service
                  </th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                    HOD
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((svc) => (
                  <tr
                    key={`${svc.source}-${svc._id}`}
                    className="group border-b border-gray-100 transition last:border-b-0 hover:bg-gray-50/60"
                  >
                    <td className="px-4 py-3 align-middle">
                      <span className="inline-flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{svc.name}</span>
                        {svc.readOnly ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
                            <Lock size={11} />
                            TMS
                          </span>
                        ) : null}
                      </span>
                      {svc.description ? (
                        <span className="mt-0.5 block max-w-sm truncate text-xs text-gray-500">
                          {svc.description}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {svc.hodUserId?.username ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                          {svc.hodUserId.username}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          <AlertCircle size={12} />
                          Not assigned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {svc.readOnly ? (
                        <span className="block text-right text-xs text-gray-400">Managed in TMS</span>
                      ) : (
                        <div className="flex items-center justify-end gap-1 opacity-60 transition group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => startEdit(svc)}
                            aria-label={`Edit ${svc.name}`}
                            className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 transition hover:bg-violet-50 hover:text-violet-700"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDelete(svc._id, svc.name)}
                            aria-label={`Delete ${svc.name}`}
                            className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={onSheetOpenChange}>
        <SheetContent className="w-full gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-gray-100 px-5 py-4">
            <SheetTitle className="text-base font-semibold text-gray-900">
              {editingId ? "Edit service" : "Add service"}
            </SheetTitle>
            <SheetDescription className="text-sm text-gray-500">
              Name should match how staff describe the unit (e.g. House Keeping, Laundry).
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div>
                <label className={LABEL_CLASS}>
                  Service name <span className="text-red-500">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className={FIELD_CLASS}
                  placeholder="e.g. House Keeping"
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Description (optional)</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={FIELD_CLASS}
                  placeholder="Short description"
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>HOD (optional)</label>
                <HodAssignSelect
                  value={hodUserId}
                  onChange={setHodUserId}
                  hodUsers={hodUsers}
                  className={FIELD_CLASS}
                />
              </div>

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
                className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
                {editingId ? "Save changes" : "Create service"}
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
