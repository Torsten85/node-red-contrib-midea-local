/**
 * midea-in — Node-RED node that reads Midea AC device state.
 *
 * Refreshes the device state when an input message is received and
 * outputs the current state as `msg.payload`. Use an inject node
 * upstream to control polling timing.
 *
 * @module
 */

import { createOutputs } from "./shared/outputs.ts";
import { buildPayload } from "./shared/state.ts";
import { withDevice } from "./shared/device-queue.ts";

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

    const output = createOutputs(node, deviceNode, config);

    // ── Handle input trigger ────────────────────────────────────────────

    node.on("input", (msg: any, send: any, done: any) => {
      send = send || function () { node.send.apply(node, arguments); };
      done = done || function (err?: Error) { if (err) node.error(err, msg); };

      if (!deviceNode.connected || !deviceNode.device) {
        done(new Error("Device not connected"));
        return;
      }

      withDevice(deviceNode, async () => {
        try {
          if (!deviceNode.connected || !deviceNode.device) throw new Error("Device not connected");
          await deviceNode.device.refresh();

          const payload = buildPayload(deviceNode.device, deviceNode.energyDataFormat);
          output(msg, payload, send);
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

  RED.nodes.registerType("midea-in", MideaInNode);
};
