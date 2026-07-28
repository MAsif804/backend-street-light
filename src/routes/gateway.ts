import { Hono } from "hono";
import { prisma } from "../lib/prisma";

// Requests (from forms / Postman) often send everything as strings and use
// "" or "-" as placeholders. Coerce values to the types the schema expects.
const toFloat = (v: unknown) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};
const toInt = (v: unknown) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : Math.trunc(n);
};
const toDate = (v: unknown) => {
  if (v === undefined || v === null || v === "") return undefined;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? undefined : d;
};
// Optional relation ids: treat blank / "-" as "not set".
const toId = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : v;
  return s === undefined || s === null || s === "" || s === "-"
    ? undefined
    : (s as string);
};

const gateway = new Hono();

// GET /gateways — list all gateways
gateway.get("/", async (c) => {
  const gateways = await prisma.gateway.findMany({
    include: {
      deviceModel: true,
    },
  });
  return c.json(gateways);
});

// GET /gateways/:id — get single gateway (with its transformers)
gateway.get("/:id", async (c) => {
  const id = c.req.param("id");

  const found = await prisma.gateway.findUnique({
    where: { id },
    include: {
      deviceModel: true,
      transformers: true,
    },
  });

  if (!found) {
    return c.json({ error: "Gateway not found" }, 404);
  }
  return c.json(found);
});

// POST /gateways — create gateway
gateway.post("/", async (c) => {
  const body = await c.req.json();

  if (!body.deviceId) {
    return c.json({ error: "deviceId is required" }, 400);
  }
  if (!body.name) {
    return c.json({ error: "name is required" }, 400);
  }

  try {
    const created = await prisma.gateway.create({
      data: {
        deviceId: body.deviceId,
        name: body.name,
        status: body.status ?? "OFF",
        region: body.region,
        cluster: body.cluster,
        installationLocation: body.installationLocation,
        latitude: toFloat(body.latitude),
        longitude: toFloat(body.longitude),
        voltage: body.voltage,
        loadCapacity: body.loadCapacity,
        powerRating: body.powerRating,
        ipRating: body.ipRating,
        operationHours: toInt(body.operationHours),
        deviceConnected: toInt(body.deviceConnected),
        current: body.current,
        lastActive: toDate(body.lastActive),
        installationDate: toDate(body.installationDate),
        lastMaintenance: toDate(body.lastMaintenance),
        deviceModelId: toId(body.deviceModelId),
      },
    });
    return c.json(created, 201);
  } catch (err: any) {
    if (err.code === "P2002") {
      return c.json({ error: "deviceId already exists" }, 409);
    }
    if (err.code === "P2003") {
      return c.json(
        { error: "deviceModelId refers to a record that doesn't exist" },
        400,
      );
    }
    return c.json({ error: err.message }, 400);
  }
});

// PUT /gateways/:id — update gateway
gateway.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  try {
    const updated = await prisma.gateway.update({
      where: { id },
      data: {
        deviceId: body.deviceId,
        name: body.name,
        status: body.status,
        region: body.region,
        cluster: body.cluster,
        installationLocation: body.installationLocation,
        latitude: toFloat(body.latitude),
        longitude: toFloat(body.longitude),
        voltage: body.voltage,
        loadCapacity: body.loadCapacity,
        powerRating: body.powerRating,
        ipRating: body.ipRating,
        operationHours: toInt(body.operationHours),
        deviceConnected: toInt(body.deviceConnected),
        current: body.current,
        lastActive: toDate(body.lastActive),
        installationDate: toDate(body.installationDate),
        lastMaintenance: toDate(body.lastMaintenance),
        deviceModelId: toId(body.deviceModelId),
      },
    });
    return c.json(updated);
  } catch (err: any) {
    if (err.code === "P2025") {
      return c.json({ error: "Gateway not found" }, 404);
    }
    if (err.code === "P2002") {
      return c.json({ error: "deviceId already exists" }, 409);
    }
    if (err.code === "P2003") {
      return c.json(
        { error: "deviceModelId refers to a record that doesn't exist" },
        400,
      );
    }
    return c.json({ error: err.message }, 400);
  }
});

// PATCH /gateways/:id — partial update (pass-through; send only valid fields)
gateway.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  try {
    const updated = await prisma.gateway.update({
      where: { id },
      data: body,
    });
    return c.json(updated);
  } catch (err: any) {
    if (err.code === "P2025") {
      return c.json({ error: "Gateway not found" }, 404);
    }
    return c.json({ error: err.message }, 400);
  }
});

// DELETE /gateways/:id — delete gateway
gateway.delete("/:id", async (c) => {
  const id = c.req.param("id");

  try {
    await prisma.gateway.delete({ where: { id } });
    return c.json({ message: "Gateway deleted" });
  } catch (err: any) {
    if (err.code === "P2025") {
      return c.json({ error: "Gateway not found" }, 404);
    }
    return c.json({ error: err.message }, 400);
  }
});

export default gateway;
