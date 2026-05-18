# AGENTS.md

Instructions for AI coding agents working in this repository.

## Mission

This repository is a project-owned codebase built on top of internal modules,
external libraries, frameworks, models, or upstream dependencies. Preserve
project-specific behavior, interfaces, documentation, and workflows while
keeping third-party dependencies clean and minimally modified.

## Ground Rules

* Treat this file as the highest-priority repository guidance after direct user
  instructions.
* Read the relevant code before editing. Prefer small, targeted changes that
  match the existing style and architecture.
* Avoid modifying vendored, generated, mirrored, or upstream third-party code
  unless the user explicitly requests an upstream patch or dependency change.
  Prefer integration code inside the main project package, application layer,
  scripts, adapters, or wrappers.
* Do not commit generated artifacts, caches, local datasets, model weights,
  binaries, build outputs, temporary files, logs, screenshots, or secrets.
* Preserve existing user changes. Check `git status --short` before editing and
  avoid reverting unrelated modifications.
* Keep generated outputs deterministic where practical. Avoid hidden global
  state unless explicitly required by the project architecture.
* When running experiments, tests, or temporary validation scripts, isolate
  them in a dedicated directory under `tests/`, `scratch/`, or another
  repository-approved workspace.

## Git And Commits

* Do not create commits without explicit user confirmation.

* When a meaningful unit of work is complete, it is acceptable to suggest a
  commit.

* Before committing, review `git status --short` and include only intended
  changes.

* Do not stage or modify unrelated user work.

* Write commit messages in English unless the repository explicitly uses
  another language.

* Prefer concise conventional commit formatting:

  ```text
  <type>: <description>

  [optional body]

  [optional footer(s)]
  ```

* Recommended commit types:

  * `feat`: new functionality.
  * `fix`: bug fixes.
  * `refactor`: internal restructuring without behavior changes.
  * `docs`: documentation updates.
  * `test`: test-related changes.
  * `chore`: maintenance or tooling work.
  * `perf`: performance improvements.
  * `build`: build-system or dependency changes.
  * `ci`: CI/CD configuration changes.

* Mark breaking changes with `!`, for example:

  ```text
  feat!: change public API schema
  ```

* Keep commit descriptions concise and meaningful.

* Before committing, run the smallest relevant validation step when feasible
  and mention any validation that could not be run.

## Repository Structure

Adapt these sections to the actual repository layout.

* `src/`, `app/`, or project package: core application or library code.
* `scripts/`: utility scripts, automation, wrappers, or CLI entry points.
* `docs/`: documentation, design notes, research notes, specifications.
* `tests/`: automated tests, experiments, validation scripts.
* `third_party/`, `vendor/`, or `external/`: upstream dependencies.
* `data/`, `artifacts/`, `.cache/`, `outputs/`: local or generated files.

## Environment

* Use the repository’s existing environment and dependency manager unless the
  user explicitly asks otherwise.
* Avoid unnecessary dependency installation or version upgrades.
* Match the repository’s expected runtime versions where documented.
* Prefer reproducible commands and environment-aware tooling.

Example:

```bash
python --version
```

## Common Commands

Document the repository’s most important development commands.

Examples:

```bash
make test
make lint
npm test
npm run dev
python -m pytest
python main.py --help
```

## Validation

Use the smallest validation step that reasonably covers the change.

Examples:

```bash
python -m py_compile src/*.py
pytest tests/unit
npm run lint
cargo check
```

For large, expensive, GPU-heavy, network-heavy, or integration-heavy workflows,
prefer lightweight validation unless the change specifically requires deeper
execution.

## Coding Style

* Follow the existing repository style and conventions.
* Prefer readable, maintainable code over overly clever abstractions.
* Use type hints, schemas, or interfaces where they improve clarity.
* Prefer structured parsers and standard libraries over ad hoc string parsing.
* Keep comments concise and focused on non-obvious logic.
* Prefer composition, wrappers, and adapters over patching upstream internals.
* Keep CLI defaults, configuration behavior, and documentation aligned.
* Keep user-facing logs concise while preserving useful diagnostics.

## Data And Safety

* Do not expose secrets, tokens, credentials, personal data, or proprietary
  assets in code, logs, commits, screenshots, or documentation.
* Avoid printing large payloads, model weights, datasets, or binary blobs.
* Use placeholder paths, sample values, or documented examples in generated
  documentation.
* Do not make unsupported claims about correctness, safety, performance,
  security, or scientific validity.
* Clearly distinguish experimental or research outputs from production-ready
  guarantees.

## Change Checklist

Before finishing:

1. Confirm `git status --short` only shows intended changes, plus any
   pre-existing user modifications.
2. Run a syntax check, lint step, test, or another narrow validation when
   feasible.
3. Update documentation if behavior, setup, interfaces, configuration, or
   outputs changed.
4. Mention any validation that could not be run because of missing data,
   credentials, hardware, external services, or environment constraints.
5. Ensure no generated artifacts, secrets, or temporary files were accidentally
   added to tracked changes.
