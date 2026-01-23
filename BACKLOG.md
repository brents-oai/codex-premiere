# Premiere Bridge Backlog

## P0 - Core reliability
- Deterministic timecode placement (exact frame alignment for DF/NDF)
- Marker color correctness across name/value/index paths
- Robust reload-project (save + reopen + restore active sequence)
- Connection health check + auto-retry for IPC server

## P1 - Markers
- Add markers by frame number (exact)
- Update marker by name/time
- Delete marker(s) by name/time/range
- Clear all sequence markers
- Export markers to JSON/CSV
- Import markers from CSV

## P1 - Sequence + timeline
- Set playhead timecode
- Get playhead timecode
- Set in/out points
- Clear in/out
- Insert clip(s) at playhead
- Overwrite clip(s) at playhead
- Razor cuts at timecode
- Ripple delete selection

## P1 - Tracks
- Toggle video track visibility (done)
- Toggle audio track mute
- Set track state explicitly (mute/visible on/off)
- Add video/audio track
- Target/untarget tracks

## P2 - Clips
- Rename clip instances
- Enable/disable clip
- Change clip label color
- Set speed/duration
- Nest selected clips
- Replace clip source

## P2 - Effects + transitions
- Apply effect preset to clip
- Remove effects from clip
- Toggle effect visibility
- Set effect parameter values
- Add/remove transitions

## P2 - Project + bins
- Create bin/sub-bin
- Move items between bins
- Rename items
- Delete items
- Find item by name/path

## P2 - Export
- Queue export via AME
- Direct export with preset
- Set output path and filename
- Batch export multiple sequences

## P3 - Metadata + reporting
- Read/write clip metadata
- Sequence summary report (duration, tracks, markers)
- Timeline audit (gaps, overlaps)

## P3 - UX + tooling
- CLI: dry-run mode (validate without writing)
- CLI: verbose logging / debug mode
- Panel: activity log export
- Panel: quick actions (buttons for common ops)
