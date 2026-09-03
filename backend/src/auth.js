import crypto from "crypto";
import jwt from "jsonwebtoken";

import { getRoleCapabilities } from "./roles.js";

/**
 * Authentication and capability-based authorisation.
 *
 * Guards check a CAPABILITY, never a role string. Roles are only a named bundle
 * of capabilities, defined in the `roles` collection (see roles.js), so adding a
 * role is a data change rather than an edit to every route.
 */

export { CAPABILITIES, ALL_CAPABILITIES, CAPABILITY_CATALOG } from "./capabilities.js";

/**
 * Capabilities come from the role registry (Mongo-backed, cached), not from a
 * constant and not from the token. A role edit therefore takes effect on the
 * user's very next request rather than at their next login.
 */
export function capabilitiesForRole(role) {
  return getRoleCapabilities(role);
}

export function roleHasCapability(role, capability) {
  return capabilitiesForRole(role).includes(capability);
}

const TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS) || 12 * 60 * 60;

let cachedSecret = null;

/**
 * Signing secret. A stable JWT_SECRET must be set in any real deployment —
 * without one, tokens are signed with an ephemeral key, so every process restart
 * silently logs everyone out and multiple API instances reject each other's
 * tokens. We refuse to start that way in production rather than fail mysteriously.
 */
export function getJwtSecret() {
  if (cachedSecret) return cachedSecret;
  const configured = process.env.JWT_SECRET?.trim();
  if (configured) {
    cachedSecret = configured;
    return cachedSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET is required in production — set it in backend/.env before starting the API."
    );
  }
  cachedSecret = crypto.randomBytes(48).toString("hex");
  // eslint-disable-next-line no-console
  console.warn(
    "[auth] JWT_SECRET not set — using a temporary key. Sessions will not survive a restart. Set JWT_SECRET in backend/.env."
  );
  return cachedSecret;
}

export function signAuthToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      username: user.username,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: TOKEN_TTL_SECONDS }
  );
}

function bearerFromRequest(req) {
  const header = req.headers?.authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

function verify(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}

/** Attaches req.user when a valid token is present; never rejects. */
export function attachUser(req, _res, next) {
  const token = bearerFromRequest(req);
  if (token) {
    const payload = verify(token);
    if (payload?.sub) {
      req.user = {
        id: String(payload.sub),
        username: payload.username,
        role: payload.role,
        capabilities: capabilitiesForRole(payload.role),
      };
    }
  }
  next();
}

/** Rejects anonymous or invalid-token requests. */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  return next();
}

/** Rejects unless the authenticated user holds every listed capability. */
export function requireCapability(...capabilities) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const missing = capabilities.filter((cap) => !req.user.capabilities.includes(cap));
    if (missing.length) {
      return res.status(403).json({ message: "You do not have access to this action" });
    }
    return next();
  };
}

/** Rejects unless the user holds at least one of the listed capabilities. */
export function requireAnyCapability(...capabilities) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!capabilities.some((cap) => req.user.capabilities.includes(cap))) {
      return res.status(403).json({ message: "You do not have access to this action" });
    }
    return next();
  };
}

export function userHasCapability(req, capability) {
  return Boolean(req.user?.capabilities?.includes(capability));
}

/**
 * Allowed browser origins. The SPA is served same-origin (nginx proxies /api, and
 * Vite proxies it in dev), so the default is deliberately restrictive: requests
 * with no Origin header (same-origin, curl, server-to-server) pass, and only
 * explicitly configured origins are echoed back.
 */
export function buildCorsOptions() {
  const raw =
    process.env.CORS_ALLOWED_ORIGINS?.trim() ||
    process.env.FEEDBACK_CORS_ORIGINS?.trim() ||
    "";
  const allowList = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    credentials: true,
    origin(origin, callback) {
      // Same-origin requests and non-browser clients send no Origin header.
      if (!origin) return callback(null, true);
      if (allowList.includes(origin)) return callback(null, true);
      // Local development hosts, so `npm run dev` works without extra config.
      if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
  };
}
