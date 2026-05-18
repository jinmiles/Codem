# Codem - Codex Usage Meter

Codem is named from **Codex** + **meter**.

Codem is a lightweight cross-platform desktop app that shows Codex 5-hour and
weekly usage from the system tray or macOS menu bar.

## Features

| Feature | Description |
| --- | --- |
| Tray-first UI | Runs from the Linux system tray or macOS menu bar |
| Usage windows | Shows 5-hour and weekly usage percentages |
| Countdown | Updates reset countdowns locally every second |
| Auto-refresh | Polls Codex usage every 60 seconds |
| Manual refresh | Refreshes usage from the app window or tray menu |

## Requirements

- Linux with a working system tray/AppIndicator environment, or macOS 12 or later
- `~/.codex/auth.json` present
- Codex CLI logged in so `tokens.access_token` exists in the auth file

Codem reads:

```text
~/.codex/auth.json
```

and calls:

```text
GET https://chatgpt.com/backend-api/wham/usage
```

## Install From Release

Download the asset for your platform from the GitHub Release page:

- Linux: `.AppImage` or `.deb`
- macOS: `.dmg`

Release assets are built from the shared Tauri app. The release version is
encoded in the generated installer names.

## Build From Source

Install Node.js 20, Rust stable, and the Tauri system dependencies for your
platform.

Linux build dependencies on Ubuntu:

```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf
```

Then build:

```bash
npm ci
npm run build
npm run tauri:build
```

Run while developing:

```bash
npm run tauri dev
```

Run tests:

```bash
npm test
cargo run --manifest-path src-tauri/Cargo.toml -- --self-test
```

## Project Structure

```text
Codem/
├── src/                    # Vite TypeScript frontend
├── src-tauri/              # Tauri Rust app
│   ├── src/lib.rs          # tray, polling, commands
│   ├── src/main.rs         # app entry point and self-test entry
│   ├── src/usage.rs        # auth, API, parsing, formatting
│   └── tauri.conf.json     # Tauri config and bundle targets
├── .github/workflows/      # Linux/macOS build and release workflow
├── AGENTS.md
├── README.md
├── package.json
└── tsconfig.json
```

## Notes

- Linux tray behavior depends on the desktop environment. GNOME may require an
  AppIndicator-compatible tray extension.
- The macOS release is unsigned unless a signing identity is configured outside
  this repository.
- Codem does not log auth tokens or raw API payloads.
