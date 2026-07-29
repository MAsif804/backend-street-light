import { Hono } from "hono";
import { prisma } from "../lib/prisma";

const city = new Hono();

// GET /cities — list all cities (with cluster counts)
city.get("/", async (c) => {
  const cities = await prisma.city.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { clusters: true } } },
  });
  return c.json(cities);
});

// GET /cities/:id — a single city with its clusters, each with its locations
city.get("/:id", async (c) => {
  const id = c.req.param("id");
  const found = await prisma.city.findUnique({
    where: { id },
    include: {
      clusters: {
        orderBy: { name: "asc" },
        include: { locations: { orderBy: { name: "asc" } } },
      },
    },
  });
  if (!found) return c.json({ error: "City not found" }, 404);
  return c.json(found);
});

// POST /cities — { name }
city.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name is required" }, 400);

  try {
    const created = await prisma.city.create({ data: { name: body.name } });
    return c.json(created, 201);
  } catch (err: any) {
    if (err.code === "P2002") return c.json({ error: "City already exists" }, 409);
    return c.json({ error: err.message }, 400);
  }
});

// PUT /cities/:id — rename a city
city.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  try {
    const updated = await prisma.city.update({ where: { id }, data: { name: body.name } });
    return c.json(updated);
  } catch (err: any) {
    if (err.code === "P2025") return c.json({ error: "City not found" }, 404);
    if (err.code === "P2002") return c.json({ error: "City already exists" }, 409);
    return c.json({ error: err.message }, 400);
  }
});

// DELETE /cities/:id — removes the city and (cascade) its locations + clusters
city.delete("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await prisma.city.delete({ where: { id } });
    return c.json({ message: "City deleted" });
  } catch (err: any) {
    if (err.code === "P2025") return c.json({ error: "City not found" }, 404);
    return c.json({ error: err.message }, 400);
  }
});

export default city;
