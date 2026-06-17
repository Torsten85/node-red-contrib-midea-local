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
  name: string;
  ip: string;
  credentials: {
    token?: string;
    key?: string;
  };
}

/** Runtime config node — exposed to child nodes. */
export interface MideaDeviceNode extends NodeRedNode {
  device: AirConditioner | null;
  connected: boolean;
  events: EventEmitter;
  register(childNode: NodeRedNode): void;
  deregister(childNode: NodeRedNode, done: () => void): void;
}

// ── midea-in config ─────────────────────────────────────────────────────────

export interface MideaInConfig {
  name: string;
  device: string; // config node ID
  mode: "interval" | "trigger";
  interval: number;
  topic: string;
}

// ── midea-out config ────────────────────────────────────────────────────────

export interface MideaOutConfig {
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

  _raw: {
    operationalMode: number;
    fanSpeed: number;
    swingMode: number;
  };
}

// ── Command payload (input to midea-out) ────────────────────────────────────

export interface MideaCommandPayload {
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
