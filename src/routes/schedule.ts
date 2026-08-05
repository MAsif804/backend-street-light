import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { buildPlan, expectedState, localMinutesNow } from "../lib/schedule-engine";

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

// ───────────────────────────────────────────────────────────────────────────
// The runner. Registered BEFORE "/:id" on purpose — otherwise "/schedules/run"
// is a candidate for the param route and resolves as a schedule id.
// ───────────────────────────────────────────────────────────────────────────

/**
 * POST|GET /schedules/run — evaluate every active schedule and reconcile
 * `Transformer.status` to match. This is what actually makes a schedule *do*
 * something; without it a saved schedule is inert data.
 *
 * Both verbs exist because Vercel Cron only issues GET.
 *
 * Reconciliation is state-based, not edge-based: every run asks "what should
 * this transformer be right now" rather than "did a boundary just pass". That
 * makes a missed run (cold start, outage, redeploy) self-healing — the next run
 * still puts the fleet right. The cost is that a manual dashboard toggle inside
 * a scheduled window is reverted on the next run; there is no override grace
 * period server-side (the firmware has one, via `overrideActive`).
 */
async function runSchedules(c: any) {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when the env var is
  // set. When it isn't (local dev), the endpoint is open — same as every other
  // device route here.
  const secret = process.env.CRON_SECRET;
  if (secret && c.req.header("authorization") !== `Bearer ${secret}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const now = new Date();
  const nowMinutes = localMinutesNow(now);

  const [schedules, transformers] = await Promise.all([
    prisma.schedule.findMany({ where: { isActive: true }, include: fullInclude }),
    prisma.transformer.findMany({
      select: { id: true, transformerId: true, status: true, gatewayId: true },
    }),
  ]);

  const plan = buildPlan(schedules, now);

  const toOn: typeof transformers = [];
  const toOff: typeof transformers = [];
  let governed = 0;

  for (const t of transformers) {
    const want = expectedState(t.id, plan, nowMinutes);
    if (want === null) continue; // nothing scheduled — leave the operator's value
    governed++;
    if (want === t.status) continue;
    (want === "ON" ? toOn : toOff).push(t);
  }

  if (toOn.length > 0) {
    await prisma.transformer.updateMany({
      where: { id: { in: toOn.map((t) => t.id) } },
      data: { status: "ON" },
    });
  }
  if (toOff.length > 0) {
    await prisma.transformer.updateMany({
      where: { id: { in: toOff.map((t) => t.id) } },
      data: { status: "OFF" },
    });
  }

  // Mirror each action into the owning gateway's terminal, so a schedule firing
  // is visible in the UI instead of being a silent status flip.
  const changed = [
    ...toOn.map((t) => ({ t, state: "ON" as const })),
    ...toOff.map((t) => ({ t, state: "OFF" as const })),
  ];
  const logs = changed
    .filter((x) => x.t.gatewayId)
    .map((x) => ({
      gatewayId: x.t.gatewayId as string,
      level: "INFO" as const,
      source: "SCHEDULER",
      message: `Schedule -> ${x.t.transformerId} ${x.state}`,
    }));
  if (logs.length > 0) {
    await prisma.gatewayLog.createMany({ data: logs });
  }

  return c.json({
    ranAt: now.toISOString(),
    localMinutes: nowMinutes,
    localTime: `${String(Math.floor(nowMinutes / 60)).padStart(2, "0")}:${String(nowMinutes % 60).padStart(2, "0")}`,
    activeSchedules: schedules.length,
    globalWindows: plan.global.length,
    scopedTransformers: plan.byTransformer.size,
    expiredConditions: plan.expired,
    unparseableTimePairs: plan.unparseable,
    governed,
    changed: changed.map((x) => ({ transformerId: x.t.transformerId, status: x.state })),
  });
}

schedule.post("/run", runSchedules);
schedule.get("/run", runSchedules);

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
