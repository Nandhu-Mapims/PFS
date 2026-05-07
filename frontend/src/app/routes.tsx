import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Welcome } from "./components/Welcome";
import { FeedbackMode } from "./components/FeedbackMode";
import { FeedbackForm } from "./components/FeedbackForm";
import { VoiceFeedback } from "./components/VoiceFeedback";
import { PaperUpload } from "./components/PaperUpload";
import { ThankYou } from "./components/ThankYou";
import { Dashboard } from "./components/Dashboard";
import { TicketDetail } from "./components/TicketDetail";
import { ManagementDashboard } from "./components/ManagementDashboard";
import { WorkflowDiagram } from "./components/WorkflowDiagram";
import { AdminPage } from "./components/AdminPage";
import { AdminDepartmentsPage } from "./components/AdminDepartmentsPage";
import { AdminUsersPage } from "./components/AdminUsersPage";
import { AdminTicketsPage } from "./components/AdminTicketsPage";
import { AdminSettingsPage } from "./components/AdminSettingsPage";
import { LoginPage } from "./components/LoginPage";
import { AdminGuard, StaffGuard } from "./components/RouteGuards";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: LoginPage },
      { path: "login", Component: LoginPage },
      { path: "welcome", Component: Welcome },
      { path: "feedback", Component: FeedbackForm },
      { path: "feedback-mode", Component: FeedbackMode },
      { path: "feedback-form", Component: FeedbackForm },
      { path: "voice-feedback", Component: VoiceFeedback },
      { path: "paper-upload", Component: PaperUpload },
      { path: "thank-you", Component: ThankYou },
      {
        Component: StaffGuard,
        children: [
          { path: "staff", Component: Dashboard },
          { path: "dashboard", Component: Dashboard },
          { path: "ticket/:id", Component: TicketDetail },
          { path: "ticket/:id/delete", Component: TicketDetail },
          { path: "management", Component: ManagementDashboard },
          { path: "workflow", Component: WorkflowDiagram },
        ],
      },
      {
        Component: AdminGuard,
        children: [
          { path: "admin/management-overview", Component: ManagementDashboard },
          { path: "admin/departments", Component: AdminDepartmentsPage },
          { path: "admin/users", Component: AdminUsersPage },
          { path: "admin/tickets", Component: AdminTicketsPage },
          { path: "admin/tickets/delete", Component: AdminTicketsPage },
          { path: "admin/settings", Component: AdminSettingsPage },
          { path: "admin", Component: AdminPage },
        ],
      },
    ],
  },
]);
