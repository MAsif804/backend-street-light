import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/jwt";
import { authMiddleware } from "../middleware/auth";

const auth = new Hono();

// POST /auth/register — create user (sign up)
auth.post("/register", async (c) => {
  const body = await c.req.json();

  if (!body.email || !body.password) {
    return c.json({ error: "email and password are required" }, 400);
  }

  try {
    const hashedPassword = await bcrypt.hash(body.password, 10);

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        password: hashedPassword,
        role: body.role, // optional, defaults to ADMIN per your schema
        avatar: body.avatar,
      },
      select: {
        id: true,
        email: true,
        role: true,
        avatar: true,
        isActive: true,
        createdAt: true,
      }, // never return password
    });

    const token = signToken({ id: user.id, role: user.role });

    return c.json({ user, token }, 201);
  } catch (err: any) {
    if (err.code === "P2002") {
      return c.json({ error: "Email already in use" }, 409);
    }
    return c.json({ error: err.message }, 400);
  }
});

// POST /auth/login
auth.post("/login", async (c) => {
  const body = await c.req.json();

  if (!body.email || !body.password) {
    return c.json({ error: "email and password are required" }, 400);
  }

  const user = await prisma.user.findUnique({ where: { email: body.email } });

  if (!user || !user.isActive) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const validPassword = await bcrypt.compare(body.password, user.password);

  if (!validPassword) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = signToken({ id: user.id, role: user.role });

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      isActive: user.isActive,
    },
    token,
  });
});

// GET /auth/me — get current logged-in user (protected)
auth.get("/me", authMiddleware, async (c) => {
  const payload = c.get("user" as never) as { id: string; role: string };

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      email: true,
      role: true,
      avatar: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }
  return c.json(user);
});

export default auth;