/**
 * Regression tests for issue #1:
 * "NodeRED crashes, when Device not reachable"
 *
 * Root cause: the midea-device config node emitted "error" on a plain
 * EventEmitter without any listener attached. Node.js re-throws an
 * emitted "error" event when there are zero listeners, which surfaced
 * as an uncaught exception and crashed the whole Node-RED process.
 *
 * These tests run against the built dist bundle (the artifact Node-RED
 * actually loads), with `midea-local` mocked so that discovery finds
 * nothing — simulating an unreachable device.
 *
 * @module
 */

import { describe, it, expect, mock, beforeAll } from "bun:test";
import { EventEmitter } from "node:events";

mock.module("midea-local", () => ({
  Discover: {
    discover: async () => [],
    discoverSingle: async () => null,
    connect: async () => {},
  },
  AirConditioner: class AirConditioner {},
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const registerMideaDevice: any = require("../../dist/nodes/midea-device.js");

type Ctor = (this: any, config: any) => void;

function createFakeRED() {
  const registered: Record<string, { factory: Ctor; opts?: any }> = {};

  return {
    RED: {
      httpAdmin: {
        get: () => {},
        post: () => {},
      },
      nodes: {
        createNode(node: any) {
          // Mimic Node-RED: runtime nodes are EventEmitters with logging.
          for (const m of ["on", "once", "off", "emit", "removeListener", "removeAllListeners"]) {
            (node as any)[m] = (EventEmitter.prototype as any)[m];
          }
          for (const m of ["log", "warn", "error", "debug", "status", "trace"]) {
            (node as any)[m] = () => {};
          }
        },
        registerType(type: string, factory: Ctor, opts?: any) {
          registered[type] = { factory, opts };
        },
      },
    },
    registered,
  };
}

/** Instantiate the config node as Node-RED would on deploy. */
function createNode(): any {
  const { RED, registered } = createFakeRED();
  registerMideaDevice(RED);

  const entry = registered["midea-device"];
  if (!entry) throw new Error("midea-device type was not registered");

  const node: any = {};
  entry.factory.call(node, { ip: "192.168.50.22", name: "Test AC" });
  node.credentials = {};
  return node;
}

/** Wait for the async connect() failure path (incl. first retry timer). */
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("midea-device (issue #1: crash when device not reachable)", () => {
  let uncaught: Error | null = null;
  let onUncaught: ((err: Error) => void) | null = null;

  beforeAll(() => {
    onUncaught = (err: Error) => {
      uncaught = err;
    };
    process.on("uncaughtException", onUncaught);
  });

  it("must not crash when discovery finds no device", async () => {
    const node = createNode();

    // Give connect() and its async failure path time to run.
    await settle(100);

    expect(uncaught).toBeNull();
    expect(node.connected).toBe(false);
    expect(node.device).toBe(null);
  });

  it("must keep a default 'error' listener so emit('error') never throws", () => {
    const node = createNode();

    expect(node.events.listenerCount("error")).toBeGreaterThan(0);
    expect(() =>
      node.events.emit("error", new Error(`No device found at 192.168.50.22`)),
    ).not.toThrow();
  });

  it("schedules a reconnect after a failed connect", async () => {
    const node = createNode();

    // connect() runs async; wait past the 1s initial reconnect delay.
    await settle(1200);

    // Still retrying, still alive.
    expect(node.connected).toBe(false);
    expect(uncaught).toBeNull();
  });

  it("stops reconnecting after close", async () => {
    const node = createNode();

    await new Promise<void>((resolve) => {
      node.on("close", () => resolve());
      node.emit("close", () => {});
    });

    expect(node.connected).toBe(false);
    expect(node.device).toBe(null);
  });
});
