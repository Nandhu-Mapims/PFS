import { FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { login } from "../lib/auth";
import feedbackLogo from "./image/feedback_logo.png";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextPath = (location.state as { from?: string } | null)?.from;

  /**
   * Land the user on the first screen their capabilities actually allow. Keyed
   * off capabilities rather than role names, so Super Admin and Management (and
   * any future role) route correctly without another branch here.
   */
  function continueAfterLogin(capabilities: string[], role?: string) {
    if (capabilities.includes("roles.manage") || capabilities.includes("users.manage")) {
      navigate("/admin", { replace: true });
      return;
    }
    if (role === "hod" && capabilities.includes("insights.overview")) {
      navigate(nextPath || "/hod/overview", { replace: true });
      return;
    }
    if (capabilities.includes("insights.view")) {
      navigate(
        nextPath ||
          (capabilities.includes("insights.overview")
            ? "/management/overview"
            : "/management/submissions"),
        { replace: true }
      );
      return;
    }
    if (capabilities.includes("feedback.read.assigned")) {
      navigate(nextPath || "/dashboard", { replace: true });
      return;
    }
    if (capabilities.includes("feedback.read.all")) {
      navigate(nextPath || "/dashboard", { replace: true });
      return;
    }
    navigate(nextPath || "/feedback", { replace: true });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const session = await login(username, password);

    if (!session) {
      setError("Invalid username or password.");
      return;
    }

    continueAfterLogin(session.capabilities ?? [], session.role);
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="flex justify-center mb-8">
          <img
            src={feedbackLogo}
            alt="MAPIMS feedback system"
            className="h-36 sm:h-44 w-auto max-w-[min(100%,320px)] object-contain"
          />
        </div>
        <h2 className="text-3xl font-bold text-gray-800 mb-2 text-center">Mapims feedback system</h2>
        <p className="text-gray-500 mb-6">
          Login as Admin, Staff, or HOD to manage feedback.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="admin / staff / hod"
              className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#2A6FDB] outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                className="w-full p-3 pr-12 border-2 border-gray-300 rounded-lg focus:border-[#2A6FDB] outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full py-3 bg-[#2A6FDB] text-white font-semibold rounded-lg hover:bg-[#1e5bbd] transition-colors"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
