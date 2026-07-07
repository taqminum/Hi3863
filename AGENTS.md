# Repository Guidelines

## Project Structure & Module Organization

This repository combines the WS63E firmware workspace with the software platform for the environment patrol car. Firmware sources live at the repository root SDK layout: `src/` for core SDK and application code, `vendor/` for board and product demos, `tools/` for SDK tooling, and `docs/` for firmware/project documents. The main car firmware is under `src/application/samples/Farsight/ws63e_env_patrol_car`; the BearPi gateway product is under `vendor/BearPi-Pico_H3863/products/ws63e_env_gateway`.

Software-side code lives under `apps/`. `apps/server` is the Node.js cloud API with SQLite, auth, device management, command queues, patrol tasks, audit logs, SSE, and rule-based agent analysis. `apps/web` is the React Web client and Capacitor Android shell. Deployment, smoke-test, base-station protocol, and APK helper scripts live in `deploy/`.

`fb_code/`, `ws63_docs/`, and contest-only material are local reference copies only. Keep them ignored and do not merge them into this remote branch unless the user explicitly requests that.

## Build, Test, and Development Commands

Run firmware commands from `src/`:

- `python build.py ws63` builds WS63 targets using CMake plus the bundled RISC-V toolchain.
- `python build.py -c ws63` cleans before rebuilding.
- `python build.py -ninja ws63` uses Ninja when installed.
- `python build.py -component=<name> ws63` builds selected components only.

Run software commands from the repository root:

- `npm install` installs root workspace dependencies.
- `npm run dev:server` starts the cloud API locally.
- `npm run dev:web` starts the React Web client locally.
- `npm run test` runs server tests and Web type checks.
- `npm run build` builds all software workspaces.
- `npm run check:app-parity` verifies Web and APK client configuration parity.
- `npm run build:apk` builds the Capacitor Android debug APK.

Cloud deployment is handled by `deploy/deploy.ps1`; base-station API details are in `deploy/base-station-api.md`.

## Coding Style & Naming Conventions

C and C++ firmware code should follow `.clang-format`: 4-space indentation, 120-column limit, function opening braces on a new line, control-statement braces attached, right-aligned pointers, and no automatic include sorting. Preserve existing SDK module naming patterns, product directories, and `CMakeLists.txt` organization.

TypeScript code should follow the existing `apps/server` and `apps/web` style: ESM modules, explicit domain types, focused helpers, and no broad framework rewrites. Keep API contracts stable for Web, APK, and base-station clients.

## Testing Guidelines

Firmware changes should be validated with the narrowest successful SDK build, then hardware smoke tests when behavior touches GPIO, UART, Wi-Fi, BLE/SLE, sensors, motor control, or flashing. Include serial logs or screenshots for hardware-facing changes.

Software changes should run `npm run test`, `npm run build`, and `npm run check:app-parity` when they touch API contracts, Web behavior, Android packaging, auth, device management, commands, patrol tasks, audit logs, telemetry ingest, or deployment scripts. Do not commit `.env`, SQLite databases, runtime data, or generated Android build output.

## Commit & Pull Request Guidelines

Use short imperative commit messages such as `Add cloud software platform` or `Fix gateway telemetry ingest`. Keep firmware SDK churn separate from software platform changes when practical. Pull requests should describe the affected firmware target or software module, list validation commands, include hardware logs or UI screenshots when relevant, and call out any untested hardware paths.

## Agent-Specific Instructions

Prefer scoped edits in `src/application/`, the relevant `vendor/<board>/` product, `apps/server`, `apps/web`, or `deploy/`. Do not reformat large vendor, SDK, toolchain, or generated directories. Treat compiler binaries, PDFs, SDK output, `node_modules`, SQLite files, Android build directories, and local contest materials as reference or generated artifacts unless the task explicitly targets them.
