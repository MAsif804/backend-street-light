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

const LOG_LEVELS = ["INFO", "OK", "WARN", "ERROR"] as const;
type LogLevelValue = (typeof LOG_LEVELS)[number];

// Firmware writes lines like "[GATEWAY]" / "[TR1CNSTN]"; the UI adds the
// brackets itself, so strip them on the way in and keep the tag canonical.
const toSource = (v: unknown) => {
  const s = String(v ?? "").trim().replace(/^\[|\]$/g, "").trim();
  return s === "" ? "GATEWAY" : s.slice(0, 64).toUpperCase();
};

const toLevel = (v: unknown): LogLevelValue | undefined => {
  const s = String(v ?? "").trim().toUpperCase();
  return (LOG_LEVELS as readonly string[]).includes(s)
    ? (s as LogLevelValue)
    : undefined;
};

const gateway = new Hono();

/**
 * Resolve the `:id` path segment to a Gateway primary key.
 *
 * The dashboard holds the cuid, but the firmware only knows its configured
 * Sensor ID (`deviceId`, e.g. "GW1CNST"), so accept either and let the device
 * post logs without a boot-time lookup. Returns null when nothing matches.
 */
async function resolveGatewayId(idOrDeviceId: string): Promise<string | null> {
  const found = await prisma.gateway.findFirst({
    where: { OR: [{ id: idOrDeviceId }, { deviceId: idOrDeviceId }] },
    select: { id: true },
  });
  return found?.id ?? null;
}

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

// ───────────────────────────────────────────────────────────────────────────
// Gateway terminal logs — what the Inventory "Gateway Terminal" panel renders.
// The gateway firmware appends lines here; the dashboard polls them back.
// `:id` accepts either the cuid or the Sensor ID (deviceId).
// ───────────────────────────────────────────────────────────────────────────

// GET /gateways/:id/logs?limit=&afterSeq=&since=&level=
//   limit    — newest N lines (default 200, max 1000)
//   afterSeq — everything written after this `seq`; the terminal's poll cursor.
//              Exact and clock-independent, so polls never duplicate or skip.
//   since    — ISO timestamp lower bound (inclusive). A convenience time filter
//              ("last hour"), NOT a reliable poll cursor — use afterSeq for that.
//   level    — filter to a single severity (INFO | OK | WARN | ERROR)
// Always returned oldest-first so the terminal can append straight to the bottom.
gateway.get("/:id/logs", async (c) => {
  const gatewayId = await resolveGatewayId(c.req.param("id"));
  if (!gatewayId) {
    return c.json({ error: "Gateway not found" }, 404);
  }

  const limit = Math.min(Math.max(toInt(c.req.query("limit")) ?? 200, 1), 1000);
  const afterSeq = toInt(c.req.query("afterSeq"));
  const since = toDate(c.req.query("since"));
  const level = toLevel(c.req.query("level"));

  const rows = await prisma.gatewayLog.findMany({
    where: {
      gatewayId,
      ...(afterSeq !== undefined ? { seq: { gt: afterSeq } } : {}),
      ...(since ? { timestamp: { gte: since } } : {}),
      ...(level ? { level } : {}),
    },
    // Take the newest N — that's what a terminal shows — then flip to
    // chronological order below.
    orderBy: { seq: "desc" },
    take: limit,
  });

  return c.json(rows.reverse());
});

// POST /gateways/:id/logs — append one line or a batch.
//   single: { message, level?, source?, timestamp? }
//   batch:  { logs: [ { message, ... }, ... ] }  (max 200 per request)
// `timestamp` is the device clock; omit it and the server's receipt time is used
// (the gateway has no RTC until it syncs, see FIRMWARE_INTEGRATION_PLAN §4.8).
gateway.post("/:id/logs", async (c) => {
  const gatewayId = await resolveGatewayId(c.req.param("id"));
  if (!gatewayId) {
    return c.json({ error: "Gateway not found" }, 404);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body must be JSON" }, 400);
  }

  const incoming = Array.isArray(body)
    ? body
    : Array.isArray(body?.logs)
      ? body.logs
      : [body];

  if (incoming.length === 0) {
    return c.json({ error: "No log lines in request" }, 400);
  }
  if (incoming.length > 200) {
    return c.json({ error: "At most 200 log lines per request" }, 400);
  }

  const data = [];
  for (const entry of incoming) {
    const message = typeof entry?.message === "string" ? entry.message.trim() : "";
    if (!message) {
      return c.json({ error: "message is required on every log line" }, 400);
    }
    data.push({
      gatewayId,
      message: message.slice(0, 1000),
      level: toLevel(entry?.level) ?? "INFO",
      source: toSource(entry?.source),
      timestamp: toDate(entry?.timestamp),
    });
  }

  try {
    const result = await prisma.gatewayLog.createMany({ data });
    return c.json({ created: result.count }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// DELETE /gateways/:id/logs?before=<iso> — clear the terminal, or prune old
// lines (retention). Without `before` every line for the gateway is removed.
gateway.delete("/:id/logs", async (c) => {
  const gatewayId = await resolveGatewayId(c.req.param("id"));
  if (!gatewayId) {
    return c.json({ error: "Gateway not found" }, 404);
  }

  const before = toDate(c.req.query("before"));
  const result = await prisma.gatewayLog.deleteMany({
    where: { gatewayId, ...(before ? { timestamp: { lt: before } } : {}) },
  });

  return c.json({ deleted: result.count });
});

export default gateway;
