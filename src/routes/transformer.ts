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

// ───────────────────────────────────────────────────────────────────────────
// POST /transformers/telemetry — LoRa uplinks, pushed by a gateway.
//
// Body: { readings: [ { id, relay, fault, temp } ] }  (or a bare array)
//   id    — the 4-digit LoRa radio address from the uplink frame `{IIII-R-F}`,
//           matched against `deviceId` first, then the tail of `transformerId`
//           (the same derivation the gateway's registry uses to address units).
//   relay — 0 | 1, the ACTUAL relay position
//   fault — 0 healthy · 1 one lamp out · 2 both lamps out · 3 sensor fault
//   temp  — °C from the DS18B20 probe. THREE-STATE, matching what the gateway
//           sends: key absent = leave the stored value alone (an older gateway
//           build that predates the probe); explicit null = this unit reports no
//           temperature, so clear it; a number = store it. Omitting the key and
//           sending null must stay distinct, or a probe that comes off freezes
//           its last reading in the database for good.
//
// This writes `reportedStatus`, NEVER `status`. `status` is the desired state
// and belongs to the control plane (dashboard + schedule runner); letting a
// device write it recreates the feedback loop the split exists to prevent.
//
// Registered before "/:id" so the literal path can't resolve as an id.
// ───────────────────────────────────────────────────────────────────────────
transformer.post("/telemetry", async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body must be JSON" }, 400);
  }

  const readings = Array.isArray(body)
    ? body
    : Array.isArray(body?.readings)
      ? body.readings
      : [body];

  if (readings.length === 0) return c.json({ error: "No readings in request" }, 400);
  if (readings.length > 200) {
    return c.json({ error: "At most 200 readings per request" }, 400);
  }

  // One read of the fleet, then match in memory — a batch of 200 uplinks must
  // not become 200 lookups.
  const all = await prisma.transformer.findMany({
    select: { id: true, deviceId: true, transformerId: true },
  });

  // Radio address derivation, mirroring Device_Registry.ino: `deviceId` as 4
  // digits wins; otherwise the last 4 digits of `transformerId`.
  const digits4 = (v: string | null) => {
    const d = String(v ?? "").replace(/\D/g, "");
    return d.length >= 4 ? d.slice(-4) : d.padStart(4, "0");
  };
  const byAddr = new Map<string, string>();
  for (const t of all) {
    const fromDevice = String(t.deviceId ?? "").replace(/\D/g, "");
    const addr = fromDevice.length > 0 ? digits4(t.deviceId) : digits4(t.transformerId);
    if (addr && addr !== "0000" && !byAddr.has(addr)) byAddr.set(addr, t.id);
  }

  const now = new Date();
  const applied: { address: string; relay: number; fault: number; temp?: number | null }[] = [];
  const unknown: string[] = [];
  // Readings sharing an identical value set can go out in one UPDATE, so a batch
  // costs at most a couple of statements instead of one per frame. Temperature
  // is part of the key — two units are rarely at the same reading to a tenth of
  // a degree, so in practice this now groups mostly by relay/fault among the
  // units with no probe, and runs one statement each for the rest. At
  // ACTIVITY_MAX_PER_CYCLE (40) per push that is a handful of statements, not a
  // reason to give up batching.
  const groups = new Map<string, string[]>();

  // `undefined` = key absent, leave the column alone. `null` = clear it.
  const parseTemp = (raw: unknown): number | null | undefined => {
    if (raw === undefined) return undefined;
    if (raw === null || raw === "") return null;
    const n = Number(raw);
    // Out-of-range or unparseable is treated as "no reading" rather than
    // rejecting the whole frame — the relay and fault half still matters.
    if (!Number.isFinite(n) || n < -55 || n > 125) return null;
    return Math.round(n * 10) / 10;
  };

  for (const r of readings) {
    const address = digits4(String(r?.id ?? r?.address ?? ""));
    const pk = byAddr.get(address);
    if (!pk) {
      unknown.push(address);
      continue;
    }

    const relay = toInt(r?.relay);
    const fault = toInt(r?.fault) ?? 0;
    if (relay !== 0 && relay !== 1) continue; // malformed frame — drop it
    if (fault < 0 || fault > 9) continue;

    // Key PRESENCE, not `??`. `r.temp ?? r.temperature` collapses an explicit
    // null into undefined, which would silently turn "this unit has no probe"
    // back into "leave the column alone" — the stale-reading bug this whole
    // three-state contract exists to avoid.
    const obj = r !== null && typeof r === "object" ? (r as Record<string, unknown>) : {};
    const rawTemp = "temp" in obj ? obj.temp : "temperature" in obj ? obj.temperature : undefined;
    const temp = parseTemp(rawTemp);

    const key = `${relay}:${fault}:${temp === undefined ? "skip" : temp}`;
    const list = groups.get(key) ?? [];
    list.push(pk);
    groups.set(key, list);
    applied.push({ address, relay, fault, ...(temp === undefined ? {} : { temp }) });
  }

  for (const [key, ids] of groups) {
    const [relayRaw, faultRaw, tempRaw] = key.split(":");
    const relay = Number(relayRaw);
    const fault = Number(faultRaw);

    await prisma.transformer.updateMany({
      where: { id: { in: ids } },
      data: {
        reportedStatus: relay === 1 ? "ON" : "OFF",
        faultCode: fault,
        lastReportAt: now,
        lastActive: now,
        // Absent from the payload → not in the `data` object at all, so Prisma
        // leaves the stored value as it is.
        ...(tempRaw === "skip"
          ? {}
          : { temperature: tempRaw === "null" ? null : Number(tempRaw) }),
      },
    });
  }

  return c.json({ applied: applied.length, unknown, readings: applied });
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