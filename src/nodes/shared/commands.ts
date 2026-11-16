import type { AirConditioner } from "midea-local";
import type { MideaCommandPayload } from "./types.ts";
import { OPERATIONAL_MODE_MAP, FAN_SPEED_MAP, SWING_MODE_MAP, SWING_ANGLE_MAP,
  CASCADE_MODE_MAP, RATE_SELECT_MAP, AUX_MODE_MAP, resolveEnum } from "./enum-maps.ts";

const booleanProperties = {
  powerState: "powerState", turboMode: "turbo", ecoMode: "eco", sleepMode: "sleep",
  fahrenheit: "fahrenheit", beep: "beep", freezeProtection: "freezeProtection",
  followMe: "followMe", purifier: "purifier", ieco: "ieco", flashCool: "flashCool",
  outSilent: "outSilent", breezeAway: "breezeAway", breezeMild: "breezeMild", breezeless: "breezeless",
} as const;
const enumProperties = {
  operationalMode: OPERATIONAL_MODE_MAP, fanSpeed: FAN_SPEED_MAP, swingMode: SWING_MODE_MAP,
  horizontalSwingAngle: SWING_ANGLE_MAP, verticalSwingAngle: SWING_ANGLE_MAP,
  cascadeMode: CASCADE_MODE_MAP, rateSelect: RATE_SELECT_MAP, auxMode: AUX_MODE_MAP,
} as const;

/** Validate the complete payload before changing cached state or sending commands. */
export async function applyCommand(device: AirConditioner, cmd: MideaCommandPayload): Promise<void> {
  if (!cmd || typeof cmd !== "object" || Array.isArray(cmd)) {
    throw new Error("msg.payload must be an object with device properties");
  }
  const changes: Record<string, number | boolean> = {};
  for (const [key, property] of Object.entries(booleanProperties)) {
    const value = cmd[key as keyof MideaCommandPayload];
    if (value === undefined) continue;
    if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`);
    changes[property] = value;
  }
  for (const key of ["displayOn", "startSelfClean"] as const) {
    if (cmd[key] !== undefined && typeof cmd[key] !== "boolean") throw new Error(`${key} must be a boolean`);
  }
  for (const [key, map] of Object.entries(enumProperties)) {
    const value = cmd[key as keyof MideaCommandPayload];
    if (value === undefined) continue;
    const resolved = resolveEnum(value as string | number, map);
    const valid = resolved !== undefined && Number.isInteger(resolved) &&
      (Object.values(map).includes(resolved) || (key === "fanSpeed" && resolved >= 1 && resolved <= 100));
    if (!valid) throw new Error(`Invalid ${key}: "${value}"`);
    changes[key] = resolved!;
  }
  for (const key of ["targetTemperature", "targetHumidity"] as const) {
    const value = cmd[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} must be a finite number`);
    if (key === "targetHumidity" && (value < 0 || value > 100 || !Number.isInteger(value))) {
      throw new Error("targetHumidity must be an integer from 0 to 100");
    }
    changes[key] = value;
  }
  const breeze = [cmd.breezeAway, cmd.breezeMild, cmd.breezeless].filter(v => v !== undefined);
  if (breeze.length > 1) throw new Error("Specify only one of breezeAway, breezeMild or breezeless per command");

  if (cmd.startSelfClean === true && !device.supportsSelfClean) throw new Error("Device does not support self cleaning");

  // LED commands require a known, freshly read state to avoid toggling blindly.
  if (cmd.displayOn !== undefined) {
    if (!device.supportsDisplayControl) throw new Error("Device does not support display control");
    await device.refresh();
    if (!device.online || typeof device.displayOn !== "boolean") throw new Error("Cannot set display: current state is unknown");
  }
  Object.assign(device, changes);
  if (Object.keys(changes).some(key => key !== "beep")) await device.apply();
  if (cmd.displayOn !== undefined) {
    // apply() may itself return an updated state response.
    if (!device.online || typeof device.displayOn !== "boolean") throw new Error("Cannot set display: current state is unknown");
    if (device.displayOn !== cmd.displayOn) await device.toggleDisplay();
  }
  if (cmd.startSelfClean === true) {
    await device.startSelfClean();
  }
}
