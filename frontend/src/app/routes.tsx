import { createBrowserRouter, Navigate } from "react-router";
import { Layout } from "./components/Layout";
import { Welcome } from "./components/Welcome";
import { FeedbackMode } from "./components/FeedbackMode";
import { FeedbackForm } from "./components/FeedbackForm";
import { BotConversationFeedback } from "./components/BotConversationFeedback";
import { PaperUpload } from "./components/PaperUpload";
import { ThankYou } from "./components/ThankYou";
import { Dashboard } from "./components/Dashboard";
import { TicketDetail } from "./components/TicketDetail";
import { ManagementDashboard } from "./components/ManagementDashboard";
import { WorkflowDiagram } from "./components/WorkflowDiagram";
import { AdminPage } from "./components/AdminPage";
import { AdminHospitalDepartmentsPage } from "./components/AdminHospitalDepartmentsPage";
import { AdminServicesPage } from "./components/AdminServicesPage";
import { AdminUsersPage } from "./components/AdminUsersPage";
import { AdminTicketsPage } from "./components/AdminTicketsPage";
import { AdminSettingsPage } from "./components/AdminSettingsPage";
import { AdminBotConversationPage } from "./components/AdminBotConversationPage";
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
      { path: "feedback/give", Component: FeedbackForm },
      { path: "feedback/bot", Component: BotConversationFeedback },
      { path: "feedback", Component: FeedbackMode },
      { path: "feedback-mode", element: <Navigate to="/feedback" replace /> },
      { path: "feedback-form", element: <Navigate to="/feedback/give" replace /> },
      { path: "voice-feedback", element: <Navigate to="/feedback/give?mode=voice" replace /> },
      { path: "bot-feedback", element: <Navigate to="/feedback/bot" replace /> },
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
          { path: "analytics", element: <Navigate to="/management" replace /> },
          { path: "insights", element: <Navigate to="/management" replace /> },
          { path: "workflow", Component: WorkflowDiagram },
        ],
      },
      {
        Component: AdminGuard,
        children: [
          { path: "admin/management-overview", Component: ManagementDashboard },
          { path: "admin/insights", Component: ManagementDashboard },
          { path: "admin/analytics", element: <Navigate to="/admin/management-overview" replace /> },
          { path: "admin/departments", Component: AdminHospitalDepartmentsPage },
          { path: "admin/services", Component: AdminServicesPage },
          { path: "admin/users", Component: AdminUsersPage },
          { path: "admin/tickets", Component: AdminTicketsPage },
          { path: "admin/tickets/delete", Component: AdminTicketsPage },
          { path: "admin/settings", Component: AdminSettingsPage },
          { path: "admin/bot-conversation", Component: AdminBotConversationPage },
          { path: "admin", Component: AdminPage },
        ],
      },
    ],
  },
]);
