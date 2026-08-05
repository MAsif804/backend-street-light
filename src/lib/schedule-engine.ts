// Schedule evaluation — a faithful port of ESP32_Gateway/Schedule_Engine.ino.
//
// The gateway firmware and this module MUST agree: when a gateway is in the
// field both are deciding the same transformer's state, and any divergence
// shows up as a relay flapping once a minute. Every rule below mirrors a
// specific piece of that sketch, noted inline. Change one, change both.

/** Minutes-of-day sentinel for "unset / unparseable". Mirrors `MIN_UNSET`. */
export const MIN_UNSET = 65535;

/**
 * Local wall-clock offset for the times stored on TimePair. PKT = UTC+5, which
 * is `TZ_OFFSET_SECONDS` in the firmware's Config.h. Serverless runs in UTC, so
 * this has to be applied explicitly; override it if the fleet ever moves.
 */
export const TZ_OFFSET_MINUTES = Number(
  process.env.SCHEDULE_TZ_OFFSET_MINUTES ?? 5 * 60,
);

/** Minutes since local midnight for an instant. */
export function localMinutesNow(now: Date): number {
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return ((utcMinutes + TZ_OFFSET_MINUTES) % 1440 + 1440) % 1440;
}

/**
 * "05 : 22" + "PM" → minutes since midnight. Mirrors `to24hMinutes`.
 *
 * The UI writes times with spaces around the colon (`"05 : 22"`), so the regex
 * tolerates them — the firmware's `sscanf("%d:%d")` does NOT, which is a live
 * bug on that side, fixed separately.
 */
export function to24hMinutes(hhmm: unknown, period: unknown): number {
  const match = String(hhmm ?? "").match(/^\s*(\d{1,2})\s*:\s*(\d{1,2})\s*$/);
  if (!match) return MIN_UNSET;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return MIN_UNSET;

  // Only reinterpret an hour that could be 12-hour clock; 13-23 is already 24h.
  const p = String(period ?? "").trim().toUpperCase();
  if (hour <= 12) {
    if (p.startsWith("P") && hour < 12) hour += 12;
    else if (p.startsWith("A") && hour === 12) hour = 0;
  }
  if (hour > 23) return MIN_UNSET;
  return hour * 60 + minute;
}

/** Is `cur` inside [on, off)? Wraps past midnight when on > off. Mirrors `inWindow`. */
export function inWindow(cur: number, on: number, off: number): boolean {
  if (on === MIN_UNSET || off === MIN_UNSET || on === off) return false;
  if (on < off) return cur >= on && cur < off; // 06:30 → 18:00
  return cur >= on || cur < off; //               18:30 → 05:00
}

export interface Window {
  onMin: number;
  offMin: number;
}

export interface SchedulePlan {
  /** Windows that apply to every transformer (schedules with no links). */
  global: Window[];
  /** Windows scoped to one transformer PK. */
  byTransformer: Map<string, Window[]>;
  /** Conditions dropped because their fixed-duration validity has elapsed. */
  expired: number;
  /** Time pairs dropped because a time wouldn't parse. */
  unparseable: number;
}

// Fixed-duration validity, approximated exactly as the firmware does — 30-day
// months and 365-day years. Not calendar-accurate, but it must not be, or the
// two sides expire a schedule on different days.
const SECONDS = { minutes: 60, hours: 3600, days: 86400, months: 2592000, years: 31536000 };

interface ScheduleLike {
  isActive: boolean;
  createdAt: Date;
  conditions: {
    type: string;
    years: number;
    months: number;
    days: number;
    hours: number;
    minutes: number;
    timePairs: { onTime: string; onPeriod: string; offTime: string; offPeriod: string }[];
  }[];
  transformers: { id: string }[];
}

/**
 * Turn the stored schedules into the set of lamps-ON windows in force right now.
 * Mirrors the `fetchSchedules()` build loop in Api_Client.ino.
 */
export function buildPlan(schedules: ScheduleLike[], now: Date): SchedulePlan {
  const plan: SchedulePlan = {
    global: [],
    byTransformer: new Map(),
    expired: 0,
    unparseable: 0,
  };

  for (const schedule of schedules) {
    if (!schedule.isActive) continue;

    // A schedule with no linked transformers is GLOBAL — it governs the whole
    // fleet. This is the firmware's `isGlobal` rule, and it is easy to trip
    // over: saving a schedule without linking anything drives every unit.
    const linked = schedule.transformers ?? [];
    const isGlobal = linked.length === 0;

    for (const cond of schedule.conditions ?? []) {
      const durationSec =
        (cond.minutes || 0) * SECONDS.minutes +
        (cond.hours || 0) * SECONDS.hours +
        (cond.days || 0) * SECONDS.days +
        (cond.months || 0) * SECONDS.months +
        (cond.years || 0) * SECONDS.years;

      // Validity is measured from the SCHEDULE's createdAt, not the condition's
      // — a PUT deletes and recreates conditions, which would otherwise reset
      // the clock on every edit.
      if (durationSec > 0) {
        const expiresAt = schedule.createdAt.getTime() + durationSec * 1000;
        if (now.getTime() > expiresAt) {
          plan.expired++;
          continue;
        }
      }

      // A condition of type OFF describes lamps-OFF periods, so its pair is
      // stored inverted and swapped back into a lamps-ON window here.
      const invert = String(cond.type).toUpperCase() === "OFF";

      for (const tp of cond.timePairs ?? []) {
        let onMin = to24hMinutes(tp.onTime, tp.onPeriod);
        let offMin = to24hMinutes(tp.offTime, tp.offPeriod);
        if (onMin === MIN_UNSET || offMin === MIN_UNSET) {
          plan.unparseable++;
          continue;
        }
        if (invert) [onMin, offMin] = [offMin, onMin];
        if (onMin === offMin) continue; // zero-length window commands nothing

        if (isGlobal) {
          plan.global.push({ onMin, offMin });
        } else {
          for (const t of linked) {
            const list = plan.byTransformer.get(t.id) ?? [];
            list.push({ onMin, offMin });
            plan.byTransformer.set(t.id, list);
          }
        }
      }
    }
  }

  return plan;
}

/**
 * What state should this transformer be in? `null` = no schedule applies, so
 * leave it alone (the dashboard's desired state governs).
 *
 * Mirrors `scheduleExpectedState`: a transformer with its own windows uses ONLY
 * those; the global windows are a fallback for units nothing targets directly.
 */
export function expectedState(
  transformerId: string,
  plan: SchedulePlan,
  nowMinutes: number,
): "ON" | "OFF" | null {
  const own = plan.byTransformer.get(transformerId);
  const windows = own && own.length > 0 ? own : plan.global;
  if (windows.length === 0) return null;
  return windows.some((w) => inWindow(nowMinutes, w.onMin, w.offMin)) ? "ON" : "OFF";
}
