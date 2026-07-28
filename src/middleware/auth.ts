import { Context, Next } from "hono";
import { verifyToken } from "../lib/jwt";

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "No token provided" }, 401);
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyToken(token);
    c.set("user", decoded); // attach { id, role } to context
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}