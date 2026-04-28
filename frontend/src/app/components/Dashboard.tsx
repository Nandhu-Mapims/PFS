import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getFeedback, updateFeedbackStatus, type FeedbackItem } from "../lib/api";

const statusStyles: Record<FeedbackItem["status"], string> = {
  New: "bg-[#2A6FDB] text-white",
  "In Progress": "bg-[#F4A261] text-white",
  Resolved: "bg-[#2FBF71] text-white",
};

const ratingLabel: Record<number, string> = {
  1: "Very Poor",
  2: "Poor",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

export function Dashboard() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await getFeedback();
        setItems(data);
      } catch (_error) {
        setError("Failed to load staff queue.");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const departments = useMemo(
    () => ["All", ...Array.from(new Set(items.map((item) => item.department)))],
    [items]
  );

  const filteredItems = items.filter((item) => {
    const search = searchTerm.trim().toLowerCase();
    const matchesSearch =
      item.patientName.toLowerCase().includes(search) ||
      item.comments.toLowerCase().includes(search);
    const matchesDepartment =
      filterDepartment === "All" || item.department === filterDepartment;
    const matchesStatus = filterStatus === "All" || item.status === filterStatus;
    return matchesSearch && matchesDepartment && matchesStatus;
  });

  async function handleStatusChange(id: string, status: FeedbackItem["status"]) {
    try {
      setError(null);
      const updated = await updateFeedbackStatus(id, status);
      setItems((current) =>
        current.map((item) => (item._id === id ? updated : item))
      );
    } catch (_error) {
      setError("Failed to update status.");
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
          Staff Feedback Queue
        </h2>
        <p className="text-base md:text-lg text-gray-600">
          Track, prioritize, and resolve feedback
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-[#2A6FDB]">
          <p className="text-gray-600 text-sm mb-1 font-medium">Total</p>
          <p className="text-3xl font-bold text-gray-800">{items.length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-[#2A6FDB]">
          <p className="text-[#2A6FDB] text-sm mb-1 font-bold">New</p>
          <p className="text-3xl font-bold text-[#2A6FDB]">
            {items.filter((item) => item.status === "New").length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-[#F4A261]">
          <p className="text-[#F4A261] text-sm mb-1 font-bold">In Progress</p>
          <p className="text-3xl font-bold text-[#F4A261]">
            {items.filter((item) => item.status === "In Progress").length}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-md border-l-4 border-[#2FBF71]">
          <p className="text-[#2FBF71] text-sm mb-1 font-bold">Resolved</p>
          <p className="text-3xl font-bold text-[#2FBF71]">
            {items.filter((item) => item.status === "Resolved").length}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 mb-6 shadow-md">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Search by patient name or comments..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2A6FDB] focus:ring-2 focus:ring-[#2A6FDB] focus:ring-opacity-20 outline-none text-base"
            />
          </div>
          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2A6FDB] focus:ring-2 focus:ring-[#2A6FDB] focus:ring-opacity-20 outline-none bg-white font-medium"
          >
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept === "All" ? "All Departments" : dept}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-[#2A6FDB] focus:ring-2 focus:ring-[#2A6FDB] focus:ring-opacity-20 outline-none bg-white font-medium"
          >
            <option value="All">All Status</option>
            <option value="New">New</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-gray-600">Loading staff queue...</p>
        ) : error ? (
          <p className="p-6 text-red-600">{error}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F5F7FA]">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                    Patient
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                    Department
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                    Rating
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                    Comments
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">
                    Submitted
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredItems.map((item) => (
                  <tr key={item._id} className="hover:bg-[#F5F7FA] transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-800">
                      {item.patientName}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{item.department}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {item.rating} - {ratingLabel[item.rating]}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold ${statusStyles[item.status]}`}
                      >
                        {item.status}
                      </span>
                      <select
                        value={item.status}
                        onChange={(e) =>
                          handleStatusChange(
                            item._id,
                            e.target.value as FeedbackItem["status"]
                          )
                        }
                        className="mt-2 block px-2 py-1 border rounded text-sm"
                      >
                        <option value="New">New</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Resolved">Resolved</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {item.comments || "No comment"}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
