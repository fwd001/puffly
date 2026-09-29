/**
 * Calendar math without `Date` locale surprises: everything is derived from an
 * epoch millisecond timestamp plus a fixed UTC offset, so a stored session renders
 * identically on another machine (SPEC.md §71, §52).
 */

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

export interface ClockParts {
  hours: number;
  minutes: number;
  seconds: number;
}

export function clockParts(ms: number): ClockParts {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** `03:00` / `1:04:09` — digits only, language independent (§4, §31). */
export function formatClock(ms: number): string {
  const { hours, minutes, seconds } = clockParts(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

function localParts(timestamp: number, utcOffsetMinutes: number) {
  const shifted = timestamp + utcOffsetMinutes * MS_PER_MINUTE;
  const dayMs = ((shifted % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
  return {
    dayIndex: Math.floor(shifted / MS_PER_DAY),
    hour: Math.floor(dayMs / MS_PER_HOUR),
    minute: Math.floor((dayMs % MS_PER_HOUR) / MS_PER_MINUTE),
  };
}

/** Local hour of the wall clock, 0-23. */
export function hourOfTimestamp(timestamp: number, utcOffsetMinutes = 0): number {
  return localParts(timestamp, utcOffsetMinutes).hour;
}

/** Local calendar key, `YYYY-MM-DD`. */
export function dayKey(timestamp: number, utcOffsetMinutes = 0): string {
  const { dayIndex } = localParts(timestamp, utcOffsetMinutes);
  return shiftCivilDayIndex(dayIndex);
}

function shiftCivilDayIndex(dayIndex: number): string {
  const civil = civilFromDayIndex(dayIndex);
  const y = String(civil.year).padStart(4, '0');
  const m = String(civil.month).padStart(2, '0');
  const d = String(civil.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole local days between two timestamps (floor, so the same day is 0). */
export function daysBetween(from: number, to: number, utcOffsetMinutes = 0): number {
  return localParts(to, utcOffsetMinutes).dayIndex - localParts(from, utcOffsetMinutes).dayIndex;
}

/** Civil date from an epoch day index (Howard Hinnant's algorithm, UTC-based). */
export function civilFromDayIndex(zIn: number): { year: number; month: number; day: number } {
  const z = zIn + 719_468;
  const era = Math.floor((z >= 0 ? z : z - 146_096) / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { year: m <= 2 ? y + 1 : y, month: m, day: d };
}
