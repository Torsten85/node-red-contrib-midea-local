import { describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import { applyCommand } from "./shared/commands.ts";
import { buildPayload } from "./shared/state.ts";
import { withDevice } from "./shared/device-queue.ts";

function device(): any {
  return {
    online: true, displayOn: false, supportsDisplayControl: true, supportsSelfClean: true,
    powerState: false, operationalMode: 5, fanSpeed: 5, swingMode: 0,
    applied: 0, toggled: 0, cleaned: 0, refreshed: 0,
    async apply() { this.applied++; },
    async refresh() { this.refreshed++; },
    async toggleDisplay() { this.toggled++; this.displayOn = !this.displayOn; },
    async startSelfClean() { this.cleaned++; },
    capabilitiesDict() { return { supported_modes: [5, 6], additional_capabilities: 793623 }; },
  };
}

describe("advanced AC commands", () => {
  for (const key of ["freezeProtection", "followMe", "purifier", "ieco", "flashCool", "outSilent", "breezeAway", "breezeMild", "breezeless"]) {
    it(`sets and clears ${key}`, async () => {
      const ac = device();
      await applyCommand(ac, { [key]: true });
      expect(ac[key]).toBe(true);
      await applyCommand(ac, { [key]: false });
      expect(ac[key]).toBe(false);
      expect(ac.applied).toBe(2);
    });
  }
  it("maps advanced enum strings and supports numeric custom fan speed", async () => {
    const ac = device();
    await applyCommand(ac, {
      operationalMode: "SMART_DRY", horizontalSwingAngle: "pos_2", verticalSwingAngle: "pos_5",
      cascadeMode: "up", rateSelect: "gear_75", auxMode: "aux_only", targetHumidity: 55, fanSpeed: 35,
    });
    expect(ac).toMatchObject({ operationalMode: 6, horizontalSwingAngle: 25, verticalSwingAngle: 100,
      cascadeMode: 1, rateSelect: 75, auxMode: 2, targetHumidity: 55, fanSpeed: 35, applied: 1 });
    await applyCommand(ac, { horizontalSwingAngle: 50, verticalSwingAngle: 75, cascadeMode: 2, rateSelect: 20, auxMode: 1 });
    expect(ac).toMatchObject({ horizontalSwingAngle: 50, verticalSwingAngle: 75, cascadeMode: 2, rateSelect: 20, auxMode: 1 });
  });
  it("preserves existing command names and omitted properties", async () => {
    const ac = device();
    await applyCommand(ac, { powerState: true, turboMode: false, ecoMode: true, sleepMode: false, beep: true, fahrenheit: true });
    expect(ac).toMatchObject({ powerState: true, turbo: false, eco: true, sleep: false, beep: true, fahrenheit: true, fanSpeed: 5 });
  });
  it("starts self cleaning without an unrelated apply", async () => {
    const ac = device();
    await applyCommand(ac, { startSelfClean: true, beep: true });
    expect(ac.cleaned).toBe(1);
    expect(ac.applied).toBe(0);
    expect(ac.beep).toBe(true);
    await applyCommand(ac, { startSelfClean: false });
    expect(ac.cleaned).toBe(1);
  });
  for (const payload of [[], null, { powerState: true, fanSpeed: "invalid" }, { ieco: "true" },
    { horizontalSwingAngle: 12 }, { targetHumidity: 101 }, { targetTemperature: NaN },
    { breezeAway: true, breezeless: false }, { displayOn: "false" }, { startSelfClean: 1 }]) {
    it(`rejects invalid input before mutation: ${JSON.stringify(payload)}`, async () => {
      const ac = device();
      await expect(applyCommand(ac, payload as any)).rejects.toThrow();
      expect(ac.applied).toBe(0);
      expect(ac.refreshed).toBe(0);
      expect(ac.powerState).toBe(false);
    });
  }
  it("rejects unsupported self cleaning before applying other changes", async () => {
    const ac = device(); ac.supportsSelfClean = false;
    await expect(applyCommand(ac, { powerState: true, startSelfClean: true })).rejects.toThrow("self cleaning");
    expect(ac.powerState).toBe(false);
    expect(ac.applied).toBe(0);
  });
});

describe("LED desired-state commands", () => {
  for (const initial of [false, true]) for (const desired of [false, true]) {
    it(`sets ${initial} to ${desired} and stays idempotent`, async () => {
      const ac = device(); ac.displayOn = initial;
      await applyCommand(ac, { displayOn: desired });
      await applyCommand(ac, { displayOn: desired });
      expect(ac.displayOn).toBe(desired);
      expect(ac.toggled).toBe(initial === desired ? 0 : 1);
      expect(ac.refreshed).toBe(2);
      expect(ac.applied).toBe(0);
    });
  }
  it("refreshes stale cached state before deciding to toggle", async () => {
    const ac = device();
    ac.refresh = async () => { ac.displayOn = true; };
    await applyCommand(ac, { displayOn: true });
    expect(ac.toggled).toBe(0);
  });
  it("fails without toggling for unknown state, unsupported control or refresh failure", async () => {
    for (const condition of ["unknown", "offline", "unsupported", "failure"]) {
      const ac = device();
      if (condition === "unknown") ac.refresh = async () => { ac.displayOn = null; };
      if (condition === "offline") ac.online = false;
      if (condition === "unsupported") ac.supportsDisplayControl = false;
      if (condition === "failure") ac.refresh = async () => { throw new Error("network error"); };
      await expect(applyCommand(ac, { displayOn: true, powerState: true })).rejects.toThrow();
      expect(ac.toggled).toBe(0);
      expect(ac.applied).toBe(0);
      expect(ac.powerState).toBe(false);
    }
  });
});

it("serializes reads and writes on the same device and recovers from failures", async () => {
  const config: any = {};
  const events: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = withDevice(config, async () => { events.push("write"); await gate; events.push("done"); throw new Error("failed"); });
  const failure = first.catch(error => error);
  const next = withDevice(config, async () => { events.push("read"); });
  await Promise.resolve();
  expect(events).toEqual(["write"]);
  release();
  const [error] = await Promise.all([failure, next]);
  expect(error.message).toBe("failed");
  expect(events).toEqual(["write", "done", "read"]);
});

it("outputs advanced state and capabilities identically through both built nodes", async () => {
  const ac = device();
  Object.assign(ac, { targetHumidity: 50, freezeProtection: true, ieco: true, outSilent: false,
    verticalSwingAngle: 50, selfCleanActive: false, defrostActive: true, errorCode: 0, outdoorFanSpeed: 80 });
  ac.getTotalEnergyUsage = (format: number) => format === 1 ? 123 : 456;
  ac.getCurrentEnergyUsage = (format: number) => format === 1 ? 12 : 45;
  ac.getRealTimePowerUsage = (format: number) => format === 1 ? 1200 : 4500;
  const config = { connected: true, device: ac, energyDataFormat: "binary", register() {}, deregister() {} };
  const outputs: any[] = [];
  for (const name of ["midea-in", "midea-out"]) {
    let factory: any;
    const register = require(`../../dist/nodes/${name}.js`);
    register({ nodes: {
      createNode(node: any) { node.on = EventEmitter.prototype.on; },
      getNode() { return config; }, registerType(_name: string, ctor: any) { factory = ctor; },
    } });
    const node: any = new EventEmitter();
    factory.call(node, { device: "config", passthrough: true, topic: "ac" });
    await new Promise<void>((resolve, reject) => {
      node.emit("input", { payload: {}, custom: "preserved" }, (msg: any) => outputs.push(msg), (error: any) => error ? reject(error) : resolve());
    });
  }
  expect(outputs[0]).toEqual(outputs[1]);
  expect(outputs[0][0]).toMatchObject({ topic: "ac", custom: "preserved", payload: {
    totalEnergyConsumption: 123, currentEnergyConsumption: 12, realTimePower: 1200,
    fanSpeed: "custom", fanSpeedValue: 5, targetHumidity: 50, freezeProtection: true, ieco: true, outSilent: false,
    verticalSwingAngle: 50, selfCleanActive: false, defrostActive: true, errorCode: 0, outdoorFanSpeed: 80,
    capabilities: { supported_modes: [5, 6] },
  } });
  ac.operationalMode = 6;
  expect(buildPayload(ac).operationalMode).toBe("smart_dry");
});

it("separates fan text from numeric settings and uses null for Auto", () => {
  const ac = device();
  for (const speed of [1, 5, 35, 99]) {
    ac.fanSpeed = speed;
    expect(buildPayload(ac).fanSpeed).toBe("custom");
    expect(buildPayload(ac).fanSpeedValue).toBe(speed);
    expect(buildPayload(ac)._raw.fanSpeed).toBe(speed);
  }
  for (const [speed, name] of [[20, "silent"], [40, "low"], [60, "medium"], [80, "high"], [100, "max"], [102, "auto"]] as const) {
    ac.fanSpeed = speed;
    expect(buildPayload(ac).fanSpeed).toBe(name);
    expect(buildPayload(ac).fanSpeedValue).toBe(speed === 102 ? null : speed);
    expect(buildPayload(ac)._raw.fanSpeed).toBe(speed);
  }
  ac.fanSpeed = 255;
  expect(buildPayload(ac).fanSpeed).toBe("unknown(255)");
  expect(buildPayload(ac).fanSpeedValue).toBeNull();
});

it("decodes capability bitmasks into readable flags and retains the raw value", () => {
  const ac = device();
  const payload = buildPayload(ac);
  expect(payload._raw.additional_capabilities).toBe(793623);
  expect(payload.capabilities.additional_capabilities).toEqual({
    custom_fan_speed: true, eco: true, freeze_protection: true, ieco: false,
    turbo: true, display_control: false, energy_stats: false, filter_reminder: false,
    humidity: false, target_humidity: false, swing_horizontal_angle: true,
    swing_vertical_angle: true, breeze_away: true, breeze_control: false,
    breezeless: false, cascade: false, jet_cool: false, out_silent: false,
    purifier: true, self_clean: true,
  });
  ac.capabilitiesDict = () => ({ additional_capabilities: 0 });
  expect(Object.values(buildPayload(ac).capabilities.additional_capabilities).every(value => value === false)).toBe(true);
});

it("selects the energy decoder for all readings and preserves unavailable values", () => {
  const ac = device();
  const calls: number[] = [];
  ac.getTotalEnergyUsage = (format: number) => { calls.push(format); return format === 1 ? 123 : 456; };
  ac.getCurrentEnergyUsage = (format: number) => { calls.push(format); return null; };
  ac.getRealTimePowerUsage = (format: number) => { calls.push(format); return 0; };
  expect(buildPayload(ac)).toMatchObject({ totalEnergyConsumption: 456, currentEnergyConsumption: null, realTimePower: 0 });
  expect(calls).toEqual([0, 0, 0]);
  calls.length = 0;
  expect(buildPayload(ac, "binary")).toMatchObject({ totalEnergyConsumption: 123, currentEnergyConsumption: null, realTimePower: 0 });
  expect(calls).toEqual([1, 1, 1]);
});

for (const name of ["midea-in", "midea-out"]) {
  it(`${name} emits capabilities on connection/change, separates state, and cleans up listeners`, async () => {
    const ac = device();
    ac.ip = "192.0.2.1"; ac.id = 123;
    const events = new EventEmitter();
    const config = { connected: false, device: ac, events, register() {}, deregister(_node: any, done: any) { done(); } };
    let factory: any;
    require(`../../dist/nodes/${name}.js`)({ nodes: {
      createNode(node: any) { node.on = EventEmitter.prototype.on; },
      getNode() { return config; }, registerType(_name: string, ctor: any) { factory = ctor; },
    } });
    const sent: any[] = [];
    const node: any = new EventEmitter(); node.send = (msg: any) => sent.push(msg);
    factory.call(node, { device: "config", includeCapabilities: false, passthrough: false, topic: "ac" });
    await new Promise(resolve => setImmediate(resolve));
    expect(sent).toHaveLength(0);
    config.connected = true;
    events.emit("connected");
    expect(sent).toHaveLength(1);
    expect(sent[0][0]).toBeNull();
    expect(sent[0][1]).toMatchObject({ topic: "ac", payload: { ip: "192.0.2.1", capabilities: { supported_modes: [5, 6] } } });
    const trigger = () => new Promise<void>((resolve, reject) => node.emit("input", { payload: {}, trace: "kept" }, node.send, (err: any) => err ? reject(err) : resolve()));
    await trigger();
    if (name === "midea-in") {
      expect(sent.at(-1)[0].payload.capabilities).toBeUndefined();
      expect(sent.at(-1)[0].payload._raw.additional_capabilities).toBeUndefined();
      expect(sent.at(-1)[1]).toBeNull();
    } else expect(sent).toHaveLength(1);
    ac.capabilitiesDict = () => ({ supported_modes: [5], additional_capabilities: 793623 });
    await trigger();
    expect(sent.at(-1)[1]).toMatchObject({ trace: "kept", payload: { capabilities: { supported_modes: [5] } } });
    const count = sent.length;
    events.emit("connected");
    expect(sent).toHaveLength(count + 1);
    node.emit("close", false, () => {});
    expect(events.listenerCount("connected")).toBe(0);
    events.emit("connected");
    expect(sent).toHaveLength(count + 1);
  });
}
