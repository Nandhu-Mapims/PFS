import { Navigate, Outlet, useLocation } from "react-router";
import { getSession } from "../lib/auth";
import { patientRoutes } from "../lib/patientRoutes";

export function StaffGuard() {
  const location = useLocation();
  const session = getSession();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function AdminGuard() {
  const session = getSession();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: "/admin" }} />;
  }

  if (session.role !== "admin") {
    return <Navigate to={patientRoutes.home} replace />;
  }

  return <Outlet />;
}
