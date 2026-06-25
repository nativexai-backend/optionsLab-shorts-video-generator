// Minimal timezone helpers for the posting-time planner. We only need two
// zones, but everything goes through the IANA database via Intl so DST is
// handled correctly (Eastern flips EST/EDT; WAT never does).

export const ZONES = {
  WAT: { id: "Africa/Lagos", label: "WAT" },
  ET: { id: "America/New_York", label: "ET" },
} as const;

export type ZoneKey = keyof typeof ZONES;

function partsToMap(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return m;
}

// Offset (minutes) of a zone at a given instant — positive = ahead of UTC.
export function offsetMinutes(date: Date, tzId: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tzId,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const m = partsToMap(dtf.formatToParts(date));
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

// The calendar day a given instant falls on, in a zone.
export function zonedYMD(date: Date, tzId: string): { y: number; mo: number; d: number } {
  const m = partsToMap(
    new Intl.DateTimeFormat("en-US", { timeZone: tzId, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date)
  );
  return { y: +m.year, mo: +m.month - 1, d: +m.day };
}

// Build the absolute instant whose wall clock, in tzId, reads hh:mm on y/mo/d.
export function zonedWallToInstant(y: number, mo: number, d: number, hh: number, mm: number, tzId: string): Date {
  const guess = new Date(Date.UTC(y, mo, d, hh, mm));
  const off = offsetMinutes(guess, tzId);
  return new Date(guess.getTime() - off * 60000);
}

// Replace just the time-of-day of an instant, interpreted in tzId.
export function setWallTime(instant: Date, hh: number, mm: number, tzId: string): Date {
  const { y, mo, d } = zonedYMD(instant, tzId);
  return zonedWallToInstant(y, mo, d, hh, mm, tzId);
}

// "5:30 PM" style label in a zone.
export function formatTime(date: Date, tzId: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tzId, hour: "numeric", minute: "2-digit", hour12: true }).format(date);
}

// "17:30" 24h value for <input type="time"> in a zone.
export function wallHHMM(date: Date, tzId: string): string {
  const m = partsToMap(
    new Intl.DateTimeFormat("en-US", { timeZone: tzId, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date)
  );
  return `${m.hour}:${m.minute}`;
}
