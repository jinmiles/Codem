# AGENTS.md

Instructions for AI coding agents working in this repository.

## Mission

Codem is a personal GNOME Shell extension that monitors Codex usage in real
time from the GNOME top bar. Preserve GNOME Shell compatibility, the extension
installation workflow, and the Codex usage display behavior while keeping
changes small and easy to validate.

## Ground Rules

* Treat this file as the highest-priority repository guidance after direct user
  instructions.
* Read the relevant code before editing. Prefer small, targeted changes that
  match the existing TypeScript and GJS style.
* Preserve existing user changes. Check `git status --short` before editing and
  avoid reverting unrelated modifications.
* Do not commit generated artifacts, caches, local datasets, binaries, build
  outputs, temporary files, logs, screenshots, or secrets.
* Do not commit `node_modules/`, `build/`, `.agent/`, `.vscode/`, or local
  GNOME/runtime output.
* Avoid unnecessary dependency installation, dependency upgrades, or changes to
  lockfiles unless the task requires them.
* Keep comments, log messages, and user-facing strings in English.
* Do not add emoji to source files.

## Project Overview

Codem reads the local Codex auth file and calls the Codex usage endpoint:

* Auth file: `~/.codex/auth.json`
* Token path: `tokens.access_token`
* API endpoint: `GET https://chatgpt.com/backend-api/wham/usage`
* Display: 5-hour window (`primary_window`) and weekly window
  (`secondary_window`) usage

The expected rate-limit shape is:

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

## Repository Structure

```text
Codem/
├── AGENTS.md
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
└── src/
    ├── core/
    │   ├── constants.ts
    │   ├── format.ts
    │   ├── types.ts
    │   └── usage.ts
    ├── extension.ts
    ├── metadata.json
    └── stylesheet.css
```

Important paths:

* `src/core/`: platform-neutral Codex usage types, constants, formatting, and
  response helpers.
* `src/extension.ts`: GNOME Shell extension integration, local auth reading,
  API polling, UI, and timers.
* `src/metadata.json`: GNOME Shell extension manifest.
* `src/stylesheet.css`: popup and top-bar styling.
* `build/extension.js`: generated build output. Do not commit it.

Installed extension path:

```text
~/.local/share/gnome-shell/extensions/codem@jinmiles.github.io/
```

## Environment

* Use npm as the dependency manager.
* Use the TypeScript compiler configured by `tsconfig.json`.
* Compile all TypeScript sources into the single GNOME Shell entry point
  `build/extension.js`.
* Keep the generated JavaScript compatible with GNOME Shell's GJS runtime.
* Keep GNOME legacy compatibility in mind: prefer the existing
  `imports.gi.*` and `imports.ui.*` pattern.

## Common Commands

Install dependencies when needed:

```bash
npm ci
```

Build the extension:

```bash
npm run build
```

Stream GNOME Shell logs while debugging:

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

## Validation

Use the smallest validation step that reasonably covers the change.

* For TypeScript or extension logic changes, run:

  ```bash
  npm run build
  ```

* For GNOME runtime issues, inspect:

  ```bash
  journalctl -f -o cat /usr/bin/gnome-shell
  ```

If validation cannot be run because GNOME Shell, credentials, network access, or
the local desktop session is unavailable, mention that clearly in the final
response.

## Runtime Reload

* After changing extension source, styles, metadata, or installed runtime files,
  build the extension, sync the changed runtime files into the installed
  extension directory, and restart the GNOME extension when a local desktop
  session is available.
* Restart the extension by disabling and re-enabling
  `codem@jinmiles.github.io`; do not restart the whole GNOME Shell unless the
  change specifically requires it.

## Coding Style

* Always include `'use strict';` in runtime source where applicable.
* Follow the existing TypeScript/GJS style in `src/extension.ts`.
* Put platform-neutral usage parsing, formatting, state, and type definitions
  under `src/core/`.
* Keep GNOME-specific APIs such as `imports.gi.*`, `imports.ui.*`, `Gio`, and
  `Soup` in `src/extension.ts`.
* Keep the generated GNOME runtime JavaScript lightweight. Avoid adding runtime
  dependencies, broad framework code, or heavy abstractions to
  `build/extension.js`.
* Use `log('[Codem] ...')` for extension log messages.
* Prefer readable, maintainable code over clever abstractions.
* Keep comments concise and focused on non-obvious GJS, GNOME Shell, API, or
  timer behavior.
* Prefer structured JSON handling and standard APIs over ad hoc parsing.
* Keep CLI defaults, configuration behavior, README content, and installation
  behavior aligned.
* Preserve the 60-second API polling cadence and 1-second local countdown tick
  unless the user explicitly asks to change them.
* Remove polling and tick timers in `disable()`.

## UI And Behavior

* The top-bar indicator should remain compact and readable.
* The extension displays both 5-hour and weekly usage percentages.
* Color and state logic should stay consistent across the pill, popup labels,
  and progress bars.
* Do not expose auth tokens, raw API payloads, or private user data in logs.
* Keep user-facing labels concise and in English.

## Git And Commits

* Do not create commits without explicit user confirmation.
* When a meaningful unit of work is complete, it is acceptable to suggest a
  commit.
* Before committing, review `git status --short` and include only intended
  changes.
* Do not stage or modify unrelated user work.
* Write commit messages in English.
* Prefer concise conventional commit formatting:

  ```text
  <type>: <description>
  ```

* Recommended commit types: `feat`, `fix`, `refactor`, `docs`, `test`,
  `chore`, `perf`, `build`, `ci`.
* Before committing, run the smallest relevant validation step when feasible
  and mention any validation that could not be run.

## Data And Safety

* Do not expose secrets, tokens, credentials, personal data, or proprietary
  assets in code, logs, commits, screenshots, or documentation.
* Never commit real `~/.codex/auth.json` contents.
* Use placeholder values in examples.
* Avoid printing large API payloads or full auth files.
* Do not make unsupported claims about correctness, safety, performance, or
  security.

## Change Checklist

Before finishing:

1. Confirm `git status --short` only shows intended changes, plus any
   pre-existing user modifications.
2. Run `npm run build` for code changes when feasible.
3. Restart the installed GNOME extension after extension runtime changes when a
   local desktop session is available.
4. Update documentation if behavior, setup, interfaces, configuration, or
   outputs changed.
5. Mention any validation that could not be run because of missing credentials,
   GNOME Shell access, network access, external services, or environment
   constraints.
6. Ensure no generated artifacts, secrets, or temporary files were accidentally
   added to tracked changes.
