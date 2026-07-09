# Repository Guidelines

## Current Work Branch

Work on `community/ws63e-env-gateway`. Do not move this project back to `main`; `main` is kept as a backup/reference branch for this local workspace. Keep commits scoped and avoid mixing large SDK or generated churn with software platform changes.

## Project Structure

This repository combines the WS63E firmware workspace with the software platform for the environment patrol car.

- `src/` contains the WS63 SDK layout. The car firmware that matters for this project is `src/application/samples/Farsight/ws63e_env_patrol_car`.
- `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway` contains the BearPi gateway product used as the cloud uplink/base-station side.
- `apps/server` is the Node.js cloud API with SQLite, auth, device management, command queues, patrol tasks, audit logs, SSE, telemetry ingest, and rule-based Agent analysis.
- `apps/web` is the React client plus Capacitor Android shell.
- `deploy/` contains deployment, smoke-test, base-station protocol, and APK helper scripts.
- `docs/` contains project documentation, handoff docs, acceptance checklists, and protocol notes.

`fb_code/`, `ws63_docs/`, and contest-only material are local reference copies only. Keep them ignored and do not merge them into this remote branch unless the user explicitly requests it.

## Product Boundaries

The software architecture is cloud-first: the car talks to the WS63E/SLE base station, the base station uploads to the cloud server, and Web/APK clients talk to the cloud API. Do not make the Web or APK depend directly on the car LAN.

The current UX boundary is intentional:

- Browser Web is an information/base-station view for inspection, trend observation, device state, and management.
- Android APK is the phone control console, based on the Open Design landscape UI.
- Web and APK are no longer required to be visually identical. Keep API contracts consistent, but preserve their separate user roles.

Important mobile files:

- `apps/web/src/App.tsx` routes between Web and native APK behavior with Capacitor platform detection.
- `apps/web/src/WebConsoleApp.tsx` is the browser Web experience.
- `apps/web/src/mobile/MobileConsoleApp.tsx` is the APK entry.
- `apps/web/src/mobile/mobileOpenDesign.ts` injects the Open Design HTML source, bridge hooks, mobile layout patches, system-nav spacing, and touch behavior fixes.
- `apps/web/src/open-design/ws63e-inspection-app-full-8.html` is the current Open Design source of truth for the mobile console.
- `docs/mobile-opendesign-handoff.md` documents the mobile/Open Design integration.

The APK should remain landscape-only. The control page must not scroll; overview/data/management pages may scroll by repositioning existing cards while preserving Open Design interactions. The joystick and speed controls must support independent multi-touch handling.

## Hardware-First App Development

Future Web/APK work must be developed against the real hardware-side code and exposed APIs, not against guessed protocol behavior. Before changing app control, telemetry, device state, patrol, gateway, SLE, Wi-Fi, or cloud-bridge logic, inspect the relevant firmware code under `src/` and the gateway product code under `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway`.

For car-facing behavior, treat `src/application/samples/Farsight/ws63e_env_patrol_car` as the first source of truth. Also search the wider `src/` tree for exposed headers, protocol structs, command parsers, sensor data formats, motor-control limits, SLE/Wi-Fi entry points, and any API names referenced by the app or handoff docs. Use `rg` to confirm actual firmware symbols and payload fields before changing TypeScript contracts.

When the hardware currently exposes only a coarse API, keep the app backward-compatible and document any future finer-grained extension for the firmware teammate. Do not remove existing compatibility payloads until the firmware-side parser and gateway API have been updated and verified.

## Build, Test, and Development Commands

Run firmware commands from `src/`:

- `python build.py ws63` builds WS63 targets with CMake and the bundled RISC-V toolchain.
- `python build.py -c ws63` cleans before rebuilding.
- `python build.py -ninja ws63` uses Ninja when installed.
- `python build.py -component=<name> ws63` builds selected components only.

Run software commands from the repository root:

- `npm install` installs root workspace dependencies.
- `npm run dev:server` starts the cloud API locally.
- `npm run dev:web` starts the React Web client locally.
- `npm run test` runs server tests and Web type checks.
- `npm run build` builds all software workspaces.
- `npm run check:app-parity` verifies shared Web/APK client configuration.
- `npm run build:apk` builds the Capacitor Android debug APK.

Focused commands:

- `npm run test --workspace apps/server`
- `npm run build --workspace apps/server`
- `npm run test --workspace apps/web`
- `npm run build --workspace apps/web`

Cloud deployment is handled by `deploy/deploy.ps1`. The public Web path is `https://www.rxcccccc.icu/ws63/`, and the API path is `https://www.rxcccccc.icu/ws63-api/`.

## Android / Device Debugging

Prefer the user's real Android phone over an emulator unless the user explicitly asks for an emulator. The APK package is `icu.rxcccccc.ws63patrol`, and the debug APK output is `apps/web/android/app/build/outputs/apk/debug/app-debug.apk`.

After every change that affects the APK, mobile Open Design integration, Android shell, mobile networking, mobile control logic, or mobile UI layout, rebuild or sync the APK as needed, reinstall it on the user's real phone through ADB, and launch it for verification before reporting completion. Do not rely only on desktop Web preview for mobile-facing changes.

Typical Wi-Fi ADB flow:

- `adb mdns services`
- `adb connect <ip:port>`
- `adb -s <device> install -r apps/web/android/app/build/outputs/apk/debug/app-debug.apk`
- `adb -s <device> shell monkey -p icu.rxcccccc.ws63patrol -c android.intent.category.LAUNCHER 1`

## Coding Style

C and C++ firmware code should follow `.clang-format`: 4-space indentation, 120-column limit, function opening braces on a new line, control-statement braces attached, right-aligned pointers, and no automatic include sorting. Preserve existing SDK module naming patterns, product directories, and `CMakeLists.txt` organization.

TypeScript code should follow the existing `apps/server` and `apps/web` style: ESM modules, explicit domain types, focused helpers, and no broad framework rewrites. Keep API contracts stable for Web, APK, and base-station clients.

Do not reformat large vendor, SDK, toolchain, generated, or third-party directories. Avoid broad edits under `src/` or `vendor/` unless the task explicitly targets firmware.

## Testing Guidelines

Firmware changes should be validated with the narrowest successful SDK build, then hardware smoke tests when behavior touches GPIO, UART, Wi-Fi, BLE/SLE, sensors, motor control, flashing, or SLE/base-station links. Include serial logs or screenshots for hardware-facing changes.

Software changes should run `npm run test`, `npm run build`, and `npm run check:app-parity` when they touch API contracts, Web behavior, Android packaging, auth, device management, commands, patrol tasks, audit logs, telemetry ingest, deployment scripts, or mobile bridge logic.

Do not commit `.env`, SQLite databases, runtime data, generated Android build output, local screenshots, packaged archives, or GitNexus indexes.

## GitNexus

Use GitNexus for repository analysis after updating `.gitnexusignore`. The intended index scope is product code and docs, not the full WS63 SDK/toolchain.

Keep `AGENTS.md` and `.gitnexusignore` current together. When the active work branch, project structure, product boundaries, generated directories, local reference folders, or GitNexus indexing scope changes, update both files before running analysis or committing the related work. Do not let GitNexus index broad SDK/toolchain trees just because new files appeared; add targeted include/exclude rules instead.

Recommended commands from the repository root:

- `npx -y gitnexus status`
- `npx -y gitnexus analyze --skip-skills --name Hi3863 --branch community/ws63e-env-gateway --default-branch main --max-file-size 512`
- `npx -y gitnexus check --cycles --repo Hi3863 --branch community/ws63e-env-gateway`

Keep `.gitnexus/` ignored and uncommitted. Do not use `--skip-agents-md` for normal project-map refreshes; `AGENTS.md` is part of the repository operating context. If GitNexus analysis needs broader firmware context, add targeted paths to `.gitnexusignore` instead of indexing the whole SDK.

## Commit and PR Guidelines

Use short imperative commit messages such as `Add cloud software platform` or `Fix mobile control touch handling`. Keep firmware SDK changes separate from software platform changes when practical.

Pull requests should describe the affected firmware target or software module, list validation commands, include hardware logs or UI screenshots when relevant, and call out any untested hardware paths.

## Agent-Specific Rules

Prefer scoped edits in:

- `src/application/samples/Farsight/ws63e_env_patrol_car`
- `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway`
- `apps/server`
- `apps/web`
- `deploy`
- `docs`

Treat compiler binaries, PDFs, SDK output, `node_modules`, SQLite files, Android build directories, screenshots, and local contest materials as reference or generated artifacts unless the task explicitly targets them.
