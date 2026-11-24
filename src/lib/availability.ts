export interface Booking {
  id: string;
  title: string;
  start: number; // minutes after midnight
  end: number; // minutes after midnight
  organizer: string;
}

export interface Room {
  id: string;
  name: string;
  building: string;
  capacity: number;
  blocked: boolean;
  blockReason?: string;
  bookings: Booking[];
}

export interface CheckInput {
  currentTime: number;
  start: number;
  end: number;
}

export type Decision = 'available' | 'unavailable';

export interface CheckResult {
  decision: Decision;
  reasons: string[];
}

export const MINUTES_PER_DAY = 1440;
export const MAX_DURATION = 120;

/** Format minutes-after-midnight as HH:MM. */
export function fmtTime(m: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(m)));
  const h = Math.floor(clamped / 60) % 24;
  const min = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Parse an HH:MM string into minutes after midnight. */
export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const min = Number(match[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes for an HH:MM input value; unreadable input reads as 00:00. */
export function timeInputToMinutes(value: string): number {
  return parseTime(value) ?? 0;
}

/** Length of an interval in minutes, or 0 when it is not a forward interval. */
export function requestedDuration(start: number, end: number): number {
  return start < end ? end - start : 0;
}

/** True when 0 <= start < end <= 24:00. */
function isWellFormed(start: number, end: number): boolean {
  return 0 <= start && start < end && end <= MINUTES_PER_DAY;
}

/* ---------- Layer 1: validation (AC1, AC2, AC6 messages) ---------- */

/** Validate the requested interval. Returns user-readable messages; empty = valid. */
export function validateInput(input: CheckInput): string[] {
  const reasons: string[] = [];
  const { currentTime, start, end } = input;

  // AC1 — interval bounds and ordering.
  if (!isWellFormed(start, end)) {
    if (start < 0) reasons.push('Start time cannot be before 00:00.');
    if (end > MINUTES_PER_DAY) reasons.push('End time cannot be after 24:00.');
    if (start >= end) {
      if (start >= 0 && end <= MINUTES_PER_DAY && end === 0 && start > 0) {
        reasons.push(
          'End is 12:00 AM, which is read as 00:00 (start of day), so it comes before your start time. The end time must be before 12:00 AM — use an earlier time, such as 11:59 PM.'
        );
      } else {
        reasons.push('Start time must be earlier than end time.');
      }
    }
  } else if (!(start > currentTime)) {
    // AC1 — start must be strictly after current time.
    reasons.push('Start time must be strictly after the current time.');
  }

  // AC2 — duration cap (only meaningful for a valid ordering).
  if (isWellFormed(start, end)) {
    const duration = requestedDuration(start, end);
    if (duration > MAX_DURATION) {
      reasons.push(
        `Requested duration is ${duration} min; the maximum allowed is ${MAX_DURATION} min.`
      );
    }
  }

  return reasons;
}

/* ---------- Layer 2: availability calculation (AC3, AC4) ---------- */

/** Blocked room rejects everything. Empty array = room is open. */
export function blockedReasons(room: Room): string[] {
  return room.blocked
    ? [`Room is blocked${room.blockReason ? ` — ${room.blockReason}` : ''}; no bookings can be checked.`]
    : [];
}

/** Bookings that overlap the interval (touching endpoints allowed). Never mutates. */
export function findOverlaps(room: Room, start: number, end: number): Booking[] {
  return room.bookings.filter((b) => b.start < end && start < b.end);
}

function overlapReasons(room: Room, start: number, end: number): string[] {
  const overlaps = findOverlaps(room, start, end);
  if (overlaps.length === 0) return [];
  const list = overlaps.map((b) => `${fmtTime(b.start)}–${fmtTime(b.end)}`).join(', ');
  return [
    overlaps.length > 1
      ? `Overlaps with existing bookings: ${list}.`
      : `Overlaps with existing booking: ${list}.`,
  ];
}

/* ---------- Public entry point: combines the layers ---------- */

/**
 * Evaluate a candidate interval against the acceptance criteria.
 * Pure function: never mutates room or its bookings (AC5).
 */
export function checkAvailability(room: Room, input: CheckInput): CheckResult {
  const { start, end } = input;
  const reasons = [
    ...blockedReasons(room),
    ...validateInput(input),
    ...(isWellFormed(start, end) && !room.blocked ? overlapReasons(room, start, end) : []),
  ];
  return {
    decision: reasons.length === 0 ? 'available' : 'unavailable',
    reasons,
  };
}