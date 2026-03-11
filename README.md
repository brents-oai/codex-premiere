# Premiere Bridge

Local IPC bridge for Adobe Premiere Pro on macOS. Provides both a UXP panel (preferred) and a CEP panel (legacy) plus a Node CLI to send commands.

## Install the UXP panel (preferred)

1. Open UXP Developer Tools.
2. Add a plugin and select `/Users/brents/code/codex-premiere/premiere-bridge-uxp`.
3. In Premiere, open the panel:

`Window > Extensions (UXP) > Premiere Bridge UXP`

The UXP panel creates and maintains the shared config file at:
`~/Library/Application Support/PremiereBridge/config.json`

## Install the CEP panel (optional / legacy)

1. Enable unsigned CEP extensions:

```bash
# Matches the CSXS runtime declared in the manifest (12.x)
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
```

2. Install the extension (symlink recommended):

```bash
mkdir -p ~/Library/Application\ Support/Adobe/CEP/extensions
ln -s /Users/brents/code/codex-premiere/premiere-bridge \
  ~/Library/Application\ Support/Adobe/CEP/extensions/PremiereBridge
```

3. Launch Premiere Pro and open the panel:

`Window > Extensions > Premiere Bridge`

The CEP panel writes the same config file used by the UXP panel and CLI.

## CLI usage

The CLI reads the shared config file above for the port, token, and preferred transport. Use `--transport uxp|cep|auto` to override.

On macOS, `get-playhead` also verifies the visible Premiere timecode from the UI and prefers it when `getPlayerPosition()` is stale.

```bash
./cli/premiere-bridge.js ping
./cli/premiere-bridge.js reload-project
./cli/premiere-bridge.js save-project
./cli/premiere-bridge.js export-sequence-direct --transport cep --output /ABS/PATH/active-sequence.wav --preset /ABS/PATH/audio-48k.epr
./cli/premiere-bridge.js export-sequence-audio --transport cep --preset /ABS/PATH/audio-48k.epr
./cli/premiere-bridge.js export-sequence-audio --transport uxp --preset /ABS/PATH/audio-48k.epr
./cli/premiere-bridge.js duplicate-sequence --name "Rough Cut"
./cli/premiere-bridge.js list-sequences
./cli/premiere-bridge.js open-sequence --name "Rough Cut"
./cli/premiere-bridge.js find-item --name "C0114.MP4" --contains --limit 5
./cli/premiere-bridge.js menu-command-id --name "Extract"
./cli/premiere-bridge.js transcript-json --timeout-seconds 45
./cli/premiere-bridge.js sequence-info
./cli/premiere-bridge.js sequence-inventory
./cli/premiere-bridge.js get-playhead
./cli/premiere-bridge.js debug-timecode --timecode 00;02;00;00
./cli/premiere-bridge.js set-playhead --timecode 00;00;10;00
./cli/premiere-bridge.js set-in-out --in "00;00;10;00" --out "00;00;20;00"
./cli/premiere-bridge.js extract-range --in "00;00;10;00" --out "00;00;20;00"
./cli/premiere-bridge.js ripple-delete-selection
./cli/premiere-bridge.js rough-cut --ranges-file ./ranges.json --name "Transcript Rough Cut"
./cli/premiere-bridge.js razor-cut --timecode "00;00;10;00"
./cli/premiere-bridge.js add-markers --file markers.json
./cli/premiere-bridge.js add-markers-file --file markers.json
./cli/premiere-bridge.js toggle-video-track --track V1 --visible false
./cli/premiere-bridge.js set-track-state --track A1 --kind audio --mute true
```

Markers JSON example:

```json
{
  "markers": [
    { "timeSeconds": 1.25, "name": "Intro", "comment": "First beat", "color": "Yellow" },
    { "timeSeconds": 4.0, "name": "Alt", "comment": "Index example", "colorIndex": 4 },
    { "timeSeconds": 8.5, "name": "Cut", "comment": "Alt take" }
  ]
}
```

Supported color fields:
- `colorIndex` (preferred): 0–7
- `color`: name string (e.g., "Yellow") — bridge maps to index
- `colorValue`: ARGB numeric value — bridge maps to index

Color indices:
0 Green, 1 Red, 2 Purple, 3 Orange, 4 Yellow, 5 White, 6 Blue, 7 Cyan.

## Commands

- `ping`
- `reload-project`
- `save-project`
- `export-sequence-direct` (CEP only; requires `--output` and `--preset`)
- `export-sequence-audio` (requires `--transport cep|uxp`)
- `duplicate-sequence`
- `list-sequences`
- `open-sequence`
- `find-item`
- `menu-command-id`
- `transcript-json` (requires the UXP panel)
- `sequence-info`
- `sequence-inventory`
- `get-playhead`
- `debug-timecode`
- `set-playhead`
- `set-in-out`
- `extract-range`
- `ripple-delete-selection`
- `rough-cut`
- `razor-cut`
- `add-markers`
- `add-markers-file`
- `toggle-video-track`
- `set-track-state`

## UXP Command Bridge (Experimental)

The UXP panel at `premiere-bridge-uxp/` now acts as a command bridge (not just
transcript export). The CLI can talk to it via file-based IPC.

Destructive edit note:
- CEP remains the source of truth for edit mutations.
- On hosts where Premiere Pro rejects `SequenceEditor.createCloneTrackItemAction`,
  UXP `razor-cut` and `extract-range` now return an explicit capability error
  instead of a false success. Use `--transport cep` for those edits on affected hosts.

High-level flow:
- The UXP panel polls a file-based IPC directory.
- The CLI writes a command to that directory.
- The UXP panel writes the result back to disk for the CLI to read.

### Setup (UXP Developer Tools)

1) Open UXP Developer Tools and load `premiere-bridge-uxp/` as a plugin.
2) In Premiere, open the panel: `Window > Extensions (UXP) > Premiere Bridge UXP`.
3) Click \"Save Config\" in the UXP panel at least once to create the shared token.

### IPC Location

The UXP panel and CLI communicate via:

- `~/Library/Application Support/PremiereBridge/uxp-ipc/command.json`
- `~/Library/Application Support/PremiereBridge/uxp-ipc/result.json`

### CLI Usage (UXP transport)

```bash
./cli/premiere-bridge.js ping --transport uxp
./cli/premiere-bridge.js transcript-json --timeout-seconds 60 --transport uxp
```

By default, the CLI uses the transport stored in the shared config file. When
the UXP panel saves the config, it sets `transport: \"uxp\"`.

## Get Playhead Position

Read the current CTI/playhead position as ticks, seconds, and timecode:

```bash
./cli/premiere-bridge.js get-playhead --transport cep
```

Expected response fields include:
- `ticks`
- `seconds`
- `timecode`
- `method`
- `source`
- `verification`

Example response when the bridge and UI agree:

```json
{
  "statusCode": 200,
  "body": {
    "ok": true,
    "data": {
      "ticks": "78433824268800",
      "seconds": 308.775133333333,
      "timecode": "00:05:08;24",
      "method": "sequence.getPlayerPosition",
      "source": "cep",
      "verification": {
        "selectedSource": "bridge",
        "matched": true
      }
    }
  }
}
```

When Premiere's playhead API is stale on macOS, the CLI returns the UI-verified timecode instead and includes both sources under `verification`.

Example response when the bridge is stale and the CLI promotes the UI value:

```json
{
  "statusCode": 200,
  "body": {
    "ok": true,
    "data": {
      "ticks": "17722620115200",
      "seconds": 69.7697,
      "timecode": "00;01;09;23",
      "method": "macosVisionOcr",
      "source": "ui",
      "verification": {
        "selectedSource": "ui",
        "matched": false,
        "frameDelta": 52
      }
    }
  }
}
```

## Direct Sequence Export (CEP)

Export the active sequence immediately on the CEP path with an explicit output path and explicit Adobe Media Encoder preset.

```bash
./cli/premiere-bridge.js export-sequence-direct \
  --transport cep \
  --output /ABS/PATH/active-sequence.wav \
  --preset /ABS/PATH/audio-48k.epr
```

Required args:
- `--output /ABS/PATH/output.ext`
- `--preset /ABS/PATH/export-preset.epr`

Optional args:
- `--dry-run`

Current limitation:
- `export-sequence-direct` is currently supported only on the CEP path. `--transport uxp` returns an explicit CLI error.
- The command does not invent a default output filename. Provide `--output` explicitly; shared default output-path behavior remains coupled to issue `#42`.

Expected response fields include:
- `transport`
- `sequence.name`
- `outputPath`
- `presetPath`
- `method`
- `file.exists`
- `file.bytes`
- `durationSeconds` (if available)

## Sequence Audio Export (CEP + UXP)

Export the active sequence audio to a WAV file for downstream transcription.

```bash
./cli/premiere-bridge.js export-sequence-audio \
  --transport cep \
  --preset /ABS/PATH/audio-48k.epr
```

```bash
./cli/premiere-bridge.js export-sequence-audio \
  --transport uxp \
  --preset /ABS/PATH/audio-48k.epr
```

Optional args:
- `--output /ABS/PATH/output.wav`
- `--timeout-seconds N`
- `--dry-run`

Defaults:
- Output path defaults to:
  `~/Library/Application Support/PremiereBridge/tmp/<sequence-slug>-<YYYYMMDD-HHmmss>.wav`
- Preset resolution order:
  1. `--preset`
  2. config `audioExportPreset`
  3. config `defaultAudioExportPreset`
  4. built-in preset candidates (if present)
  5. fail with explicit error

Expected response fields include:
- `transport`
- `sequence.name`
- `outputPath`
- `presetPath`
- `method`
- `file.exists`
- `file.bytes`
- `durationSeconds` (if available)

## Rough Cut Command Set

These primitives are sufficient for a safe, transcript-driven rough cut:

- `duplicate-sequence` (non-destructive editing)
- `open-sequence` / `list-sequences` (reliable context switching)
- `sequence-inventory` (map transcript time to sequence time)
- `razor-cut` (cut boundaries across all tracks)
- `extract-range` (remove a time span and ripple closed)
- `ripple-delete-selection` (selection-driven variant)

Suggested workflow for transcript ranges to keep:

1) Duplicate and activate the working sequence.
2) Use `sequence-inventory` to translate transcript timecodes into sequence time.
3) Compute the gaps between "kept" ranges.
4) Run `extract-range` on each gap from end to start.

## Rough Cut Orchestration

`rough-cut` automates the workflow above using inclusion ranges.

Ranges JSON can be an array or an object with `ranges`/`segments`:

```json
{
  "ranges": [
    { "start": "00;00;02;00", "end": "00;00;06;00" },
    { "start": "00;00;10;00", "end": "00;00;16;00" }
  ]
}
```

Example:

```bash
./cli/premiere-bridge.js rough-cut \
  --ranges-file /Users/brents/code/codex-premiere/ranges.json \
  --name "Rough Cut - Transcript" \
  --padding-seconds 0.25
```

Notes:
- The command duplicates the active sequence before editing.
- By default, transcript times are offset by the sequence start time. Use `--no-offset` if your ranges are already in sequence time.
- Gaps are processed from end to start to keep earlier times stable.

## Pre-Merge Checklist

Use this quick loop before merging changes:

1) Create a feature branch from `main`.
2) Copy updated panel files into the installed extension (often `PremiereBridgeCopy`).
3) Reload the Premiere panel.
4) Run the relevant CLI commands and confirm the result in Premiere.
5) Only then commit, open the PR, merge, and close the issue.

## Security

The panel only listens on `127.0.0.1` and requires the shared token stored in the config file.
