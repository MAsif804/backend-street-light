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

const transformer = new Hono();

// GET /transformers — list all transformers
transformer.get("/", async (c) => {
  const transformers = await prisma.transformer.findMany({
    include: {
      gateway: true,
      deviceModel: true,
    },
  });
  return c.json(transformers);
});

// GET /transformers/:id — get single transformer
transformer.get("/:id", async (c) => {
  const id = c.req.param("id");

  const found = await prisma.transformer.findUnique({
    where: { id },
    include: {
      gateway: true,
      deviceModel: true,
      lights: true,
      schedules: true,
    },
  });

  if (!found) {
    return c.json({ error: "Transformer not found" }, 404);
  }
  return c.json(found);
});

// POST /transformers — create transformer
transformer.post("/", async (c) => {
  const body = await c.req.json();

  if (!body.transformerId) {
    return c.json({ error: "transformerId is required" }, 400);
  }

  const name = body.name ?? body.deviceName ?? body.deviceId;

  if (!name) {
    return c.json({ error: "name is required" }, 400);
  }

  try {
    const created = await prisma.transformer.create({
      data: {
        transformerId: body.transformerId,
        deviceId: body.deviceId,
        status: body.status ?? "OFF",
        region: body.region,
        cluster: body.cluster,
        installationLocation: body.installationLocation,
        latitude: toFloat(body.latitude),
        longitude: toFloat(body.longitude),
        voltage: body.voltage,
        loadCapacity: body.loadCapacity,
        ipRating: body.ipRating,
        operationHours: toInt(body.operationHours),
        lastActive: toDate(body.lastActive),
        installationDate: toDate(body.installationDate),
        lastMaintenance: toDate(body.lastMaintenance),
        gatewayId: toId(body.gatewayId),
        deviceModelId: toId(body.deviceModelId),
      },
    });
    return c.json(created, 201);
  } catch (err: any) {
    if (err.code === "P2002") {
      return c.json({ error: "transformerId already exists" }, 409);
    }
    if (err.code === "P2003") {
      return c.json(
        {
          error: "gatewayId or deviceModelId refers to a record that doesn't exist",
        },
        400,
      );
    }
    return c.json({ error: err.message }, 400);
  }
});

// PUT /transformers/:id — update transformer
transformer.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  try {
    const updated = await prisma.transformer.update({
      where: { id },
      data: {
        deviceId: body.deviceId,
        status: body.status,
        region: body.region,
        cluster: body.cluster,
        installationLocation: body.installationLocation,
        latitude: toFloat(body.latitude),
        longitude: toFloat(body.longitude),
        voltage: body.voltage,
        loadCapacity: body.loadCapacity,
        ipRating: body.ipRating,
        operationHours: toInt(body.operationHours),
        lastActive: toDate(body.lastActive),
        installationDate: toDate(body.installationDate),
        lastMaintenance: toDate(body.lastMaintenance),
        gatewayId: toId(body.gatewayId),
      },
    });
    return c.json(updated);
  } catch (err: any) {
    if (err.code === "P2025") {
      return c.json({ error: "Transformer not found" }, 404);
    }
    return c.json({ error: err.message }, 400);
  }
});

// PATCH /transformers/:id — partial update (optional, but handy for status toggles etc.)
transformer.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  try {
    const updated = await prisma.transformer.update({
      where: { id },
      data: body,
    });
    return c.json(updated);
  } catch (err: any) {
    if (err.code === "P2025") {
      return c.json({ error: "Transformer not found" }, 404);
    }
    return c.json({ error: err.message }, 400);
  }
});

// DELETE /transformers/:id — delete transformer
transformer.delete("/:id", async (c) => {
  const id = c.req.param("id");

  try {
    await prisma.transformer.delete({ where: { id } });
    return c.json({ message: "Transformer deleted" });
  } catch (err: any) {
    if (err.code === "P2025") {
      return c.json({ error: "Transformer not found" }, 404);
    }
    return c.json({ error: err.message }, 400);
  }
});

export default transformer;