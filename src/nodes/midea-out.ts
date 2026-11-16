/**
 * midea-out — Node-RED output node that sends commands to a Midea AC device.
 *
 * Accepts `msg.payload` with desired state properties. Only specified
 * properties are changed on the device. Supports both friendly string
 * values (e.g., "cool") and raw numeric enum values.
 *
 * @module
 */

import { createOutputs } from "./shared/outputs.ts";
import { buildPayload } from "./shared/state.ts";
import { withDevice } from "./shared/device-queue.ts";
import type { MideaCommandPayload } from "./shared/types.ts";
import { applyCommand } from "./shared/commands.ts";

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
    const output = createOutputs(node, deviceNode, config);

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

      withDevice(deviceNode, async () => {
        try {
          if (!deviceNode.connected || !deviceNode.device) throw new Error("Device not connected");
          await applyCommand(deviceNode.device, cmd);

          if (passthrough) {
            // Re-read state after apply
            await deviceNode.device.refresh();
          }
          output(msg, buildPayload(deviceNode.device, deviceNode.energyDataFormat), send, passthrough);

          done();
        } catch (err: any) {
          done(err);
        }
      }).catch(done);
    });

    // ── Cleanup ─────────────────────────────────────────────────────────

    node.on("close", (_removed: boolean, done: () => void) => {
      deviceNode.deregister(node, done);
    });
  }

  RED.nodes.registerType("midea-out", MideaOutNode);
}
