import { getDeviceByDeviceId, updateDeviceState } from "./devicesService.js";

async function fetchJson(url: string, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function isShelly(device: any) {
  return String(device?.brand ?? "").toLowerCase().includes("shelly")
    || String(device?.protocol ?? "").toLowerCase().includes("shelly");
}

async function getShellyStatus(ip: string) {
  try {
    return await fetchJson(`http://${ip}/rpc/Switch.GetStatus?id=0`);
  } catch {
    return await fetchJson(`http://${ip}/relay/0`);
  }
}

async function setShellyState(ip: string, on: boolean) {
  try {
    await fetchJson(`http://${ip}/rpc/Switch.Set?id=0&on=${on ? "true" : "false"}`);
    return await getShellyStatus(ip);
  } catch {
    const turn = on ? "on" : "off";
    await fetchJson(`http://${ip}/relay/0?turn=${turn}`);
    return await getShellyStatus(ip);
  }
}

export async function refreshDevice(deviceId: string) {
  const device = getDeviceByDeviceId(deviceId);

  if (!device) {
    return { ok: false, error: "Dispositivo não encontrado" };
  }

  if (!isShelly(device)) {
    return { ok: false, error: "Refresh real ainda só está ativo para Shelly WiFi" };
  }

  const state = await getShellyStatus(device.ip || "");
  updateDeviceState(deviceId, state);

  return {
    ok: true,
    deviceId,
    state
  };
}

export async function controlDevice(deviceId: string, action: string) {
  const device = getDeviceByDeviceId(deviceId);

  if (!device) {
    return { ok: false, error: "Dispositivo não encontrado" };
  }

  if (!isShelly(device)) {
    return { ok: false, error: "Controlo real ainda só está ativo para Shelly WiFi" };
  }

  const current = await getShellyStatus(device.ip || "");
  const currentOn = Boolean(current?.output ?? current?.ison ?? false);

  let nextOn = currentOn;

  if (action === "turnOn") nextOn = true;
  if (action === "turnOff") nextOn = false;
  if (action === "toggle") nextOn = !currentOn;

  const state = await setShellyState(device.ip || "", nextOn);
  updateDeviceState(deviceId, state);

  return {
    ok: true,
    deviceId,
    action,
    state
  };
}
