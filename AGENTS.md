---
description: Repository-wide coding and contribution rules
globs:
  - "**/*"
alwaysApply: true
---

# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project overview

**Codem** is a personal GNOME Shell extension that monitors Codex usage
in real time from the GNOME top bar.

- **Auth**: `~/.codex/auth.json` -> `tokens.access_token`
- **API**: `GET https://chatgpt.com/backend-api/wham/usage`
- **Display**: 5-hour window (`primary_window`) + weekly window (`secondary_window`) usage

## File structure

```
Codem/
├── AGENTS.md               <- this file
├── install.sh              <- install script
├── README.md               <- user guide
└── src/                        <- GNOME Shell extension source
    ├── metadata.json       <- extension manifest
    ├── extension.js        <- main extension logic
    └── stylesheet.css      <- UI styles
```

## Development rules

### Code style

- **Legacy compatibility**: use GNOME 3.36 style (`imports.gi.*`, `imports.ui.*`)
- Always include `'use strict';`
- All comments, log messages, and UI strings must be in **English**
- No emoji in source files
- Use `log('[Codem] ...')` format for log tags

### API response structure

```json
{
  "rate_limit": {
    "primary_window": {
      "used_percent": 73,
      "limit_window_seconds": 18000,
      "reset_after_seconds": 13046,
      "reset_at": 1779089766
    },
    "secondary_window": {
      "used_percent": 11,
      "limit_window_seconds": 604800,
      "reset_after_seconds": 599846,
      "reset_at": 1779676566
    }
  }
}
```

### Color state thresholds (based on used_percent)

| Range   | State    | Background |
|---------|----------|------------|
| 0-59%   | ok       | `#1a9e5f`  |
| 60-79%  | warning  | `#d97706`  |
| 80-94%  | critical | `#dc2626`  |
| 95%+    | depleted | `#7f1d1d`  |

### Timers

- **Polling**: API re-fetch every 60 seconds (`POLL_SECONDS = 60`)
- **Tick**: local countdown decrement every 1 second (`TICK_SECONDS = 1`)
- Both timers must be removed in `disable()`

### Install path

```
~/.local/share/gnome-shell/extensions/codem@jinmiles.github.io/
```

## Modification checklist

- [ ] After editing `extension.js`, re-run `install.sh`
- [ ] Check for errors: `journalctl -f -o cat /usr/bin/gnome-shell`
