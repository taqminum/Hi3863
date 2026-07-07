import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const expected = {
  appId: "icu.rxcccccc.ws63patrol",
  appName: "WS63 环境巡检平台",
  apiBaseUrl: "https://www.rxcccccc.icu/ws63-api",
  tabs: ["总览", "遥控", "巡检", "数据", "管理"],
  openDesignClasses: ["device-container", "top-bar", "side-nav", "view-overview", "view-control", "view-tasks", "view-data", "view-manage"]
};

function read(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), "utf8");
}

function assertContains(file, content, label) {
  if (!content.includes(label)) {
    throw new Error(`${file} is missing ${label}`);
  }
}

const checks = [];
function check(name, task) {
  try {
    task();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

check("Capacitor app id/name", () => {
  const file = "apps/web/capacitor.config.ts";
  const content = read(file);
  assertContains(file, content, expected.appId);
  assertContains(file, content, expected.appName);
});

check("Android native app label", () => {
  const file = "apps/web/android/app/src/main/res/values/strings.xml";
  const content = read(file);
  assertContains(file, content, `<string name="app_name">${expected.appName}</string>`);
  assertContains(file, content, `<string name="title_activity_main">${expected.appName}</string>`);
});

check("Web navigation exposes Open Design acceptance tabs", () => {
  const file = "apps/web/src/components/Shell.tsx";
  const content = read(file);
  for (const tab of expected.tabs) {
    assertContains(file, content, tab);
  }
});

check("Web uses Open Design shell classes", () => {
  const files = [
    "apps/web/src/components/Shell.tsx",
    "apps/web/src/views/Overview.tsx",
    "apps/web/src/views/Control.tsx",
    "apps/web/src/views/Patrol.tsx",
    "apps/web/src/views/HistoryView.tsx",
    "apps/web/src/views/DeviceView.tsx",
    "apps/web/src/styles.css"
  ];
  const content = files.map(read).join("\n");
  for (const className of expected.openDesignClasses) {
    assertContains("Open Design web UI", content, className);
  }
});

check("APK web assets use cloud API", () => {
  const assetsDir = path.join(repo, "apps/web/android/app/src/main/assets/public/assets");
  const jsFiles = fs.readdirSync(assetsDir).filter((name) => name.endsWith(".js"));
  if (jsFiles.length === 0) {
    throw new Error("No Android web asset JavaScript files found. Run npm run build:apk first.");
  }
  const bundle = jsFiles.map((file) => fs.readFileSync(path.join(assetsDir, file), "utf8")).join("\n");
  assertContains("android web assets", bundle, expected.apiBaseUrl);
  if (bundle.includes("http://localhost:8787")) {
    throw new Error("Android web assets still contain local API URL");
  }
});

check("APK output exists", () => {
  const apk = path.join(repo, "apps/web/android/app/build/outputs/apk/debug/app-debug.apk");
  const stat = fs.statSync(apk);
  if (stat.size < 1024 * 1024) {
    throw new Error(`APK looks too small: ${stat.size} bytes`);
  }
});

for (const result of checks) {
  console.log(`${result.ok ? "ok" : "fail"} - ${result.name}${result.ok ? "" : `: ${result.error}`}`);
}

if (checks.some((result) => !result.ok)) {
  process.exit(1);
}
