# Codem - Codex Usage Monitor

A personal GNOME Shell extension that displays Codex 5-hour and weekly usage
in the top bar with color-coded states, live countdowns, and a detailed popup.

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

```bash
cd ~/extra_workdir/Codem
bash install.sh
```

Then restart GNOME Shell:

- **X11:** `Alt + F2` -> type `r` -> `Enter`
- **Wayland:** log out and log back in

## Color states

```
used_percent   state       background
-----------    ---------   ----------
  0 - 59%      ok          #1a9e5f  (green)
 60 - 79%      warning     #d97706  (amber)
 80 - 94%      critical    #dc2626  (red)
 95 - 100%     depleted    #7f1d1d  (dark red)
```

The pill background and popup percentage labels change automatically based
on the higher of the two window percentages.

## Auth file format

`~/.codex/auth.json`:
```json
{
  "auth_mode": "chatgpt",
  "tokens": {
    "access_token": "...",
    "id_token": "...",
    "refresh_token": "...",
    "account_id": "..."
  },
  "last_refresh": "2026-05-14T07:40:07Z"
}
```

## Debugging

```bash
# Stream GNOME Shell logs and filter to Codem output
journalctl -f -o cat /usr/bin/gnome-shell | grep -i codem
```

## File structure

```
Codem/
├── install.sh
├── README.md
├── AGENTS.md
└── src/
    ├── metadata.json    extension manifest
    ├── extension.js     core logic (API, UI, timers)
    └── stylesheet.css   styles (pill, popup layout)
```
