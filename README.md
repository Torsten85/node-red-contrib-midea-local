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

- **Scan Network** — discovers Midea devices on your local network via UDP broadcast
- **Authorize** — one-time cloud authentication for V3 devices to fetch the device token and key. Your Midea account credentials are used only during this step and are **never stored**
- **Auto-reconnect** — connection is automatically re-established with exponential backoff (1s → 60s)

### midea in

Reads the current device state when triggered by an input message. Use an **inject** node upstream to poll at your desired interval.

**Output `msg.payload`:**

| Property | Type | Description |
|---|---|---|
| `powerState` | boolean | Power on/off |
| `targetTemperature` | number | Set temperature in °C |
| `indoorTemperature` | number \| null | Measured indoor temp |
| `outdoorTemperature` | number \| null | Measured outdoor temp |
| `operationalMode` | string | `"auto"`, `"cool"`, `"dry"`, `"heat"`, `"fan_only"` |
| `fanSpeed` | string | `"auto"`, `"max"`, `"high"`, `"medium"`, `"low"`, `"silent"` |
| `swingMode` | string | `"off"`, `"vertical"`, `"horizontal"`, `"both"` |
| `turboMode` | boolean | Turbo on/off |
| `ecoMode` | boolean | Eco on/off |
| `sleepMode` | boolean | Sleep on/off |
| `indoorHumidity` | number \| null | Indoor humidity % |
| `displayOn` | boolean \| null | LED display state |
| `filterAlert` | boolean \| null | Filter needs cleaning |
| `realTimePower` | number \| null | Current power draw (W) |

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
| `operationalMode` | string \| number | `"auto"`, `"cool"`, `"dry"`, `"heat"`, `"fan_only"` |
| `fanSpeed` | string \| number | `"auto"`, `"max"`, `"high"`, `"medium"`, `"low"`, `"silent"` |
| `swingMode` | string \| number | `"off"`, `"vertical"`, `"horizontal"`, `"both"` |
| `turboMode` | boolean | Enable turbo |
| `ecoMode` | boolean | Enable eco |
| `sleepMode` | boolean | Enable sleep |
| `fahrenheit` | boolean | Display in Fahrenheit |
| `displayOn` | boolean | Toggle LED display |
| `beep` | boolean | Beep on command |

String values are case-insensitive. Numeric enum values are also accepted.

## Credits

All reverse-engineering and protocol analysis credit goes to [Tucker Kern](https://github.com/mill1000) and [midea-msmart](https://github.com/mill1000/midea-msmart).

## License

MIT
