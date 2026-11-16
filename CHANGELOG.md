# Changelog

## 0.2.5

- Add a second output for capabilities on both nodes, emitted after connection and when capabilities change.
- Add an option to omit capabilities from the state output; existing flows retain them by default.

## 0.2.4

- Remove force energy polling from configuration and runtime; polling follows the device’s reported energy capability. Previously saved force settings are ignored.

## 0.2.3

- Add local packaging with a pinned, bundled midea-local library so unpublished fixes can be tested with one Palette Manager upload.

## 0.2.2

- Add named boolean capability overrides in device configuration, applied after discovery on every connection while preserving unspecified flags.

## 0.2.1

- Add device configuration options to force energy polling and select BCD or Binary decoding for both nodes.
- Separate fan state into text `fanSpeed` and numeric `fanSpeedValue`; Auto reports null for the numeric setting and retains protocol code 102 in `_raw.fanSpeed`.
- Decode additional capability flags into named booleans and retain the original bitmask in `_raw.additional_capabilities`.

## 0.2.0

- Expose advanced AC controls: humidity target, freeze protection, Follow Me, purifier, iECO, Flash Cool, outdoor silent, louver angles, cascade, power limits, auxiliary heating, breeze modes, and self cleaning.
- Add the `smart_dry` operating mode name and expanded state/capability output.
- Query capabilities on connection and request Group 5 sensor data.
- Set the LED display to the requested state instead of toggling unconditionally; fail safely when the state is unknown.
- Serialize reads and commands per device and validate complete commands before applying changes.
- Update `midea-local` to ^0.1.2 and refresh the lockfile.
