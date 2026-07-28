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

// A Light hangs off a single Transformer. The Add Device form sends the
// transformer's business key ("transformerId", e.g. "TR1CNSTN"), but the FK
// stores the Transformer's primary key. Accept either and resolve to the PK;
// if it matches nothing, link nothing rather than failing the whole create.
async function resolveTransformerId(v: unknown): Promise<string | undefined> {
  const raw = toId(v);
  if (!raw) return undefined;
  const byPk = await prisma.transformer.findUnique({ where: { id: raw } });
  if (byPk) return byPk.id;
  const byKey = await prisma.transformer.findUnique({
    where: { transformerId: raw },
  });
  return byKey?.id;
}

const light = new Hono();

// GET /lights — list all lights
light.get("/", async (c) => {
  const lights = await prisma.light.findMany({
    include: {
      transformer: true,
      deviceModel: true,
    },
  });
  return c.json(lights);
});

// GET /lights/:id — get single light
light.get("/:id", async (c) => {
  const id = c.req.param("id");

  const found = await prisma.light.findUnique({
    where: { id },
    include: {
      transformer: true,
      deviceModel: true,
    },
  });

  if (!found) {
    return c.json({ error: "Light not found" }, 404);
  }
  return c.json(found);
});

// POST /lights — create light (Add Device form)
light.post("/", async (c) => {
  const body = await c.req.json();

  // The form labels these "Device Id" / "Device Name".
  const lightId = body.lightId ?? body.deviceId;
  const name = body.name ?? body.deviceName;

  if (!lightId) {
    return c.json({ error: "lightId (Device Id) is required" }, 400);
  }
  if (!name) {
    return c.json({ error: "name (Device Name) is required" }, 400);
  }

  try {
    const created = await prisma.light.create({
      data: {
        lightId,
        name,
        status: body.status ?? "OFF",
        region: body.region,
        cluster: body.cluster,
        // The form's "Installation Location" free text lands in `street`.
        street: body.street ?? body.installationLocation,
        latitude: toFloat(body.latitude),
        longitude: toFloat(body.longitude),
        voltage: body.voltage,
        powerRating: body.powerRating,
        ipRating: body.ipRating,
        requiredCurrent: body.requiredCurrent,
        requiredCurrentVariation: body.requiredCurrentVariation,
        operationHours: toInt(body.operationHours),
        current: body.current,
        lastActive: toDate(body.lastActive),
        installationDate: toDate(body.installationDate),
        lastMaintenance: toDate(body.lastMaintenance),
        transformerId: await resolveTransformerId(body.transformerId),
        deviceModelId: toId(body.deviceModelId),
      },
    });
    return c.json(created, 201);
  } catch (err: any) {
    if (err.code === "P2002") {
      return c.json({ error: "lightId already exists" }, 409);
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

// PUT /lights/:id — update light
light.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  try {
    const updated = await prisma.light.update({
      where: { id },
      data: {
        lightId: body.lightId,
        name: body.name,
        status: body.status,
        region: body.region,
        cluster: body.cluster,
        street: body.street ?? body.installationLocation,
        latitude: toFloat(body.latitude),
        longitude: toFloat(body.longitude),
        voltage: body.voltage,
        powerRating: body.powerRating,
        ipRating: body.ipRating,
        requiredCurrent: body.requiredCurrent,
        requiredCurrentVariation: body.requiredCurrentVariation,
        operationHours: toInt(body.operationHours),
        current: body.current,
        lastActive: toDate(body.lastActive),
        installationDate: toDate(body.installationDate),
        lastMaintenance: toDate(body.lastMaintenance),
        transformerId: await resolveTransformerId(body.transformerId),
        deviceModelId: toId(body.deviceModelId),
      },
    });
    return c.json(updated);
  } catch (err: any) {
    if (err.code === "P2025") {
      return c.json({ error: "Light not found" }, 404);
    }
    if (err.code === "P2002") {
      return c.json({ error: "lightId already exists" }, 409);
    }
    return c.json({ error: err.message }, 400);
  }
});

// PATCH /lights/:id — partial update (pass-through; send only valid fields)
light.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  try {
    const updated = await prisma.light.update({
      where: { id },
      data: body,
    });
    return c.json(updated);
  } catch (err: any) {
    if (err.code === "P2025") {
      return c.json({ error: "Light not found" }, 404);
    }
    return c.json({ error: err.message }, 400);
  }
});

// DELETE /lights/:id — delete light
light.delete("/:id", async (c) => {
  const id = c.req.param("id");

  try {
    await prisma.light.delete({ where: { id } });
    return c.json({ message: "Light deleted" });
  } catch (err: any) {
    if (err.code === "P2025") {
      return c.json({ error: "Light not found" }, 404);
    }
    return c.json({ error: err.message }, 400);
  }
});

export default light;
