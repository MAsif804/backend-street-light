import { Hono } from "hono";
import { prisma } from "../lib/prisma";

const cluster = new Hono();

// GET /clusters?cityId=... — list clusters (with location counts), optionally scoped to a city
cluster.get("/", async (c) => {
  const cityId = c.req.query("cityId");
  const clusters = await prisma.cluster.findMany({
    where: cityId ? { cityId } : undefined,
    orderBy: { name: "asc" },
    include: { city: true, _count: { select: { locations: true } } },
  });
  return c.json(clusters);
});

// GET /clusters/:id — a cluster with its city and locations
cluster.get("/:id", async (c) => {
  const id = c.req.param("id");
  const found = await prisma.cluster.findUnique({
    where: { id },
    include: { city: true, locations: { orderBy: { name: "asc" } } },
  });
  if (!found) return c.json({ error: "Cluster not found" }, 404);
  return c.json(found);
});

// POST /clusters — { name, cityId }
cluster.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name is required" }, 400);
  if (!body.cityId) return c.json({ error: "cityId is required" }, 400);

  try {
    const created = await prisma.cluster.create({ data: { name: body.name, cityId: body.cityId } });
    return c.json(created, 201);
  } catch (err: any) {
    if (err.code === "P2002") return c.json({ error: "Cluster already exists in this city" }, 409);
    if (err.code === "P2003") return c.json({ error: "cityId refers to a city that doesn't exist" }, 400);
    return c.json({ error: err.message }, 400);
  }
});

// PUT /clusters/:id — update name and/or move to another city
cluster.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  try {
    const updated = await prisma.cluster.update({
      where: { id },
      data: { name: body.name, cityId: body.cityId },
    });
    return c.json(updated);
  } catch (err: any) {
    if (err.code === "P2025") return c.json({ error: "Cluster not found" }, 404);
    if (err.code === "P2002") return c.json({ error: "Cluster already exists in this city" }, 409);
    if (err.code === "P2003") return c.json({ error: "cityId refers to a city that doesn't exist" }, 400);
    return c.json({ error: err.message }, 400);
  }
});

// DELETE /clusters/:id
cluster.delete("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await prisma.cluster.delete({ where: { id } });
    return c.json({ message: "Cluster deleted" });
  } catch (err: any) {
    if (err.code === "P2025") return c.json({ error: "Cluster not found" }, 404);
    return c.json({ error: err.message }, 400);
  }
});

export default cluster;
