import { AC_CAPABILITY, ENERGY_DATA_FORMAT, type AirConditioner } from "midea-local";
import {
  REVERSE_OPERATIONAL_MODE,
  REVERSE_FAN_SPEED,
  REVERSE_SWING_MODE,
} from "./enum-maps.ts";
import type { MideaStatePayload } from "./types.ts";

export function buildPayload(device: AirConditioner, energyDataFormat: "bcd" | "binary" = "bcd"): MideaStatePayload {
  const energyFormat = energyDataFormat === "binary" ? ENERGY_DATA_FORMAT.BINARY : ENERGY_DATA_FORMAT.BCD;
  const modeNum = device.operationalMode as number;
  const fanNum = device.fanSpeed as number;
  const swingNum = device.swingMode as number;
  const capabilities = device.capabilitiesDict();
  const capabilityFlags = capabilities.additional_capabilities as number;
  const additionalCapabilities = Object.fromEntries(
    Object.entries(AC_CAPABILITY).map(([name, flag]) => [name.toLowerCase(), (capabilityFlags & flag) === flag]),
  );
  const numericFanSpeed = Number.isInteger(fanNum) && fanNum >= 1 && fanNum <= 100 ? fanNum : null;

  return {
    ip: device.ip,
    id: device.id,
    online: device.online,

    powerState: device.powerState,
    targetTemperature: device.targetTemperature,
    indoorTemperature: device.indoorTemperature,
    outdoorTemperature: device.outdoorTemperature,
    operationalMode: REVERSE_OPERATIONAL_MODE[modeNum] ?? `unknown(${modeNum})`,
    fanSpeed: REVERSE_FAN_SPEED[fanNum] ?? (numericFanSpeed !== null ? "custom" : `unknown(${fanNum})`),
    fanSpeedValue: numericFanSpeed,
    swingMode: REVERSE_SWING_MODE[swingNum] ?? `unknown(${swingNum})`,

    turboMode: device.turbo,
    ecoMode: device.eco,
    sleepMode: device.sleep,
    indoorHumidity: device.indoorHumidity,
    displayOn: device.displayOn,
    filterAlert: device.filterAlert,

    totalEnergyConsumption: device.getTotalEnergyUsage?.(energyFormat) ?? null,
    currentEnergyConsumption: device.getCurrentEnergyUsage?.(energyFormat) ?? null,
    realTimePower: device.getRealTimePowerUsage?.(energyFormat) ?? null,

    freezeProtection: device.freezeProtection,
    followMe: device.followMe,
    purifier: device.purifier,
    ieco: device.ieco,
    flashCool: device.flashCool,
    outSilent: device.outSilent,
    breezeAway: device.breezeAway,
    breezeMild: device.breezeMild,
    breezeless: device.breezeless,
    horizontalSwingAngle: device.horizontalSwingAngle,
    verticalSwingAngle: device.verticalSwingAngle,
    cascadeMode: device.cascadeMode,
    rateSelect: device.rateSelect,
    auxMode: device.auxMode,
    targetHumidity: device.targetHumidity,
    errorCode: device.errorCode,
    outdoorFanSpeed: device.outdoorFanSpeed,
    fahrenheit: device.fahrenheit,
    beep: device.beep,
    selfCleanActive: device.selfCleanActive,
    defrostActive: device.defrostActive,
    capabilities: { ...capabilities, additional_capabilities: additionalCapabilities },

    _raw: {
      operationalMode: modeNum,
      fanSpeed: fanNum,
      swingMode: swingNum,
      additional_capabilities: capabilityFlags,
    },
  };
}
