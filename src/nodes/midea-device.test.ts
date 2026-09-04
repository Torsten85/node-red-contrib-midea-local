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

import { describe, it, expect, mock, beforeAll } from "bun:test";
import { EventEmitter } from "node:events";

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
  authenticate: (token?: string, key?: string) => Promise<void> = async () => {};
  refresh: () => Promise<void> = async () => {};
}

mock.module("midea-local", () => ({
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
function createNode(credentials?: { token?: string; key?: string }): any {
  const { RED, registered } = createFakeRED();
  registerMideaDevice(RED);

  const entry = registered["midea-device"];
  if (!entry) throw new Error("midea-device type was not registered");

  const node: any = { credentials: credentials ?? {} };
  entry.factory.call(node, { ip: "192.168.50.22", name: "Test AC" });
  return node;
}

/** Invoke a registered admin HTTP handler with stub req/res. */
async function callHttp(
  httpAdmin: Record<string, Handler>,
  method: "GET" | "POST",
  path: string,
  body?: any,
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
  await handler({ body }, res);
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
