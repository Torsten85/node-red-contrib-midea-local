import { AC_CAPABILITY, type AirConditioner } from "midea-local";

const flags: Record<string, number> = Object.fromEntries(
  Object.entries(AC_CAPABILITY).map(([name, flag]) => [name.toLowerCase(), flag]),
);

/** Explicit booleans override only named flags; omitted capabilities stay detected. */
export function applyCapabilityOverrides(device: AirConditioner, json?: string): void {
  if (!json?.trim()) return;
  let overrides: unknown;
  try {
    overrides = JSON.parse(json);
  } catch {
    throw new Error("Capability overrides must be valid JSON");
  }
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    throw new Error("Capability overrides must be an object of capability names and booleans");
  }
  const entries = Object.entries(overrides);
  // Validate every entry before updating the device.
  for (const [name, enabled] of entries) {
    if (!Object.hasOwn(flags, name)) throw new Error(`Unknown capability override: ${name}`);
    if (typeof enabled !== "boolean") throw new Error(`Capability override ${name} must be true or false`);
  }
  if (entries.length === 0) return;
  let mask = device.capabilitiesDict().additional_capabilities as number;
  for (const [name, enabled] of entries) {
    mask = enabled ? mask | flags[name]! : mask & ~flags[name]!;
  }
  // The library rebuilds its supported property queries after this call.
  device.overrideCapabilities({ additional_capabilities: mask });
}
