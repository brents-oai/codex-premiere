# Premiere Bridge

Local IPC bridge for Adobe Premiere Pro 25.6.4 on macOS. Provides a CEP panel that listens on localhost and a Node CLI to send commands.

## Install the CEP panel (dev mode)

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

The panel writes a config file at:
`~/Library/Application Support/PremiereBridge/config.json`

## CLI usage

The CLI reads the config file above for the port and token.

```bash
./cli/premiere-bridge.js ping
./cli/premiere-bridge.js reload-project
./cli/premiere-bridge.js sequence-info
./cli/premiere-bridge.js debug-timecode --timecode 00;02;00;00
./cli/premiere-bridge.js set-playhead --timecode 00;00;10;00
./cli/premiere-bridge.js set-in-out --in "00;00;10;00" --out "00;00;20;00"
./cli/premiere-bridge.js add-markers --file markers.json
./cli/premiere-bridge.js add-markers-file --file markers.json
./cli/premiere-bridge.js toggle-video-track --track V1 --visible false
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
- `sequence-info`
- `debug-timecode`
- `set-playhead`
- `set-in-out`
- `add-markers`
- `add-markers-file`
- `toggle-video-track`

## Security

The panel only listens on `127.0.0.1` and requires the shared token stored in the config file.
