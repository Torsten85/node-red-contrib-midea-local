# node-red-contrib-midea-local

Node-RED nodes for **local network control** of Midea smart air conditioners. No cloud dependency at runtime — everything talks directly to the device over your LAN.

Based on [midea-local](https://www.npmjs.com/package/midea-local).

## Install

```bash
cd ~/.node-red
npm install node-red-contrib-midea-local
```

Then restart Node-RED. The nodes will appear in the **midea** category in the palette.

## Nodes

### midea device (config)

Configuration node that manages the connection to a single Midea AC device.

- **Scan Network** — discovers Midea devices on your local network via UDP broadcast. If your network is segmented into VLANs or subnets (broadcast cannot cross those boundaries), enter the device IP first and press **Scan Network** to probe that device directly
- **Authorize** — one-time cloud authentication for V3 devices to fetch the device token and key. Your Midea account credentials are used only during this step and are **never stored**
- **Auto-reconnect** — connection is automatically re-established with exponential backoff (1s → 60s)

### Capability overrides

In the device configuration, **Capability overrides** accepts an optional JSON object using the same lowercase names as `payload.capabilities.additional_capabilities`:

```json
{"display_control": true}
```

This enables LED commands even when the device does not advertise display control. All 20 capability names are accepted, with boolean values. For example, `{"display_control": true, "self_clean": false}` enables display control and disables the self-clean capability. Omitted flags retain their detected values. Empty input or `{}` applies no overrides; unknown names and non-boolean values are rejected.

Overrides are applied after discovery on every connection, before the initial state refresh. State output reports the effective flags, including overrides. Removing an override and redeploying restores discovery for that flag. Overrides cannot add features absent from the device. Energy polling follows the device’s reported capabilities.

### Energy monitoring

Energy polling follows the device’s reported capabilities.

**Energy format**: choose **BCD** (the library default) or **Binary**, depending on your model. The format applies to `totalEnergyConsumption`, `currentEnergyConsumption`, and `realTimePower` in both nodes. There is no automatic format detection.

Unavailable readings remain `null`. Group 5 status queries remain enabled independently.

### Separate capability output

Both nodes have two outputs: **1: device state**, **2: capabilities**. Output 2 emits after connection/reconnection and when capabilities change during a subsequent read or command, without extra queries. Its payload is `{ip, id, capabilities, _raw: {additional_capabilities}}`. The configured topic applies to both outputs. The command node emits capabilities even with pass-through disabled.

**Include capabilities in state output** defaults to enabled for compatibility. Disable it to remove `capabilities` and `_raw.additional_capabilities` from output 1. Current readings remain on output 1; both outputs identify the device with `ip` and `id`.

### midea in

Reads the current device state when triggered by an input message. Use an **inject** node upstream to poll at your desired interval.

**Output `msg.payload`:**

| Property | Type | Description |
|---|---|---|
| `powerState` | boolean | Power on/off |
| `targetTemperature` | number | Set temperature in °C |
| `indoorTemperature` | number \| null | Measured indoor temp |
| `outdoorTemperature` | number \| null | Measured outdoor temp |
| `operationalMode` | string | `"auto"`, `"cool"`, `"dry"`, `"heat"`, `"fan_only"`, `"smart_dry"` |
| `fanSpeed` | string | `"auto"`, `"max"`, `"high"`, `"medium"`, `"low"`, `"silent"`, or `"custom"` |
| `fanSpeedValue` | number \| null | Numeric fan setting (1–100); `null` in Auto or when unknown. Not measured RPM. |
| `swingMode` | string | `"off"`, `"vertical"`, `"horizontal"`, `"both"` |
| `turboMode` | boolean | Turbo on/off |
| `ecoMode` | boolean | Eco on/off |
| `sleepMode` | boolean | Sleep on/off |
| `indoorHumidity` | number \| null | Indoor humidity % |
| `displayOn` | boolean \| null | LED display state |
| `filterAlert` | boolean \| null | Filter needs cleaning |
| `realTimePower` | number \| null | Current power draw (W) |
| `totalEnergyConsumption` | number \| null | Total energy consumption, using the selected format |
| `currentEnergyConsumption` | number \| null | Current-run energy consumption, using the selected format |

In Auto, state contains `"fanSpeed": "auto"`, `"fanSpeedValue": null`, and `"_raw": { "fanSpeed": 102, ... }`. The library does not expose the actual indoor fan speed in Auto. For a custom setting of 5, state contains `"fanSpeed": "custom"` and `"fanSpeedValue": 5`. Command input still accepts a name or number in `fanSpeed`.

### midea out

Sends commands to the device. Set properties in `msg.payload` — only specified properties are changed.

**Example — turn on and cool to 22°C:**

```json
{
  "powerState": true,
  "operationalMode": "cool",
  "targetTemperature": 22
}
```

**Example — just change the fan speed:**

```json
{
  "fanSpeed": "low"
}
```

**Accepted properties:**

| Property | Type | Values |
|---|---|---|
| `powerState` | boolean | `true` / `false` |
| `targetTemperature` | number | 16.0 – 30.0 (0.5 steps) |
| `operationalMode` | string \| number | `"auto"`, `"cool"`, `"dry"`, `"heat"`, `"fan_only"`, `"smart_dry"` |
| `fanSpeed` | string \| number | `"auto"`, `"max"`, `"high"`, `"medium"`, `"low"`, `"silent"` |
| `swingMode` | string \| number | `"off"`, `"vertical"`, `"horizontal"`, `"both"` |
| `turboMode` | boolean | Enable turbo |
| `ecoMode` | boolean | Enable eco |
| `sleepMode` | boolean | Enable sleep |
| `fahrenheit` | boolean | Display in Fahrenheit |
| `displayOn` | boolean | Set LED display on/off |
| `beep` | boolean | Beep on command |

| `freezeProtection` | boolean | Freeze protection |
| `followMe` | boolean | Follow Me mode |
| `purifier` | boolean | Purifier / ionizer |
| `ieco` | boolean | iECO mode |
| `flashCool` | boolean | Flash / Jet Cool |
| `outSilent` | boolean | Outdoor silent mode |
| `breezeAway` | boolean | Breeze away |
| `breezeMild` | boolean | Mild airflow |
| `breezeless` | boolean | Breezeless airflow |
| `targetHumidity` | number | Target humidity, integer 0–100% |
| `horizontalSwingAngle` | string \| number | off (0), pos_1 (1), pos_2 (25), pos_3 (50), pos_4 (75), pos_5 (100) |
| `verticalSwingAngle` | string \| number | Same values as horizontalSwingAngle |
| `cascadeMode` | string \| number | off (0), up (1), down (2) |
| `rateSelect` | string \| number | off (100), gear_50 (50), gear_75 (75), level_1 (1), level_2 (20), level_3 (40), level_4 (60), level_5 (80) |
| `auxMode` | string \| number | off (0), aux_heat (1), aux_only (2) |
| `startSelfClean` | boolean | true starts self cleaning; false does nothing |

String values are case-insensitive. Numeric enum values are also accepted; custom fan speeds use integers 1–100 on supported devices.

Features depend on your model. Capabilities are queried on connection and exposed in `payload.capabilities` (temperature bounds, supported modes/speeds and named boolean capability flags). All reads and commands sharing a device configuration are serialized.

`displayOn` refreshes the current LED state and toggles only if necessary. Unsupported display control or an unknown state produces an error instead of toggling blindly. `startSelfClean` is a separate action. Specify only one of `breezeAway`, `breezeMild`, or `breezeless` in each message because they share one airflow mode.

The state output from both nodes also includes all advanced control properties above except `startSelfClean`, plus `fahrenheit`, `beep`, `selfCleanActive`, `defrostActive`, `errorCode`, and `outdoorFanSpeed`. Advanced angle/mode/rate values are numeric library constants; unavailable sensor readings can be `null`. Existing state field names remain unchanged.

```json
{
  "verticalSwingAngle": "pos_3",
  "outSilent": true,
  "displayOn": false
}
```


`payload.capabilities.additional_capabilities` contains named booleans such as `custom_fan_speed`, `eco`, `freeze_protection`, `ieco`, `turbo`, `display_control`, `energy_stats`, `filter_reminder`, `humidity`, `target_humidity`, `swing_horizontal_angle`, `swing_vertical_angle`, `breeze_away`, `breeze_control`, `breezeless`, `cascade`, `jet_cool`, `out_silent`, `purifier`, and `self_clean`. These names follow the library constants in lowercase. The original numeric bitmask is retained in `payload._raw.additional_capabilities`.

## Credits

All reverse-engineering and protocol analysis credit goes to [Tucker Kern](https://github.com/mill1000) and [midea-msmart](https://github.com/mill1000/midea-msmart).

## License

MIT

## Testing an unpublished library fix

To create one uploadable Node-RED archive containing a locally patched `midea-local` library, build and pack the library first, then run in this repository:

```sh
bun run pack:local /absolute/path/midea-local-0.2.0.tgz 0.2.5 /absolute/output/directory
```

The helper pins the supplied library version and includes it as a bundled dependency in the resulting archive. It does not publish anything or change this checkout's dependency manifest/lockfile. Install the wrapper archive through Palette Manager, then restart the Node-RED process. The standalone library archive is not a Palette Manager module.
