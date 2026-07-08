import { Capacitor, registerPlugin } from "@capacitor/core";
import type { ConnectionMode } from "./types";

interface Ws63SystemPlugin {
  openWifiSettings(): Promise<{ opened: boolean }>;
  connectLocalWifi(options: { ssidPrefix: string; passphrase?: string }): Promise<{ requested: boolean; openedSettings?: boolean }>;
}

const ws63System = registerPlugin<Ws63SystemPlugin>("Ws63System");

function wifiConfig(mode: ConnectionMode): { ssidPrefix: string; passphrase?: string } {
  if (mode === "gateway") {
    return {
      ssidPrefix: localStorage.getItem("ws63-gateway-wifi-ssid-prefix") || "BearPi",
      passphrase: localStorage.getItem("ws63-gateway-wifi-passphrase") || undefined
    };
  }
  return {
    ssidPrefix: localStorage.getItem("ws63-car-wifi-ssid-prefix") || "WS63",
    passphrase: localStorage.getItem("ws63-car-wifi-passphrase") || undefined
  };
}

export async function openWifiSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await ws63System.openWifiSettings();
}

export async function connectLocalWifi(mode: ConnectionMode): Promise<{ openedSettings: boolean }> {
  if (!Capacitor.isNativePlatform() || mode === "cloud") return { openedSettings: false };
  const result = await ws63System.connectLocalWifi(wifiConfig(mode));
  return { openedSettings: Boolean(result.openedSettings) };
}
