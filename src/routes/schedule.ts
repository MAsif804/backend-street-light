import { Hono } from "hono";
import { prisma } from "../lib/prisma";

// Requests (from forms / Postman) often send everything as strings. Coerce.
const toInt = (v: unknown, d = 0) => {
  if (v === undefined || v === null || v === "") return d;
  const n = Number(v);
  return Number.isNaN(n) ? d : Math.trunc(n);
};
const toBool = (v: unknown, d: boolean | undefined) => {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return d;
};
const asActionType = (v: unknown) => (v === "OFF" ? "OFF" : "ON");

// A Schedule always comes back with its conditions (+ time pairs) and linked
// transformers, ordered deterministically.
const fullInclude = {
  conditions: {
    orderBy: { createdAt: "asc" as const },
    include: { timePairs: { orderBy: { sortOrder: "asc" as const } } },
  },
  transformers: true,
};

// Turn a request's `conditions` array into a Prisma nested-create payload
// (each condition creates its own time pairs). Returns undefined when the
// caller didn't send a conditions array, so updates can skip replacing them.
function buildConditionsCreate(conditions: unknown) {
  if (!Array.isArray(conditions)) return undefined;
  return conditions.map((cond: any) => ({
    type: asActionType(cond?.type),
    years: toInt(cond?.years),
    months: toInt(cond?.months),
    days: toInt(cond?.days),
    hours: toInt(cond?.hours),
    minutes: toInt(cond?.minutes),
    timePairs: {
      create: Array.isArray(cond?.timePairs)
        ? cond.timePairs.map((tp: any, i: number) => ({
            onTime: String(tp?.onTime ?? ""),
            onPeriod: String(tp?.onPeriod ?? "AM"),
            offTime: String(tp?.offTime ?? ""),
            offPeriod: String(tp?.offPeriod ?? "AM"),
            sortOrder: toInt(tp?.sortOrder, i),
          }))
        : [],
    },
  }));
}

const idList = (v: unknown) =>
  Array.isArray(v) ? (v.filter(Boolean) as string[]) : undefined;

const schedule = new Hono();

// GET /schedules — list all schedules (with conditions, time pairs, transformers)
schedule.get("/", async (c) => {
  const schedules = await prisma.schedule.findMany({
    include: fullInclude,
    orderBy: { createdAt: "desc" },
  });
  return c.json(schedules);
});

// GET /schedules/:id — one schedule with everything
schedule.get("/:id", async (c) => {
  const id = c.req.param("id");
  const found = await prisma.schedule.findUnique({ where: { id }, include: fullInclude });
  if (!found) return c.json({ error: "Schedule not found" }, 404);
  return c.json(found);
});

// POST /schedules — create a schedule with its conditions/time pairs, and
// optionally link transformers by PK (body.transformerIds: string[]).
schedule.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: "name is required" }, 400);

  const transformerIds = idList(body.transformerIds) ?? [];
  try {
    const created = await prisma.schedule.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        isActive: toBool(body.isActive, true),
        conditions: { create: buildConditionsCreate(body.conditions) ?? [] },
        transformers: { connect: transformerIds.map((id) => ({ id })) },
      },
      include: fullInclude,
    });
    return c.json(created, 201);
  } catch (err: any) {
    if (err.code === "P2025")
      return c.json({ error: "One or more transformerIds refer to a record that doesn't exist" }, 400);
    return c.json({ error: err.message }, 400);
  }
});

// PUT /schedules/:id — full update. Replaces conditions and transformer links
// only when those arrays are supplied.
schedule.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();

  const conditionsCreate = buildConditionsCreate(body.conditions);
  const transformerIds = idList(body.transformerIds);

  try {
    const updated = await prisma.schedule.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        isActive: toBool(body.isActive, undefined),
        // Replace all conditions (cascade-deletes their time pairs) then recreate.
        ...(conditionsCreate ? { conditions: { deleteMany: {}, create: conditionsCreate } } : {}),
        // Replace the m-n transformer links.
        ...(transformerIds ? { transformers: { set: transformerIds.map((tid) => ({ id: tid })) } } : {}),
      },
      include: fullInclude,
    });
    return c.json(updated);
  } catch (err: any) {
    if (err.code === "P2025") return c.json({ error: "Schedule not found" }, 404);
    return c.json({ error: err.message }, 400);
  }
});

// PATCH /schedules/:id — partial scalar update (name/description/isActive) and
// optionally re-set transformer links. Does not touch conditions.
schedule.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const transformerIds = idList(body.transformerIds);

  try {
    const updated = await prisma.schedule.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        isActive: toBool(body.isActive, undefined),
        ...(transformerIds ? { transformers: { set: transformerIds.map((tid) => ({ id: tid })) } } : {}),
      },
      include: fullInclude,
    });
    return c.json(updated);
  } catch (err: any) {
    if (err.code === "P2025") return c.json({ error: "Schedule not found" }, 404);
    return c.json({ error: err.message }, 400);
  }
});

// DELETE /schedules/:id — cascade-deletes its conditions + time pairs, and
// clears the transformer links (join rows only; transformers are untouched).
schedule.delete("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    await prisma.schedule.delete({ where: { id } });
    return c.json({ message: "Schedule deleted" });
  } catch (err: any) {
    if (err.code === "P2025") return c.json({ error: "Schedule not found" }, 404);
    return c.json({ error: err.message }, 400);
  }
});

export default schedule;
