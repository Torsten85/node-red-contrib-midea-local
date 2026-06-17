/**
 * midea-device — Node-RED config node for Midea AC device connection.
 *
 * Manages a persistent AirConditioner instance with auto-reconnect.
 * Registers admin HTTP endpoints for device scanning and one-time authorization.
 *
 * @module
 */

import { EventEmitter } from "node:events";
import { Discover, AirConditioner } from "midea-local";

/** Auto-reconnect timing constants. */
const INITIAL_RECONNECT_DELAY = 1_000;
const MAX_RECONNECT_DELAY = 60_000;

module.exports = function (RED: any): void {
  // ── Admin HTTP endpoints ────────────────────────────────────────────────

  /**
   * GET /midea-device/scan
   *
   * Runs UDP broadcast discovery and returns a list of found devices.
   * Credentials are NOT required — this is a network scan only.
   */
  RED.httpAdmin.get("/midea-device/scan", async (_req: any, res: any) => {
    try {
      const devices = await Discover.discover({ autoConnect: false });

      const results = devices.map((d: any) => ({
        ip: d.ip,
        id: d.id,
        name: d.name,
        sn: d.sn,
        type: d.type,
        version: d.version,
      }));

      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Discovery failed" });
    }
  });

  /**
   * POST /midea-device/authorize
   *
   * One-time credential use: discovers a specific device, fetches its
   * token/key from the Midea cloud, and returns them. Credentials are
   * NOT stored anywhere.
   */
  RED.httpAdmin.post("/midea-device/authorize", async (req: any, res: any) => {
    const { ip, account, password } = req.body ?? {};

    if (!ip || !account || !password) {
      return res
        .status(400)
        .json({ error: "ip, account, and password are required." });
    }

    try {
      const device = await Discover.discoverSingle(ip);

      if (!device) {
        return res
          .status(404)
          .json({ error: `No device found at ${ip}` });
      }

      // Fetch token/key from cloud — credentials are used here and discarded
      await Discover.connect(device, { account, password });

      res.json({
        token: device.token,
        key: device.key,
        id: device.id,
        name: device.name,
        sn: device.sn,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Authorization failed" });
    }
  });

  // ── Config node constructor ─────────────────────────────────────────────

  function MideaDeviceNode(this: any, config: any): void {
    RED.nodes.createNode(this, config);

    const node = this;

    // Config
    node.deviceIp = config.ip;
    node.deviceName = config.name;

    // Credentials (token and key are stored encrypted by Node-RED)
    const token: string | undefined = node.credentials?.token;
    const key: string | undefined = node.credentials?.key;

    // Runtime state
    node.device = null as AirConditioner | null;
    node.connected = false;
    node.events = new EventEmitter();

    // Child node tracking
    const users: any[] = [];

    // Reconnect state
    let reconnectDelay = INITIAL_RECONNECT_DELAY;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closing = false;

    // ── Status propagation ────────────────────────────────────────────

    function setStatus(status: { fill: string; shape: string; text: string }): void {
      for (const child of users) {
        child.status(status);
      }
    }

    // ── Connection ────────────────────────────────────────────────────

    async function connect(): Promise<void> {
      if (closing) return;

      setStatus({ fill: "yellow", shape: "ring", text: "connecting..." });

      try {
        // Discover the device
        const device = await Discover.discoverSingle(node.deviceIp);

        if (!device) {
          throw new Error(`No device found at ${node.deviceIp}`);
        }

        if (!(device instanceof AirConditioner)) {
          throw new Error(
            `Device at ${node.deviceIp} is not an air conditioner (type: 0x${device.type.toString(16)})`,
          );
        }

        // Authenticate with stored token/key
        if (token && key) {
          await device.authenticate(token, key);
        }

        // Initial state refresh
        await device.refresh();

        node.device = device;
        node.connected = true;
        reconnectDelay = INITIAL_RECONNECT_DELAY;

        setStatus({ fill: "green", shape: "dot", text: "connected" });
        node.events.emit("connected");
        node.log(`Connected to ${node.deviceIp}`);
      } catch (err: any) {
        node.connected = false;
        node.device = null;

        const msg = err.message ?? "Connection failed";
        setStatus({ fill: "red", shape: "ring", text: msg });
        node.events.emit("error", err);
        node.warn(`Connection failed: ${msg}`);

        scheduleReconnect();
      }
    }

    function scheduleReconnect(): void {
      if (closing) return;

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, reconnectDelay);

      node.log(
        `Reconnecting in ${(reconnectDelay / 1000).toFixed(0)}s...`,
      );
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    }

    function disconnect(): void {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      node.connected = false;
      node.device = null;
    }

    // ── Child node registration ───────────────────────────────────────

    node.register = function (childNode: any): void {
      users.push(childNode);

      // Set initial status on the new child
      if (node.connected) {
        childNode.status({ fill: "green", shape: "dot", text: "connected" });
      } else {
        childNode.status({ fill: "red", shape: "ring", text: "disconnected" });
      }
    };

    node.deregister = function (childNode: any, done: () => void): void {
      const idx = users.indexOf(childNode);
      if (idx !== -1) users.splice(idx, 1);
      done();
    };

    // ── Lifecycle ─────────────────────────────────────────────────────

    // Start connection
    connect();

    // Cleanup on close/redeploy
    node.on("close", (done: () => void) => {
      closing = true;
      disconnect();
      node.events.removeAllListeners();
      done();
    });
  }

  RED.nodes.registerType("midea-device", MideaDeviceNode, {
    credentials: {
      token: { type: "text" },
      key: { type: "password" },
    },
  });
}
