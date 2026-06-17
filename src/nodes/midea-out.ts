/**
 * midea-out — Node-RED output node that sends commands to a Midea AC device.
 *
 * Accepts `msg.payload` with desired state properties. Only specified
 * properties are changed on the device. Supports both friendly string
 * values (e.g., "cool") and raw numeric enum values.
 *
 * @module
 */

import type { AirConditioner } from "midea-local";
import {
  OPERATIONAL_MODE_MAP,
  FAN_SPEED_MAP,
  SWING_MODE_MAP,
  REVERSE_OPERATIONAL_MODE,
  REVERSE_FAN_SPEED,
  REVERSE_SWING_MODE,
  resolveEnum,
} from "./shared/enum-maps.ts";
import type { MideaCommandPayload, MideaStatePayload } from "./shared/types.ts";

module.exports = function (RED: any): void {
  function MideaOutNode(this: any, config: any): void {
    RED.nodes.createNode(this, config);

    const node = this;
    const deviceNode = RED.nodes.getNode(config.device);

    if (!deviceNode) {
      node.status({ fill: "red", shape: "ring", text: "no device configured" });
      return;
    }

    // Register with config node
    deviceNode.register(node);

    const passthrough: boolean = config.passthrough ?? false;
    const topic: string = config.topic ?? "";

    // ── Build state payload (same as midea-in) ──────────────────────────

    function buildPayload(device: AirConditioner): MideaStatePayload {
      const modeNum = device.operationalMode as number;
      const fanNum = device.fanSpeed as number;
      const swingNum = device.swingMode as number;

      return {
        ip: device.ip,
        id: device.id,
        online: device.online,

        powerState: device.powerState,
        targetTemperature: device.targetTemperature,
        indoorTemperature: device.indoorTemperature,
        outdoorTemperature: device.outdoorTemperature,
        operationalMode: REVERSE_OPERATIONAL_MODE[modeNum] ?? `unknown(${modeNum})`,
        fanSpeed: REVERSE_FAN_SPEED[fanNum] ?? `unknown(${fanNum})`,
        swingMode: REVERSE_SWING_MODE[swingNum] ?? `unknown(${swingNum})`,

        turboMode: device.turbo,
        ecoMode: device.eco,
        sleepMode: device.sleep,
        indoorHumidity: device.indoorHumidity,
        displayOn: device.displayOn,
        filterAlert: device.filterAlert,

        totalEnergyConsumption: device.getTotalEnergyUsage?.() ?? null,
        currentEnergyConsumption: device.getCurrentEnergyUsage?.() ?? null,
        realTimePower: device.getRealTimePowerUsage?.() ?? null,

        _raw: {
          operationalMode: modeNum,
          fanSpeed: fanNum,
          swingMode: swingNum,
        },
      };
    }

    // ── Apply command ───────────────────────────────────────────────────

    async function applyCommand(
      device: AirConditioner,
      cmd: MideaCommandPayload,
    ): Promise<void> {
      // Map friendly string values to enum numbers, pass numbers through

      if (cmd.powerState !== undefined) {
        device.powerState = cmd.powerState;
      }

      if (cmd.targetTemperature !== undefined) {
        device.targetTemperature = cmd.targetTemperature;
      }

      if (cmd.operationalMode !== undefined) {
        const resolved = resolveEnum(cmd.operationalMode, OPERATIONAL_MODE_MAP);
        if (resolved === undefined) {
          throw new Error(`Invalid operationalMode: "${cmd.operationalMode}"`);
        }
        device.operationalMode = resolved as any;
      }

      if (cmd.fanSpeed !== undefined) {
        const resolved = resolveEnum(cmd.fanSpeed, FAN_SPEED_MAP);
        if (resolved === undefined) {
          throw new Error(`Invalid fanSpeed: "${cmd.fanSpeed}"`);
        }
        device.fanSpeed = resolved as any;
      }

      if (cmd.swingMode !== undefined) {
        const resolved = resolveEnum(cmd.swingMode, SWING_MODE_MAP);
        if (resolved === undefined) {
          throw new Error(`Invalid swingMode: "${cmd.swingMode}"`);
        }
        device.swingMode = resolved as any;
      }

      if (cmd.turboMode !== undefined) {
        device.turbo = cmd.turboMode;
      }

      if (cmd.ecoMode !== undefined) {
        device.eco = cmd.ecoMode;
      }

      if (cmd.sleepMode !== undefined) {
        device.sleep = cmd.sleepMode;
      }

      if (cmd.fahrenheit !== undefined) {
        device.fahrenheit = cmd.fahrenheit;
      }

      if (cmd.beep !== undefined) {
        device.beep = cmd.beep;
      }

      // Apply all changes to the device
      await device.apply();

      // Toggle display is a separate command
      if (cmd.displayOn !== undefined) {
        await device.toggleDisplay();
      }
    }

    // ── Handle input messages ───────────────────────────────────────────

    node.on("input", (msg: any, send: any, done: any) => {
      send = send || function () { node.send.apply(node, arguments); };
      done = done || function (err?: Error) { if (err) node.error(err, msg); };

      if (!deviceNode.connected || !deviceNode.device) {
        done(new Error("Device not connected"));
        return;
      }

      const cmd = msg.payload as MideaCommandPayload;

      if (!cmd || typeof cmd !== "object") {
        done(new Error("msg.payload must be an object with device properties"));
        return;
      }

      (async () => {
        try {
          await applyCommand(deviceNode.device, cmd);

          if (passthrough) {
            // Re-read state after apply
            await deviceNode.device.refresh();
            const outMsg: any = { ...msg };
            outMsg.payload = buildPayload(deviceNode.device);
            if (topic) outMsg.topic = topic;
            send(outMsg);
          }

          done();
        } catch (err: any) {
          done(err);
        }
      })();
    });

    // ── Cleanup ─────────────────────────────────────────────────────────

    node.on("close", (_removed: boolean, done: () => void) => {
      deviceNode.deregister(node, done);
    });
  }

  RED.nodes.registerType("midea-out", MideaOutNode);
}
