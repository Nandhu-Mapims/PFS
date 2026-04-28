import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { login } from "../lib/auth";
import feedbackLogo from "./image/feedback_logo.png";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nextPath = (location.state as { from?: string } | null)?.from;

  function continueAfterLogin(role: "admin" | "staff") {
    if (role === "admin") {
      navigate("/admin", { replace: true });
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

  async function quickLogin(role: "admin" | "staff") {
    const demo = role === "admin"
      ? { username: "admin", password: "admin123" }
      : { username: "staff", password: "staff123" };
    setUsername(demo.username);
    setPassword(demo.password);
    setError(null);
    const session = await login(demo.username, demo.password);
    if (session) continueAfterLogin(session.role);
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
          Login as Admin or Staff to manage feedback.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <button
            type="button"
            onClick={() => quickLogin("admin")}
            className="py-3 bg-[#111827] text-white font-semibold rounded-lg hover:bg-black transition-colors"
          >
            Login as Admin
          </button>
          <button
            type="button"
            onClick={() => quickLogin("staff")}
            className="py-3 bg-[#2A6FDB] text-white font-semibold rounded-lg hover:bg-[#1e5bbd] transition-colors"
          >
            Login as Staff
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="admin / staff"
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

        <div className="mt-6 text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
          <p className="font-semibold text-gray-700 mb-1">Demo accounts</p>
          <p>Admin: admin / admin123</p>
          <p>Staff: staff / staff123</p>
        </div>
      </div>
    </div>
  );
}
