import { buildPayload } from "./state.ts";
import type { MideaStatePayload } from "./types.ts";

/** Per-node capability change tracking; no additional device queries. */
export function createOutputs(node: any, deviceNode: any, config: any) {
  let previous: string | undefined;
  let closed = false;
  const topic = config.topic ?? "";

  function capabilities(payload: MideaStatePayload, msg: any = {}, force = false) {
    const data = {
      ip: payload.ip, id: payload.id, capabilities: payload.capabilities,
      _raw: { additional_capabilities: payload._raw.additional_capabilities },
    };
    const snapshot = JSON.stringify(data);
    if (!force && snapshot === previous) return null;
    previous = snapshot;
    return { ...msg, ...(topic ? { topic } : {}), payload: data };
  }

  function connected() {
    if (closed || !deviceNode.connected || !deviceNode.device) return;
    const payload = buildPayload(deviceNode.device, deviceNode.energyDataFormat);
    node.send([null, capabilities(payload, {}, true)]);
  }
  deviceNode.events?.on("connected", connected);
  // Wait until Node-RED has wired the node before emitting an existing connection.
  const initial = setImmediate(() => { if (previous === undefined) connected(); });
  node.on("close", () => {
    closed = true;
    clearImmediate(initial);
    deviceNode.events?.removeListener("connected", connected);
  });

  return (msg: any, payload: MideaStatePayload, send: any, includeState = true) => {
    const capabilityMessage = capabilities(payload, msg);
    let stateMessage = null;
    if (includeState) {
      const state: any = { ...payload, _raw: { ...payload._raw } };
      if (config.includeCapabilities === false) {
        delete state.capabilities;
        delete state._raw.additional_capabilities;
      }
      stateMessage = { ...msg, ...(topic ? { topic } : {}), payload: state };
    }
    if (stateMessage || capabilityMessage) send([stateMessage, capabilityMessage]);
  };
}
