# Codem - Codex Usage Monitor

Codem is named from **Codex** + **meter**.

A personal GNOME Shell extension that displays Codex 5-hour and weekly usage
in the top bar with color-coded states, live countdowns, and a detailed popup.

The codebase keeps platform-neutral usage parsing, formatting, and state logic
in `src/core/`, while `src/extension.ts` contains the GNOME Shell integration.
This keeps the current GNOME extension small while leaving room for future
macOS, Windows, or other desktop clients to share the same core logic.

## Features

| Feature           | Description                                                  |
|-------------------|--------------------------------------------------------------|
| Top-bar pill      | Shows 5-hour and weekly usage percentages at a glance        |
| Color coding      | OK (green) -> Warning (amber) -> Critical (red) -> Depleted  |
| Countdown         | Counts down to the next reset in real time (per-second tick) |
| Popup detail      | Block progress bar, exact reset time, email, plan type       |
| Auto-refresh      | Polls the API every 60 seconds; manual refresh button        |

## Requirements

- GNOME Shell 3.36 or later
- `~/.codex/auth.json` present (Codex CLI must be logged in)

## Installation

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

## Build From Source

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
