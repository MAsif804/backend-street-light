import { Hono } from "hono";
import { prisma } from "../lib/prisma";

const location = new Hono();

// GET /locations?clusterId=... | ?cityId=... — list locations, optionally
// scoped to a cluster (direct) or a city (via the cluster's city).
location.get("/", async (c) => {
  const clusterId = c.req.query("clusterId");
  const cityId = c.req.query("cityId");
  const locations = await prisma.location.findMany({
    where: clusterId ? { clusterId } : cityId ? { cluster: { cityId } } : undefined,
    orderBy: { name: "asc" },
    include: { cluster: { include: { city: true } } },
  });
  return c.json(locations);
});

// GET /locations/:id
location.get("/:id", async (c) => {
  const id = c.req.param("id");
  const found = await prisma.location.findUnique({
    where: { id },
    include: { cluster: { include: { city: true } } },
  });
  if (!found) return c.json({ error: "Location not found" }, 404);
  return c.json(found);
});

// POST /locations — { name, clusterId }
location.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name is required" }, 400);
  if (!body.clusterId) return c.json({ error: "clusterId is required" }, 400);

  try {
    const created = await prisma.location.create({ data: { name: body.name, clusterId: body.clusterId } });
    return c.json(created, 201);
  } catch (err: any) {
    if (err.code === "P2002") return c.json({ error: "Location already exists in this cluster" }, 409);
    if (err.code === "P2003") return c.json({ error: "clusterId refers to a cluster that doesn't exist" }, 400);
    return c.json({ error: err.message }, 400);
  }
});

// PUT /locations/:id — update name and/or move to another cluster
location.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  try {
    const updated = await prisma.location.update({
      where: { id },
      data: { name: body.name, clusterId: body.clusterId },
    });
    return c.json(updated);
  } catch (err: any) {
    if (err.code === "P2025") return c.json({ error: "Location not found" }, 404);
    if (err.code === "P2002") return c.json({ error: "Location already exists in this cluster" }, 409);
    if (err.code === "P2003") return c.json({ error: "clusterId refers to a cluster that doesn't exist" }, 400);
    return c.json({ error: err.message }, 400);
  }
});

// DELETE /locations/:id
location.delete("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await prisma.location.delete({ where: { id } });
    return c.json({ message: "Location deleted" });
  } catch (err: any) {
    if (err.code === "P2025") return c.json({ error: "Location not found" }, 404);
    return c.json({ error: err.message }, 400);
  }
});

export default location;
