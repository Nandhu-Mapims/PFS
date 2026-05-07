import { Search, Users, CircleAlert, LoaderCircle, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getFeedback, updateFeedbackStatus, type FeedbackItem } from "../lib/api";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

const ratingLabel: Record<number, string> = {
  1: "Very Poor",
  2: "Poor",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

const statusOptions: FeedbackItem["status"][] = ["New", "In Progress", "Resolved"];

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
      (item.comments || "").toLowerCase().includes(search);
    const matchesDepartment =
      filterDepartment === "All" || item.department === filterDepartment;
    const matchesStatus = filterStatus === "All" || item.status === filterStatus;
    return matchesSearch && matchesDepartment && matchesStatus;
  });

  const totalCount = items.length;
  const newCount = items.filter((item) => item.status === "New").length;
  const inProgressCount = items.filter((item) => item.status === "In Progress").length;
  const resolvedCount = items.filter((item) => item.status === "Resolved").length;

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
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Staff Feedback Queue
        </h2>
        <p className="text-muted-foreground text-sm md:text-base">
          Track, prioritize, and resolve feedback
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">Total</CardDescription>
            <CardTitle className="text-3xl">{totalCount}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-muted-foreground flex items-center gap-2 text-xs">
            <Users size={14} />
            Live queue volume
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">New</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{newCount}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-muted-foreground text-xs">
            Needs initial triage
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">
              In Progress
            </CardDescription>
            <CardTitle className="text-3xl text-amber-600">{inProgressCount}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-muted-foreground flex items-center gap-2 text-xs">
            <LoaderCircle size={14} />
            Assigned and in review
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">Resolved</CardDescription>
            <CardTitle className="text-3xl text-emerald-600">{resolvedCount}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-muted-foreground flex items-center gap-2 text-xs">
            <CheckCircle2 size={14} />
            Closed this cycle
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <div className="relative">
            <Search
                className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
                size={18}
            />
              <Input
              type="text"
              placeholder="Search by patient name or comments..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
            />
          </div>

            <Select value={filterDepartment} onValueChange={setFilterDepartment}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept === "All" ? "All Departments" : dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Status</SelectItem>
                <SelectItem value="New">New</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="Resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        {isLoading ? (
          <p className="text-muted-foreground p-6">Loading staff queue...</p>
        ) : error ? (
          <p className="p-6 text-red-600 flex items-center gap-2">
            <CircleAlert size={16} />
            {error}
          </p>
        ) : (
          <CardContent className="px-0 pb-0">
            <div className="max-h-[70vh] overflow-auto">
              <Table>
                <TableHeader className="bg-muted/30 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="px-6">
                    Patient
                    </TableHead>
                    <TableHead>
                    Department
                    </TableHead>
                    <TableHead>
                    Rating
                    </TableHead>
                    <TableHead>
                    Status
                    </TableHead>
                    <TableHead className="min-w-[280px]">
                    Comments
                    </TableHead>
                    <TableHead className="pr-6">
                    Submitted
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item._id}>
                      <TableCell className="px-6 font-medium">{item.patientName}</TableCell>
                      <TableCell className="text-muted-foreground">{item.department}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.rating} - {ratingLabel[item.rating]}
                      </TableCell>
                      <TableCell className="space-y-2">
                        <Badge
                          variant="outline"
                          className={`${
                            item.status === "New"
                              ? "border-blue-200 bg-blue-50 text-blue-700"
                              : item.status === "In Progress"
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {item.status}
                        </Badge>
                        <Select
                          value={item.status}
                          onValueChange={(value) =>
                            handleStatusChange(item._id, value as FeedbackItem["status"])
                          }
                        >
                          <SelectTrigger size="sm" className="w-36">
                            <SelectValue placeholder="Update status" />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((status) => (
                              <SelectItem key={status} value={status}>
                                {status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-normal">
                        {item.comments || "No comment"}
                      </TableCell>
                      <TableCell className="text-muted-foreground pr-6 text-sm">
                        {new Date(item.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {filteredItems.length === 0 && (
              <div className="text-muted-foreground p-8 text-center text-sm">
                No feedback matches the current filters.
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
