/**
 * Bidirectional enum maps between friendly string names and midea-local
 * numeric constants for AC devices.
 *
 * @module
 */

import {
  FAN_SPEED,
  OPERATIONAL_MODE,
  SWING_MODE,
  SWING_ANGLE, CASCADE_MODE, RATE_SELECT, AUX_HEAT_MODE,
} from "midea-local";

// ── Forward maps (string → number) ──────────────────────────────────────────

export const OPERATIONAL_MODE_MAP: Record<string, number> = {
  auto: OPERATIONAL_MODE.AUTO,
  cool: OPERATIONAL_MODE.COOL,
  dry: OPERATIONAL_MODE.DRY,
  heat: OPERATIONAL_MODE.HEAT,
  fan_only: OPERATIONAL_MODE.FAN_ONLY,
  smart_dry: OPERATIONAL_MODE.SMART_DRY,
};

export const FAN_SPEED_MAP: Record<string, number> = {
  auto: FAN_SPEED.AUTO,
  max: FAN_SPEED.MAX,
  high: FAN_SPEED.HIGH,
  medium: FAN_SPEED.MEDIUM,
  low: FAN_SPEED.LOW,
  silent: FAN_SPEED.SILENT,
};

export const SWING_MODE_MAP: Record<string, number> = {
  off: SWING_MODE.OFF,
  vertical: SWING_MODE.VERTICAL,
  horizontal: SWING_MODE.HORIZONTAL,
  both: SWING_MODE.BOTH,
};

// ── Reverse maps (number → string) ─────────────────────────────────────────

function invert(map: Record<string, number>): Record<number, string> {
  return Object.fromEntries(
    Object.entries(map).map(([k, v]) => [v, k]),
  );
}

export const REVERSE_OPERATIONAL_MODE = invert(OPERATIONAL_MODE_MAP);
export const REVERSE_FAN_SPEED = invert(FAN_SPEED_MAP);
export const REVERSE_SWING_MODE = invert(SWING_MODE_MAP);

// ── Resolution helpers ──────────────────────────────────────────────────────

/**
 * Resolve a string or numeric value against a forward map.
 *
 * - If `value` is a string, looks it up (case-insensitive) in `map`.
 * - If `value` is a number, returns it directly.
 * - Returns `undefined` if the string key is not found.
 */
export function resolveEnum(
  value: string | number,
  map: Record<string, number>,
): number | undefined {
  if (typeof value === "number") return value;
  return typeof value === "string" ? map[value.toLowerCase()] : undefined;
}

export const SWING_ANGLE_MAP: Record<string, number> = Object.fromEntries(Object.entries(SWING_ANGLE).map(([k, v]) => [k.toLowerCase(), v]));
export const CASCADE_MODE_MAP: Record<string, number> = Object.fromEntries(Object.entries(CASCADE_MODE).map(([k, v]) => [k.toLowerCase(), v]));
export const RATE_SELECT_MAP: Record<string, number> = Object.fromEntries(Object.entries(RATE_SELECT).map(([k, v]) => [k.toLowerCase(), v]));
export const AUX_MODE_MAP: Record<string, number> = Object.fromEntries(Object.entries(AUX_HEAT_MODE).map(([k, v]) => [k.toLowerCase(), v]));
