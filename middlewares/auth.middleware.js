import { verifyJWT } from "../utils/jwt.util.js";

export const requireAuth =
  ({ audience, scope }) =>
  async (req, res, next) => {
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) throw Object.assign(new Error("Missing bearer token"), { status: 401 });

      const payload = await verifyJWT(token, audience);
      if (scope) {
        const scopes = String(payload.scope || "").split(" ").filter(Boolean);
        if (!scopes.includes(scope)) {
          throw Object.assign(new Error("Insufficient scope"), { status: 403 });
        }
      }
      req.auth = payload;
      next();
    } catch (e) {
      next(Object.assign(e, { status: e.status || 401 }));
    }
  };
