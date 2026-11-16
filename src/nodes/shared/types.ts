/**
 * Shared TypeScript types for node-red-contrib-midea-local.
 *
 * @module
 */

import type { AirConditioner } from "midea-local";
import type { EventEmitter } from "node:events";

// ── Node-RED type stubs ─────────────────────────────────────────────────────
// Minimal types for Node-RED's runtime API. We avoid importing the full
// @types/node-red package to keep dependencies lean.

export interface NodeRedNode {
  id: string;
  name?: string;
  type: string;
  status(status: NodeStatus | Record<string, never>): void;
  send(msg: unknown): void;
  error(msg: string, origMsg?: unknown): void;
  warn(msg: string): void;
  log(msg: string): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
}

export interface NodeStatus {
  fill: "green" | "yellow" | "red" | "blue" | "grey";
  shape: "dot" | "ring";
  text: string;
}

// ── Config node interface ───────────────────────────────────────────────────

export interface MideaDeviceConfig {
  capabilityOverrides?: string;
  energyDataFormat?: "bcd" | "binary";
  name: string;
  ip: string;
  credentials: {
    token?: string;
    key?: string;
  };
}

/** Runtime config node — exposed to child nodes. */
export interface MideaDeviceNode extends NodeRedNode {
  energyDataFormat: "bcd" | "binary";
  device: AirConditioner | null;
  connected: boolean;
  events: EventEmitter;
  register(childNode: NodeRedNode): void;
  deregister(childNode: NodeRedNode, done: () => void): void;
}

// ── midea-in config ─────────────────────────────────────────────────────────

export interface MideaInConfig {
  includeCapabilities?: boolean;
  name: string;
  device: string; // config node ID
  mode: "interval" | "trigger";
  interval: number;
  topic: string;
}

// ── midea-out config ────────────────────────────────────────────────────────

export interface MideaOutConfig {
  includeCapabilities?: boolean;
  name: string;
  device: string; // config node ID
  passthrough: boolean;
  topic: string;
}

// ── State payload (output of midea-in, optional output of midea-out) ────────

export interface MideaStatePayload {
  ip: string;
  id: number;
  online: boolean;

  powerState: boolean | null;
  targetTemperature: number | null;
  indoorTemperature: number | null;
  outdoorTemperature: number | null;
  operationalMode: string;
  fanSpeed: string;
  /** Numeric fan setting; null in Auto or when unknown. Not measured RPM. */
  fanSpeedValue: number | null;
  swingMode: string;

  turboMode: boolean | null;
  ecoMode: boolean | null;
  sleepMode: boolean | null;
  indoorHumidity: number | null;
  displayOn: boolean | null;
  filterAlert: boolean | null;

  totalEnergyConsumption: number | null;
  currentEnergyConsumption: number | null;
  realTimePower: number | null;

  freezeProtection: boolean | null;
  followMe: boolean | null;
  purifier: boolean | null;
  ieco: boolean | null;
  flashCool: boolean | null;
  outSilent: boolean | null;
  breezeAway: boolean | null;
  breezeMild: boolean | null;
  breezeless: boolean | null;
  fahrenheit: boolean | null;
  beep: boolean | null;
  selfCleanActive: boolean | null;
  defrostActive: boolean | null;
  horizontalSwingAngle: number;
  verticalSwingAngle: number;
  cascadeMode: number;
  rateSelect: number;
  auxMode: number;
  targetHumidity: number | null;
  errorCode: number | null;
  outdoorFanSpeed: number | null;
  capabilities: Record<string, unknown> & { additional_capabilities: Record<string, boolean> };

  _raw: {
    operationalMode: number;
    fanSpeed: number;
    swingMode: number;
    additional_capabilities: number;
  };
}

// ── Command payload (input to midea-out) ────────────────────────────────────

export interface MideaCommandPayload {
  freezeProtection?: boolean;
  followMe?: boolean;
  purifier?: boolean;
  ieco?: boolean;
  flashCool?: boolean;
  outSilent?: boolean;
  breezeAway?: boolean;
  breezeMild?: boolean;
  breezeless?: boolean;
  startSelfClean?: boolean;
  horizontalSwingAngle?: string | number;
  verticalSwingAngle?: string | number;
  cascadeMode?: string | number;
  rateSelect?: string | number;
  auxMode?: string | number;
  targetHumidity?: number;
  powerState?: boolean;
  targetTemperature?: number;
  operationalMode?: string | number;
  fanSpeed?: string | number;
  swingMode?: string | number;
  turboMode?: boolean;
  ecoMode?: boolean;
  sleepMode?: boolean;
  fahrenheit?: boolean;
  displayOn?: boolean;
  beep?: boolean;
}
