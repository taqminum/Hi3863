import { Capacitor } from "@capacitor/core";
import { MobileConsoleApp } from "./mobile/MobileConsoleApp";
import { WebConsoleApp } from "./WebConsoleApp";

export function App() {
  return Capacitor.isNativePlatform() ? <MobileConsoleApp /> : <WebConsoleApp />;
}
