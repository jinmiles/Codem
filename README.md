# Codem - Codex Usage Monitor

Codem is named from **Codex** + **meter**.

A lightweight desktop usage meter that displays Codex 5-hour and weekly usage
from the system status area.

Codem currently ships a GNOME Shell extension and a native macOS menu bar app.
The TypeScript codebase keeps platform-neutral usage parsing, formatting, and
state logic in `src/core/`, while `src/extension.ts` contains the GNOME Shell
integration. The macOS app lives in `macos/` and uses Swift/AppKit instead of
Electron so the menu bar runtime stays small.

## Features

| Feature           | Description                                                  |
|-------------------|--------------------------------------------------------------|
| Status indicator  | Shows 5-hour and weekly usage percentages at a glance        |
| Color coding      | OK (green) -> Warning (amber) -> Critical (red) -> Depleted  |
| Countdown         | Counts down to the next reset in real time (per-second tick) |
| Detail menu       | Shows reset countdowns, email, plan type, and account status |
| Auto-refresh      | Polls the API every 60 seconds; manual refresh button        |

## Requirements

- GNOME Shell 3.36 or later, or macOS 12 or later
- `~/.codex/auth.json` present (Codex CLI must be logged in)

## GNOME Installation

Download `codem-v{version}.zip` from the GitHub Release page, then install it into
GNOME Shell:

```bash
gnome-extensions install --force codem-v{version}.zip
gnome-extensions enable codem@jinmiles.github.io
```

Replace `{version}` with the release version, for example `0.1.0`.

Then restart GNOME Shell:

- **X11:** `Alt + F2` -> type `r` -> `Enter`
- **Wayland:** log out and log back in

## GNOME Build From Source

```bash
npm ci
npm run build
```

TypeScript compiles all source files into the single GNOME Shell entry point
`build/extension.js`.

To create a local installable bundle:

```bash
version="$(node -p "require('./package.json').version")"
mkdir -p dist/codem release
cp build/extension.js dist/codem/extension.js
cp src/metadata.json dist/codem/metadata.json
cp src/stylesheet.css dist/codem/stylesheet.css
(cd dist/codem && zip -r "../../release/codem-v$version.zip" .)
```

## macOS Build From Source

For releases, download `codem-macos-v{version}.zip`, unzip it, and open
`Codem.app`.

The release app is currently unsigned. If macOS blocks it, open it from Finder
with **Right click** -> **Open**.

Replace `{version}` with the release version, for example `0.1.0`.

Build the native menu bar app with Swift Package Manager:

```bash
swift build --package-path macos
```

Run it directly while developing:

```bash
swift run --package-path macos CodemMac
```

The macOS app reads `~/.codex/auth.json`, polls the same Codex usage API, and
adds a compact `Codem` item to the menu bar.
