/**
 * midea-in — Node-RED node that reads Midea AC device state.
 *
 * Refreshes the device state when an input message is received and
 * outputs the current state as `msg.payload`. Use an inject node
 * upstream to control polling timing.
 *
 * @module
 */

import type { AirConditioner } from "midea-local";
import {
  REVERSE_OPERATIONAL_MODE,
  REVERSE_FAN_SPEED,
  REVERSE_SWING_MODE,
} from "./shared/enum-maps.ts";
import type { MideaStatePayload } from "./shared/types.ts";

module.exports = function (RED: any): void {
  function MideaInNode(this: any, config: any): void {
    RED.nodes.createNode(this, config);

    const node = this;
    const deviceNode = RED.nodes.getNode(config.device);

    if (!deviceNode) {
      node.status({ fill: "red", shape: "ring", text: "no device configured" });
      return;
    }

    // Register with config node
    deviceNode.register(node);

    const topic: string = config.topic ?? "";

    // ── Build state payload from device ─────────────────────────────────

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

    // ── Handle input trigger ────────────────────────────────────────────

    node.on("input", (msg: any, send: any, done: any) => {
      send = send || function () { node.send.apply(node, arguments); };
      done = done || function (err?: Error) { if (err) node.error(err, msg); };

      if (!deviceNode.connected || !deviceNode.device) {
        done(new Error("Device not connected"));
        return;
      }

      (async () => {
        try {
          await deviceNode.device.refresh();

          const payload = buildPayload(deviceNode.device);
          const outMsg: any = { ...msg };
          outMsg.payload = payload;
          if (topic) outMsg.topic = topic;

          send(outMsg);
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

  RED.nodes.registerType("midea-in", MideaInNode);
};
