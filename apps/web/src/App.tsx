import { Capacitor } from "@capacitor/core";
import { MobileConsoleApp } from "./mobile/MobileConsoleApp";
import { WebConsoleApp } from "./WebConsoleApp";

export type ConnectionMode = "cloud" | "local";

export function App() {
  return Capacitor.isNativePlatform() ? <MobileConsoleApp /> : <WebConsoleApp />;
}
