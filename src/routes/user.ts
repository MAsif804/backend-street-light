import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";

const user = new Hono();

user.use("*", authMiddleware); // protect all routes below

const safeSelect = {
  id: true,
  email: true,
  role: true,
  avatar: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

// GET /users — list all users
user.get("/", async (c) => {
  const users = await prisma.user.findMany({ select: safeSelect });
  return c.json(users);
});

// GET /users/:id — get one user
user.get("/:id", async (c) => {
  const id = c.req.param("id");
  const found = await prisma.user.findUnique({ where: { id }, select: safeSelect });

  if (!found) return c.json({ error: "User not found" }, 404);
  return c.json(found);
});

// PUT /users/:id — update user
user.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  const data: any = {
    email: body.email,
    role: body.role,
    avatar: body.avatar,
    isActive: body.isActive,
  };

  if (body.password) {
    data.password = await bcrypt.hash(body.password, 10);
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data,
      select: safeSelect,
    });
    return c.json(updated);
  } catch (err: any) {
    if (err.code === "P2025") return c.json({ error: "User not found" }, 404);
    if (err.code === "P2002") return c.json({ error: "Email already in use" }, 409);
    return c.json({ error: err.message }, 400);
  }
});

// DELETE /users/:id — delete user
user.delete("/:id", async (c) => {
  const id = c.req.param("id");

  try {
    await prisma.user.delete({ where: { id } });
    return c.json({ message: "User deleted" });
  } catch (err: any) {
    if (err.code === "P2025") return c.json({ error: "User not found" }, 404);
    return c.json({ error: err.message }, 400);
  }
});

export default user;