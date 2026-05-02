export type CasaLumeDeviceType =
  | "light"
  | "switch"
  | "plug"
  | "relay"
  | "sensor_temperature"
  | "sensor_humidity"
  | "sensor_motion"
  | "sensor_door"
  | "climate"
  | "tv"
  | "cover"
  | "battery"
  | "solar_inverter"
  | "meter"
  | "camera"
  | "unknown";

export function normalizeDeviceType(device: any): CasaLumeDeviceType {
  const text = [
    device?.name,
    device?.brand,
    device?.model,
    device?.protocol,
    device?.type
  ].filter(Boolean).join(" ").toLowerCase();

  if (text.includes("solar") || text.includes("inverter") || text.includes("pv")) return "solar_inverter";
  if (text.includes("tv") || text.includes("webos") || text.includes("cast") || text.includes("chromecast")) return "tv";
  if (text.includes("shelly") || text.includes("relay") || text.includes("switch")) return "switch";
  if (text.includes("plug") || text.includes("tomada")) return "plug";
  if (text.includes("light") || text.includes("lamp") || text.includes("bulb") || text.includes("lâmpada")) return "light";
  if (text.includes("temperature") || text.includes("temperatura")) return "sensor_temperature";
  if (text.includes("humidity") || text.includes("humidade")) return "sensor_humidity";
  if (text.includes("motion") || text.includes("movimento")) return "sensor_motion";
  if (text.includes("door") || text.includes("janela") || text.includes("porta")) return "sensor_door";
  if (text.includes("meter") || text.includes("energy")) return "meter";
  if (text.includes("camera")) return "camera";

  return "unknown";
}

export function capabilitiesForType(type: CasaLumeDeviceType) {
  const base = ["online", "lastSeen"];

  const map: Record<CasaLumeDeviceType, string[]> = {
    light: [...base, "onOff", "brightness", "colorTemperature"],
    switch: [...base, "onOff", "power"],
    plug: [...base, "onOff", "power", "energy"],
    relay: [...base, "onOff", "power"],
    sensor_temperature: [...base, "temperature", "battery"],
    sensor_humidity: [...base, "humidity", "battery"],
    sensor_motion: [...base, "motion", "battery"],
    sensor_door: [...base, "openClose", "battery"],
    climate: [...base, "temperature", "targetTemperature", "mode"],
    tv: [...base, "power", "volume", "input"],
    cover: [...base, "openClose", "position"],
    battery: [...base, "battery", "charging"],
    solar_inverter: [...base, "pvPower", "loadPower", "battery", "gridPower"],
    meter: [...base, "power", "energy", "voltage"],
    camera: [...base, "snapshot", "stream"],
    unknown: base
  };

  return map[type] ?? base;
}
