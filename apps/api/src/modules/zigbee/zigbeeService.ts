import fs from "fs";

const CONFIG_PATH = "/zigbee2mqtt-data/configuration.yaml";
const DEVICES_PATH = "/zigbee2mqtt-data/devices.yaml";

function parseDevicesYaml(content: string) {
  const devices: any[] = [];
  const lines = content.split("\n");

  let current: any = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r/g, "");

    if (!line.trim()) continue;

    if (!line.startsWith("  ") && line.includes(":")) {
      if (current) devices.push(current);

      const key = line.split(":")[0].trim();

      current = {
        ieeeAddress: key,
        friendlyName: key,
        type: "unknown",
        manufacturer: "",
        model: "",
        battery: null,
        lqi: null,
        room: "Por atribuir"
      };
      continue;
    }

    if (!current) continue;

    const trimmed = line.trim();

    if (trimmed.startsWith("friendly_name:")) {
      current.friendlyName = trimmed.replace("friendly_name:", "").trim();
    }

    if (trimmed.startsWith("model:")) {
      current.model = trimmed.replace("model:", "").trim();
    }

    if (trimmed.startsWith("vendor:")) {
      current.manufacturer = trimmed.replace("vendor:", "").trim();
    }

    if (trimmed.startsWith("description:")) {
      current.type = trimmed.replace("description:", "").trim();
    }
  }

  if (current) devices.push(current);

  return devices;
}

export function getZigbeeDevices() {
  if (!fs.existsSync(DEVICES_PATH)) return [];
  return parseDevicesYaml(fs.readFileSync(DEVICES_PATH, "utf-8"));
}

export function getZigbeeStatus() {
  const config = fs.existsSync(CONFIG_PATH)
    ? fs.readFileSync(CONFIG_PATH, "utf-8")
    : "";

  return {
    bridge: "online",
    permitJoin: config.includes("permit_join: true"),
    devices: getZigbeeDevices().length,
    coordinator: "Sonoff Zigbee 3.0 USB Dongle Plus"
  };
}

export function setPermitJoin(enabled: boolean) {
  if (!fs.existsSync(CONFIG_PATH)) return false;

  let content = fs.readFileSync(CONFIG_PATH, "utf-8");

  if (content.match(/permit_join:\s*(true|false)/)) {
    content = content.replace(/permit_join:\s*(true|false)/, `permit_join: ${enabled ? "true" : "false"}`);
  } else {
    content = `permit_join: ${enabled ? "true" : "false"}\n${content}`;
  }

  fs.writeFileSync(CONFIG_PATH, content, "utf-8");
  return true;
}
