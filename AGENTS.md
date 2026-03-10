# codex-premiere Agent Guide

## Scope
- These instructions are repo-specific. They complement the global Codex instructions and are meant to keep bridge changes coherent across the CLI, UXP panel, and legacy CEP/ExtendScript path.

## Project Map
- `cli/premiere-bridge.js`: Node CLI, transport selection, rough-cut orchestration, JSON file parsing, and the user-facing command surface.
- `premiere-bridge-uxp/main.js`: preferred UXP panel and file-IPC command bridge.
- `premiere-bridge-uxp/manifest.json`: UXP plugin identity, host version, and permissions.
- `premiere-bridge/js/panel.js`: legacy CEP panel wrapper, localhost HTTP bridge, and CEP-to-ExtendScript dispatch.
- `premiere-bridge/jsx/premiere-bridge.jsx`: actual ExtendScript/QE implementation for the CEP path.
- `premiere-bridge/CSXS/manifest.xml`: CEP panel manifest and Node integration flags.
- `README.md`: install notes and manual validation workflow. Treat `node cli/premiere-bridge.js help` as the authoritative command list if the README drifts.

## Working Style For This Repo
- There is no build step, package manifest, or automated test suite in the repo. Edit source files directly.
- Run repo commands from `/Users/brents/code/codex-premiere`. The CLI reads the shared config plus an optional cwd-local `.premiere-bridge.json`.
- Search by command name before reading whole files. `premiere-bridge-uxp/main.js` and especially `premiere-bridge/jsx/premiere-bridge.jsx` are large and multi-purpose.
- If the task is live Premiere control rather than code changes, use the bridge CLI from this repo root.
- For UXP panel reloads, prefer `./cli/uxp-devtools.sh` from the repo root instead of manual UI interaction in Adobe UXP Developer Tools. The helper bootstraps an ignored Rosetta/x64 Node + Adobe CLI toolchain under `.codex-local/`.

## Command Surface Rules
- CLI commands are kebab-case. Internal bridge commands are camelCase.
- Aim for both CEP and UXP support when practical, but keep CEP as the priority path.
- UXP is more restrictive than CEP. If parity is not realistically possible in UXP, document the limitation and keep the CEP path correct rather than forcing a weak UXP approximation.
- When you add or change a command, assume all affected layers may need coordinated updates:
  1. `cli/premiere-bridge.js` usage text, arg parsing, transport call, and printed output.
  2. `premiere-bridge-uxp/main.js` `handleCommand()` plus any helper implementation.
  3. `premiere-bridge/js/panel.js` `handleCommand()` plus any CEP-side prep/verification.
  4. `premiere-bridge/jsx/premiere-bridge.jsx` implementation for the actual Premiere API/QE work.
  5. `README.md` when the user-facing command set or workflow changes.
- `README.md` must stay in lockstep with `node cli/premiere-bridge.js help` for user-facing commands and flags. Treat README updates as required, not optional, whenever the CLI surface changes.
- Do not assume transport parity:
  - `transcript-json` is explicitly UXP-only.
  - `menu-command-id` is meaningful only on the CEP/ExtendScript path and returns unsupported in UXP.
- `--transport auto` is not a full capability fallback. It falls back from CEP to UXP only on retryable socket failures such as `ECONNREFUSED`. A CEP `ok:false`, `401`, or other logical response does not retry in UXP.
- If a command cannot reach parity in UXP, preserve the CEP implementation as the source of truth and document the UXP limitation clearly.
- If a command is temporarily UXP-only, make the CLI call `sendCommandUxp()` directly instead of generic `sendCommand()`, and document the limitation in `README.md`.
- UXP IPC is single-slot: one shared `command.json` and one shared `result.json`. Do not run multiple live UXP-backed commands in parallel.

## Dry-Run And Response Contracts
- Mutating commands must preserve `--dry-run`.
- When adding a mutating command, update both mutating-command sets:
  - `premiere-bridge-uxp/main.js`
  - `premiere-bridge/js/panel.js`
- CLI mutating calls should use `attachDryRun(...)`.
- Keep response envelopes stable:
  - transport handlers should return `{ ok: true, data }` or `{ ok: false, error, data? }`
  - ExtendScript functions should return `PremiereBridge._ok(...)` / `PremiereBridge._err(...)`
- CEP-to-JSX calls go through `buildScript()` / `evalExtendScript()`. New JSX entrypoints should follow the existing pattern: one JSON-string argument parsed with `PremiereBridge._parse`.

## Runtime-Specific Constraints
- `cli/premiere-bridge.js`, `premiere-bridge-uxp/main.js`, and `premiere-bridge/js/panel.js` are plain JavaScript/CommonJS. Keep them dependency-free unless there is a strong reason not to.
- `premiere-bridge/jsx/premiere-bridge.jsx` runs in ExtendScript/QE, not modern Node:
  - prefer `var` and classic `function` syntax
  - avoid modern JS syntax/features that ExtendScript may reject
  - reuse the existing helper/response patterns instead of inventing a new bridge shape
- Track `visible` state is effectively mapped onto mute/enabled behavior. Describe these commands as track-state changes, not guaranteed UI eyeball toggles.
- If you change plugin identity, host range, or installation behavior, update the relevant manifest file, not just the panel JS.

## Validation Expectations
- Static validation loop:
  - `node --check cli/premiere-bridge.js`
  - `node --check premiere-bridge-uxp/main.js`
  - `node --check premiere-bridge/js/panel.js`
  - `node cli/premiere-bridge.js help`
  - `git diff --check`
- Live validation loop when Premiere is available:
  - CEP health: `./cli/premiere-bridge.js ping --transport cep`
  - UXP health: `./cli/premiere-bridge.js ping --transport uxp --timeout-seconds 2`
  - UXP DevTools app connectivity: `./cli/uxp-devtools.sh apps`
  - UXP panel reload after JS/HTML/CSS changes: `./cli/uxp-devtools.sh reload`
  - UXP panel load after manifest changes or first-time setup: `./cli/uxp-devtools.sh load`
  - run the specific command you changed with a realistic payload
- Static checks are not enough for bridge work. A repo edit is incomplete until the installed panel/plugin has been reloaded and the behavior has been confirmed inside Premiere.
- If live validation is blocked, say so explicitly and include the exact failure string. Common examples in this repo are:
  - `connect ECONNREFUSED 127.0.0.1:17321`
  - `Timed out waiting for UXP response (2s). Ensure the UXP panel is running.`
- The Adobe UXP CLI published package is currently not arm64-clean on this machine. The local helper works around that by using Rosetta + x64 Node 20.20.1 and by manually running the Adobe helper setup inside the ignored `.codex-local/uxp-devtools-cli/` workspace.
- Adobe's UXP CLI writes `.uxprc` beside the plugin manifest on `load` and expects `reload` to run from that same plugin directory. `premiere-bridge-uxp/.uxprc` is expected local state and is intentionally gitignored.

## Shared Paths
- Shared config: `~/Library/Application Support/PremiereBridge/config.json`
- UXP IPC directory: `~/Library/Application Support/PremiereBridge/uxp-ipc/`
- UXP IPC files:
  - `command.json`
  - `result.json`
- Assume the CEP install is symlinked from this repo and working unless the user says otherwise or the symlink is clearly broken.
- Default CEP install path: `~/Library/Application Support/Adobe/CEP/extensions/PremiereBridge -> /Users/brents/code/codex-premiere/premiere-bridge`
- UXP Developer Tools loads the plugin from `premiere-bridge-uxp/`.

## Task-Specific Notes
- Timecode/tick work: start with the existing helpers before adding new conversion logic. Relevant surfaces include `TICKS_PER_SECOND`, `debug-timecode`, `sequence-info`, and `sequence-inventory`.
- Rough-cut work: preserve the non-destructive workflow. Duplicate the sequence first, compute gaps from kept ranges, and process deletions from end to start.
- Export-audio work: preserve preset resolution order and final file-existence verification.
- Panel install/debug work: because CEP is assumed symlinked, repo edits should already affect the installed CEP extension. Reload the panel first; only switch to copy/reinstall debugging if the symlink assumption proves false.
