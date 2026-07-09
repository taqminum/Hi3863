# Mobile UI Handoff

The Android APK currently uses a hybrid mobile shell.

- `overview`, `control`, `data`, and `manage` still render through the Open Design iframe source at `apps/web/src/open-design/ws63e-inspection-app-full-8.html`.
- `tasks` / `巡检` is React-owned and implemented under `apps/web/src/mobile/patrol/`.
- The React patrol page must visually replicate the current APK patrol tab. It is a rendering-path migration, not a redesign.

The browser Web route remains the current information dashboard and is not required to match the APK.

Do not edit the original Open Design chart, modal, tooltip, time-toggle, nav, joystick, or speed-slider logic for layout changes. APK adaptation for the iframe-owned tabs is done by `apps/web/src/mobile/mobileOpenDesign.ts`, which injects only outer landscape CSS and additive host bridge code.

The Android orientation lock is in:

`apps/web/android/app/src/main/AndroidManifest.xml`

The APK mobile route is selected in:

`apps/web/src/App.tsx`

When `Capacitor.isNativePlatform()` is true, the app renders `apps/web/src/mobile/MobileConsoleApp.tsx`. Browser Web keeps using `apps/web/src/WebConsoleApp.tsx`.
