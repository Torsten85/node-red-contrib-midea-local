/**
 * Regression tests for midea-device:
 *
 * Issue #1: "NodeRED crashes, when Device not reachable"
 *   The config node emitted "error" on a plain EventEmitter without any
 *   listener attached. Node.js re-throws an emitted "error" event when
 *   there are zero listeners → uncaught exception → Node-RED crashes.
 *
 * Issue #3: "Unhandled CloudError exception causes Node-RED crash when
 * fetching token/key fails"
 *   The authorize endpoint called Discover.discoverSingle(ip) with the
 *   library default autoConnect: true. The implicit connect fetched
 *   cloud tokens without credentials; any CloudError rejected inside a
 *   detached Promise.all in the library and became an unhandled promise
 *   rejection → Node-RED crashes, unreachable by any try/catch of ours.
 *
 * Tests run against the built dist bundle (the artifact Node-RED
 * actually loads) with `midea-local` mocked.
 *
 * @module
 */

import { describe, it, expect, mock, beforeAll, beforeEach } from "bun:test";
import { EventEmitter } from "node:events";
import { applyCapabilityOverrides } from "./shared/capability-overrides.ts";

/**
 * Mutable behavior for the midea-local mock. Tests mutate these
 * functions to simulate library/cloud failures. (The dist bundle binds
 * the mocked module object once at load time, so we delegate to this
 * object instead of re-mocking.)
 */
const behavior: {
  discover: (...args: any[]) => Promise<any[]>;
  discoverSingle: (...args: any[]) => Promise<any>;
  connect: (...args: any[]) => Promise<any>;
} = {
  discover: async () => [],
  discoverSingle: async () => null,
  connect: async () => true,
};

class AirConditionerMock {
  ip = "192.168.50.22";
  id = 123456789012345;
  name = "Test AC";
  sn = "SN-123";
  token: string | undefined;
  key: string | undefined;
  type = 0xac;
  version = 3;
  enableEnergyUsageRequests = false;
  authenticate: (token?: string, key?: string) => Promise<void> = async () => {};
  refresh: () => Promise<void> = async () => {};
  getCapabilities: () => Promise<void> = async () => {};
}

const library = require("midea-local");
const RealAirConditioner = library.AirConditioner;
mock.module("midea-local", () => ({
  ...library,
  Discover: {
    discover: (...args: any[]) => behavior.discover(...(args as [])),
    discoverSingle: (...args: any[]) => behavior.discoverSingle(...(args as [])),
    connect: (...args: any[]) => behavior.connect(...(args as [])),
  },
  AirConditioner: AirConditionerMock,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const registerMideaDevice: any = require("../../dist/nodes/midea-device.js");

type Ctor = (this: any, config: any) => void;
type Handler = (req: any, res: any) => Promise<void>;

function createFakeRED() {
  const registered: Record<string, { factory: Ctor; opts?: any }> = {};
  const httpAdmin: Record<string, Handler> = {};

  return {
    RED: {
      httpAdmin: {
        get: (path: string, handler: Handler) => {
          httpAdmin[`GET ${path}`] = handler;
        },
        post: (path: string, handler: Handler) => {
          httpAdmin[`POST ${path}`] = handler;
        },
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
    httpAdmin,
  };
}

/** Instantiate the config node as Node-RED would on deploy. */
function createNode(credentials?: { token?: string; key?: string }, config: Record<string, unknown> = {}): any {
  const { RED, registered } = createFakeRED();
  registerMideaDevice(RED);

  const entry = registered["midea-device"];
  if (!entry) throw new Error("midea-device type was not registered");

  const node: any = { credentials: credentials ?? {} };
  entry.factory.call(node, { ip: "192.168.50.22", name: "Test AC", ...config });
  return node;
}

/** Invoke a registered admin HTTP handler with stub req/res. */
async function callHttp(
  httpAdmin: Record<string, Handler>,
  method: "GET" | "POST",
  path: string,
  body?: any,
  query?: Record<string, string>,
): Promise<{ statusCode: number | undefined; body: any }> {
  const handler = httpAdmin[`${method} ${path}`];
  if (!handler) throw new Error(`${method} ${path} is not registered`);

  const res: any = {
    statusCode: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(obj: any) {
      this.body = obj;
      return this;
    },
  };
  await handler({ body, query }, res);
  return { statusCode: res.statusCode, body: res.body };
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

describe("midea-device (issue #3: CloudError crash on token/key fetch)", () => {
  let uncaught: Error | null = null;
  let onUncaught: ((err: Error) => void) | null = null;

  beforeAll(() => {
    onUncaught = (err: Error) => {
      uncaught = err;
    };
    process.on("uncaughtException", onUncaught);
  });

  it("authorize: must discover with autoConnect disabled", async () => {
    let seenOptions: any = null;
    behavior.discoverSingle = async (_ip: any, options: any) => {
      seenOptions = options;
      return null;
    };

    const { RED, httpAdmin } = createFakeRED();
    registerMideaDevice(RED);
    const res = await callHttp(httpAdmin, "POST", "/midea-device/authorize", {
      ip: "192.168.50.22",
      account: "a@example.com",
      password: "secret",
    });

    // The library's implicit connect is the crash trigger — it must
    // never be enabled from our code.
    expect(seenOptions).toEqual({ autoConnect: false });
    expect(res.statusCode).toBe(404);
    expect(uncaught).toBeNull();
  });

  it("authorize: responds 502 with clear message on CloudError, process survives", async () => {
    behavior.discoverSingle = async () => new AirConditionerMock();
    behavior.connect = async () => {
      throw Object.assign(new Error("Failed to get token from cloud. system error"), {
        name: "CloudError",
      });
    };

    const { RED, httpAdmin } = createFakeRED();
    registerMideaDevice(RED);
    const res = await callHttp(httpAdmin, "POST", "/midea-device/authorize", {
      ip: "192.168.50.22",
      account: "a@example.com",
      password: "secret",
    });

    expect(res.statusCode).toBe(502);
    expect(res.body.error).toContain("Midea cloud error");
    expect(res.body.error).toContain("Failed to get token from cloud");
    expect(uncaught).toBeNull();
  });

  it("authorize: responds 500 on unexpected discovery errors, process survives", async () => {
    behavior.discoverSingle = async () => {
      throw new Error("Socket error: network unreachable");
    };
    behavior.connect = async () => true;

    const { RED, httpAdmin } = createFakeRED();
    registerMideaDevice(RED);
    const res = await callHttp(httpAdmin, "POST", "/midea-device/authorize", {
      ip: "192.168.50.22",
      account: "a@example.com",
      password: "secret",
    });

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toContain("network unreachable");
    expect(uncaught).toBeNull();
  });

  it("authorize: must not return success when connect yields no token/key", async () => {
    const device = new AirConditionerMock(); // token/key stay undefined
    behavior.discoverSingle = async () => device;
    behavior.connect = async () => false; // handshake failed without throwing

    const { RED, httpAdmin } = createFakeRED();
    registerMideaDevice(RED);
    const res = await callHttp(httpAdmin, "POST", "/midea-device/authorize", {
      ip: "192.168.50.22",
      account: "a@example.com",
      password: "secret",
    });

    expect(res.statusCode).toBe(502);
    expect(res.body.error).toContain("did not return token/key");
  });

  it("authorize: returns token/key on success", async () => {
    const device = new AirConditionerMock();
    behavior.discoverSingle = async () => device;
    behavior.connect = async () => {
      device.token = "tok";
      device.key = "key";
      return true;
    };

    const { RED, httpAdmin } = createFakeRED();
    registerMideaDevice(RED);
    const res = await callHttp(httpAdmin, "POST", "/midea-device/authorize", {
      ip: "192.168.50.22",
      account: "a@example.com",
      password: "secret",
    });

    expect(res.statusCode).toBeUndefined(); // 200: no explicit status call
    expect(res.body.token).toBe("tok");
    expect(res.body.key).toBe("key");
    expect(res.body.id).toBe(device.id);
  });

  it("config node: survives cloud errors when authenticate fails with stored credentials", async () => {
    behavior.discoverSingle = async () => {
      const device = new AirConditionerMock();
      device.authenticate = async () => {
        throw Object.assign(new Error("Failed to get token from cloud. system error"), {
          name: "CloudError",
        });
      };
      return device;
    };
    behavior.connect = async () => true;

    const node = createNode({ token: "bad-token", key: "bad-key" });
    await settle(100);

    expect(uncaught).toBeNull();
    expect(node.connected).toBe(false);
    expect(node.device).toBe(null);
  });

  it("config node: survives cloud errors during refresh without stored credentials", async () => {
    behavior.discoverSingle = async () => {
      const device = new AirConditionerMock();
      device.refresh = async () => {
        throw Object.assign(new Error("Failed to get token from cloud. system error"), {
          name: "CloudError",
        });
      };
      return device;
    };
    behavior.connect = async () => true;

    const node = createNode(); // no token/key stored
    await settle(100);

    expect(uncaught).toBeNull();
    expect(node.connected).toBe(false);
    expect(node.device).toBe(null);
  });
});

describe("midea-device (issue #2: discovery with defined IP address)", () => {
  /** Track which discovery method was called with which args. */
  let discoverCalls: any[][];
  let discoverSingleCalls: any[][];

  const broadcastDevices = [
    { ip: "10.0.0.40", id: 1, name: "ac-a", sn: "SN-A", type: 0xac, version: 2 },
    { ip: "10.0.0.41", id: 2, name: "ac-b", sn: "SN-B", type: 0xac, version: 3 },
  ];

  beforeEach(() => {
    discoverCalls = [];
    discoverSingleCalls = [];
    behavior.discover = async (...args: any[]) => {
      discoverCalls.push(args);
      return broadcastDevices.map((d) => ({ ...d }));
    };
    behavior.discoverSingle = async (...args: any[]) => {
      discoverSingleCalls.push(args);
      return { ip: "192.168.50.22", id: 99, name: "ac-direct", sn: "SN-D", type: 0xac, version: 3 };
    };
  });

  it("scan without ip performs a broadcast discovery", async () => {
    const { RED, httpAdmin } = createFakeRED();
    registerMideaDevice(RED);
    const res = await callHttp(httpAdmin, "GET", "/midea-device/scan");

    expect(discoverCalls).toHaveLength(1);
    expect(discoverSingleCalls).toHaveLength(0);
    expect(res.statusCode).toBeUndefined(); // 200
    expect(res.body).toHaveLength(2);
    expect(res.body[0].ip).toBe("10.0.0.40");
  });

  it("scan with ip performs a directed discovery with autoConnect disabled", async () => {
    const { RED, httpAdmin } = createFakeRED();
    registerMideaDevice(RED);
    const res = await callHttp(httpAdmin, "GET", "/midea-device/scan", undefined, { ip: "192.168.50.22" });

    expect(discoverSingleCalls).toEqual([["192.168.50.22", { autoConnect: false }]]);
    expect(discoverCalls).toHaveLength(0); // no broadcast
    expect(res.statusCode).toBeUndefined(); // 200
    expect(res.body).toEqual([
      { ip: "192.168.50.22", id: 99, name: "ac-direct", sn: "SN-D", type: 0xac, version: 3 },
    ]);
  });

  it("scan with ip returns an empty list when the device is unreachable", async () => {
    behavior.discoverSingle = async () => null;

    const { RED, httpAdmin } = createFakeRED();
    registerMideaDevice(RED);
    const res = await callHttp(httpAdmin, "GET", "/midea-device/scan", undefined, { ip: "10.1.2.3" });

    expect(res.statusCode).toBeUndefined(); // 200, not an error
    expect(res.body).toEqual([]);
  });

  it("scan with an empty ip falls back to broadcast", async () => {
    const { RED, httpAdmin } = createFakeRED();
    registerMideaDevice(RED);
    await callHttp(httpAdmin, "GET", "/midea-device/scan", undefined, { ip: "  " });

    expect(discoverCalls).toHaveLength(1);
    expect(discoverSingleCalls).toHaveLength(0);
  });

  it("scan reports discovery errors as 500", async () => {
    behavior.discoverSingle = async () => {
      throw Object.assign(new Error("Socket error: abc"), { name: "DiscoverError" });
    };

    const { RED, httpAdmin } = createFakeRED();
    registerMideaDevice(RED);
    const res = await callHttp(httpAdmin, "GET", "/midea-device/scan", undefined, { ip: "bad-host" });

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toContain("Socket error");
  });
});

describe("capability initialization", () => {
  it("queries capabilities before refreshing state", async () => {
    const calls: string[] = [];
    const device = new AirConditionerMock();
    device.getCapabilities = async () => { calls.push("capabilities"); };
    device.refresh = async () => { calls.push("refresh"); };
    behavior.discoverSingle = async () => device;
    const node = createNode();
    await settle(10);
    expect(calls).toEqual(["capabilities", "refresh"]);
    expect(node.connected).toBe(true);
    expect(node.device.enableGroup5DataRequests).toBe(true);
    node.emit("close", () => {});
  });
});

describe("energy polling configuration", () => {
  for (const advertised of [false, true]) for (const forced of [false, true]) {
    it(`follows advertised energy support, ignoring legacy force setting: advertised=${advertised}, forced=${forced}`, async () => {
      const device = new AirConditionerMock();
      let polled: boolean | undefined;
      device.getCapabilities = async () => { device.enableEnergyUsageRequests = advertised; };
      device.refresh = async () => { polled = device.enableEnergyUsageRequests; };
      behavior.discoverSingle = async () => device;
      const node = createNode(undefined, { forceEnergyPolling: forced, energyDataFormat: "binary" });
      await settle(10);
      expect(node.connected).toBe(true);
      expect(polled).toBe(advertised);
      expect(node.energyDataFormat).toBe("binary");
      node.emit("close", () => {});
    });
  }
  it("preserves defaults for existing flows", async () => {
    const device = new AirConditionerMock();
    behavior.discoverSingle = async () => device;
    const node = createNode();
    await settle(10);
    expect(node.energyDataFormat).toBe("bcd");
    expect(device.enableEnergyUsageRequests).toBe(false);
    node.emit("close", () => {});
  });
});

describe("capability overrides", () => {
  function realDevice() {
    const device = new RealAirConditioner({ ip: "192.0.2.1", port: 6444, deviceId: 1 });
    device.overrideCapabilities({ additional_capabilities: 793623 });
    return device;
  }

  it("enables LED support using the library API without losing other flags", () => {
    const device = realDevice();
    expect(device.supportsDisplayControl).toBe(false);
    applyCapabilityOverrides(device, '{"display_control":true}');
    expect(device.supportsDisplayControl).toBe(true);
    expect(device.supportsEco).toBe(true);
    expect(device.supportsSelfClean).toBe(true);
    expect(device.capabilitiesDict().additional_capabilities).toBe(793655);
  });

  it("can clear individual flags and preserves unspecified and unknown bits", () => {
    const device = realDevice();
    const unknownBit = 1 << 25;
    device.overrideCapabilities({ additional_capabilities: 793623 | unknownBit });
    applyCapabilityOverrides(device, '{"eco":false,"display_control":true}');
    expect(device.supportsEco).toBe(false);
    expect(device.supportsDisplayControl).toBe(true);
    expect(device.supportsSelfClean).toBe(true);
    expect(device.capabilitiesDict().additional_capabilities).toBe((793623 | unknownBit | 32) & ~2);
  });

  for (const input of [undefined, "", "  ", "{}"]) {
    it(`leaves detected capabilities alone for ${JSON.stringify(input)}`, () => {
      const device = realDevice();
      applyCapabilityOverrides(device, input);
      expect(device.capabilitiesDict().additional_capabilities).toBe(793623);
    });
  }

  for (const input of ['{', 'null', '[]', 'true', '{"display_control":true,"typo":true}', '{"display_control":true,"eco":1}', '{"__proto__":true}']) {
    it(`rejects invalid overrides without partial updates: ${input}`, () => {
      const device = realDevice();
      expect(() => applyCapabilityOverrides(device, input)).toThrow();
      expect(device.capabilitiesDict().additional_capabilities).toBe(793623);
    });
  }

  it("applies configuration after discovery and before refresh on each connection", async () => {
    for (let connection = 0; connection < 2; connection++) {
      const calls: string[] = [];
      const device = new AirConditionerMock();
      let mask = 0;
      device.getCapabilities = async () => { mask = 793623; calls.push("discovery"); };
      Object.assign(device, {
        capabilitiesDict: () => ({ additional_capabilities: mask }),
        overrideCapabilities: (overrides: any) => { mask = overrides.additional_capabilities; calls.push("override"); },
      });
      device.refresh = async () => { calls.push("refresh"); expect(mask).toBe(793655); };
      behavior.discoverSingle = async () => device;
      const node = createNode(undefined, { capabilityOverrides: '{"display_control":true}' });
      await settle(10);
      expect(node.connected).toBe(true);
      expect(calls).toEqual(["discovery", "override", "refresh"]);
      node.emit("close", () => {});
    }
  });
});
