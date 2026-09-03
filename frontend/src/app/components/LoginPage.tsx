import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { login, type UserRole } from "../lib/auth";
import feedbackLogo from "./image/feedback_logo.png";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nextPath = (location.state as { from?: string } | null)?.from;

  function continueAfterLogin(role: UserRole) {
    if (role === "admin") {
      navigate("/admin", { replace: true });
      return;
    }
    if (role === "hod") {
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

    continueAfterLogin(session.role);
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
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#2A6FDB] outline-none"
            />
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
