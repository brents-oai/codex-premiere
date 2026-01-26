#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");

const DEFAULT_PORT = 17321;
const TICKS_PER_SECOND = 254016000000;

function usage(exitCode) {
  const text = `
Usage:
  premiere-bridge ping [--port N] [--token TOKEN]
  premiere-bridge reload-project [--port N] [--token TOKEN]
  premiere-bridge save-project [--port N] [--token TOKEN]
  premiere-bridge duplicate-sequence [--name NAME] [--port N] [--token TOKEN]
  premiere-bridge list-sequences [--port N] [--token TOKEN]
  premiere-bridge open-sequence (--name NAME | --id ID) [--port N] [--token TOKEN]
  premiere-bridge sequence-info [--port N] [--token TOKEN]
  premiere-bridge sequence-inventory [--port N] [--token TOKEN]
  premiere-bridge debug-timecode --timecode 00;02;00;00 [--port N] [--token TOKEN]
  premiere-bridge set-playhead --timecode 00;00;10;00 [--port N] [--token TOKEN]
  premiere-bridge set-in-out --in 00;00;10;00 --out 00;00;20;00 [--port N] [--token TOKEN]
  premiere-bridge extract-range (--in 00;00;10;00 | --in-ticks N | --in-seconds S) (--out 00;00;20;00 | --out-ticks N | --out-seconds S) [--command-id N] [--port N] [--token TOKEN]
  premiere-bridge ripple-delete-selection [--command-id N] [--port N] [--token TOKEN]
  premiere-bridge rough-cut (--ranges-file /path/to/ranges.json | --ranges '[{"start":"00;00;10;00","end":"00;00;20;00"}]') [--name NAME] [--padding-seconds S] [--padding-frames N] [--no-offset] [--port N] [--token TOKEN]
  premiere-bridge razor-cut (--timecode 00;00;10;00 | --seconds 10 | --ticks 254016000000) [--unit ticks|seconds|timecode|playhead] [--port N] [--token TOKEN]
  premiere-bridge add-markers --file markers.json [--port N] [--token TOKEN]
  premiere-bridge add-markers --markers '[{"timeSeconds":1.23,"name":"Note"}]' [--port N] [--token TOKEN]
  premiere-bridge add-markers-file --file /path/to/markers.json [--port N] [--token TOKEN]
  premiere-bridge toggle-video-track --track V1 [--visible true|false] [--mute true|false] [--port N] [--token TOKEN]

Config:
  Reads ~/Library/Application Support/PremiereBridge/config.json when available.
`;
  console.log(text.trim());
  process.exit(exitCode || 0);
}

function parseArgs(argv) {
  const args = { _: [] };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const [key, inlineValue] = arg.slice(2).split("=");
      if (inlineValue !== undefined) {
        args[key] = inlineValue;
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          args[key] = next;
          i += 1;
        } else {
          args[key] = true;
        }
      }
    } else {
      args._.push(arg);
    }
    i += 1;
  }
  return args;
}

function loadConfig(options) {
  const configPaths = [
    path.join(os.homedir(), "Library", "Application Support", "PremiereBridge", "config.json"),
    path.join(process.cwd(), ".premiere-bridge.json")
  ];

  let config = {};
  for (const cfgPath of configPaths) {
    try {
      if (fs.existsSync(cfgPath)) {
        config = Object.assign(config, JSON.parse(fs.readFileSync(cfgPath, "utf8")));
      }
    } catch (err) {
      console.error(`Failed to read config at ${cfgPath}: ${err.message}`);
    }
  }

  if (options.port) {
    config.port = Number(options.port);
  }
  if (!config.port) {
    config.port = DEFAULT_PORT;
  }
  if (options.token) {
    config.token = options.token;
  }

  return config;
}

function normalizeMarkers(input) {
  if (Array.isArray(input)) {
    return input;
  }
  if (input && Array.isArray(input.markers)) {
    return input.markers;
  }
  return null;
}

function normalizeRanges(input) {
  if (Array.isArray(input)) {
    return input;
  }
  if (input && Array.isArray(input.ranges)) {
    return input.ranges;
  }
  if (input && Array.isArray(input.segments)) {
    return input.segments;
  }
  if (input && Array.isArray(input.items)) {
    return input.items;
  }
  return null;
}

function readMarkers(options) {
  if (options.file) {
    const raw = fs.readFileSync(options.file, "utf8");
    const parsed = JSON.parse(raw);
    const markers = normalizeMarkers(parsed);
    if (!markers) {
      throw new Error("Marker file must be an array or an object with a markers array");
    }
    return markers;
  }

  if (options.markers) {
    const parsed = JSON.parse(options.markers);
    const markers = normalizeMarkers(parsed);
    if (!markers) {
      throw new Error("--markers must be a JSON array or an object with a markers array");
    }
    return markers;
  }

  throw new Error("Provide --file or --markers");
}

function readRanges(options) {
  if (options["ranges-file"]) {
    const raw = fs.readFileSync(options["ranges-file"], "utf8");
    const parsed = JSON.parse(raw);
    const ranges = normalizeRanges(parsed);
    if (!ranges) {
      throw new Error("Ranges file must be an array or an object with a ranges/segments/items array");
    }
    return ranges;
  }

  if (options.ranges) {
    const parsed = JSON.parse(options.ranges);
    const ranges = normalizeRanges(parsed);
    if (!ranges) {
      throw new Error("--ranges must be a JSON array or an object with a ranges/segments/items array");
    }
    return ranges;
  }

  throw new Error("Provide --ranges-file or --ranges");
}

function getSequenceBounds(inventory) {
  const seq = inventory && inventory.sequence ? inventory.sequence : {};
  const startTicks = Number(seq.start && seq.start.ticks ? seq.start.ticks : 0) || 0;
  const tracks = inventory && inventory.tracks ? inventory.tracks : {};
  const allTracks = [...(tracks.video || []), ...(tracks.audio || [])];
  let endTicks = startTicks;
  for (const track of allTracks) {
    for (const clip of track.clips || []) {
      const end = Number(clip.end && clip.end.ticks);
      if (!Number.isNaN(end) && end > endTicks) {
        endTicks = end;
      }
    }
  }
  return { startTicks, endTicks };
}

function deriveTimebase(inventory) {
  const seq = inventory && inventory.sequence ? inventory.sequence : {};
  const timebase = Number(seq.timebase);
  if (!Number.isNaN(timebase) && timebase > 0) {
    return timebase;
  }
  throw new Error("Sequence timebase is missing or invalid");
}

function deriveNominalFps(inventory, timebase) {
  const seq = inventory && inventory.sequence ? inventory.sequence : {};
  const fps = Number(seq.nominalFps);
  if (!Number.isNaN(fps) && fps > 0) {
    return fps;
  }
  const derived = Math.round(TICKS_PER_SECOND / Number(timebase));
  if (!Number.isNaN(derived) && derived > 0) {
    return derived;
  }
  return 30;
}

function parseTimecodeToFrames(timecode, fps, dropFrameHint) {
  if (!timecode) {
    return null;
  }
  const raw = String(timecode);
  const dropFrame = raw.includes(";") || dropFrameHint === true;
  const clean = raw.replace(/;/g, ":");
  const parts = clean.split(":");
  if (parts.length < 4) {
    return null;
  }
  const [hh, mm, ss, ff] = parts.map((p) => Number(p));
  if ([hh, mm, ss, ff].some((n) => Number.isNaN(n))) {
    return null;
  }
  const totalMinutes = hh * 60 + mm;
  let totalFrames = ((hh * 3600 + mm * 60 + ss) * fps) + ff;
  if (dropFrame) {
    const dropFrames = Math.round(fps * 0.066666);
    totalFrames -= dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));
  }
  return totalFrames;
}

function timecodeToTicks(timecode, context) {
  const frames = parseTimecodeToFrames(timecode, context.fps, context.dropFrame);
  if (frames === null) {
    return null;
  }
  return Math.round(frames * context.timebase);
}

function secondsToTicks(seconds) {
  const value = Number(seconds);
  if (Number.isNaN(value)) {
    return null;
  }
  return Math.round(value * TICKS_PER_SECOND);
}

function ticksToSeconds(ticks) {
  return Number(ticks) / TICKS_PER_SECOND;
}

function paddingToTicks(args, context) {
  let paddingTicks = 0;
  if (args["padding-seconds"] !== undefined) {
    const ticks = secondsToTicks(args["padding-seconds"]);
    if (ticks !== null) {
      paddingTicks += ticks;
    }
  }
  if (args["padding-frames"] !== undefined) {
    const frames = Number(args["padding-frames"]);
    if (!Number.isNaN(frames)) {
      paddingTicks += Math.round(frames * context.timebase);
    }
  }
  if (args["padding-timecode"] !== undefined) {
    const ticks = timecodeToTicks(String(args["padding-timecode"]), context);
    if (ticks !== null) {
      paddingTicks += ticks;
    }
  }
  return Math.max(0, Math.round(paddingTicks));
}

function rangeField(value, context) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "number") {
    return secondsToTicks(value);
  }
  const str = String(value);
  if (str.includes(":") || str.includes(";")) {
    return timecodeToTicks(str, context);
  }
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    return secondsToTicks(numeric);
  }
  return null;
}

function numericOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function rangeToTicks(range, context) {
  const startTicksRaw =
    numericOrNull(range.startTicks) ??
    numericOrNull(range.inTicks) ??
    (range.startSeconds !== undefined ? secondsToTicks(range.startSeconds) : null) ??
    (range.inSeconds !== undefined ? secondsToTicks(range.inSeconds) : null) ??
    (range.startTimecode !== undefined ? timecodeToTicks(range.startTimecode, context) : null) ??
    (range.inTimecode !== undefined ? timecodeToTicks(range.inTimecode, context) : null) ??
    rangeField(range.start, context) ??
    rangeField(range.in, context);

  const endTicksRaw =
    numericOrNull(range.endTicks) ??
    numericOrNull(range.outTicks) ??
    (range.endSeconds !== undefined ? secondsToTicks(range.endSeconds) : null) ??
    (range.outSeconds !== undefined ? secondsToTicks(range.outSeconds) : null) ??
    (range.endTimecode !== undefined ? timecodeToTicks(range.endTimecode, context) : null) ??
    (range.outTimecode !== undefined ? timecodeToTicks(range.outTimecode, context) : null) ??
    rangeField(range.end, context) ??
    rangeField(range.out, context);

  if (startTicksRaw === null || endTicksRaw === null) {
    return null;
  }

  let startTicks = Math.round(Number(startTicksRaw));
  let endTicks = Math.round(Number(endTicksRaw));
  if (Number.isNaN(startTicks) || Number.isNaN(endTicks)) {
    return null;
  }

  if (!context.noOffset) {
    startTicks += context.sequenceStartTicks;
    endTicks += context.sequenceStartTicks;
  }

  return { startTicks, endTicks };
}

function clampRange(range, bounds) {
  const start = Math.max(bounds.startTicks, range.startTicks);
  const end = Math.min(bounds.endTicks, range.endTicks);
  if (end <= start) {
    return null;
  }
  return { startTicks: start, endTicks: end };
}

function normalizeIncludedRanges(ranges, context, bounds, paddingTicks) {
  const normalized = [];
  for (const [index, range] of ranges.entries()) {
    const converted = rangeToTicks(range || {}, context);
    if (!converted) {
      throw new Error(`Range at index ${index} is missing valid start/end values`);
    }
    let startTicks = converted.startTicks - paddingTicks;
    let endTicks = converted.endTicks + paddingTicks;
    if (endTicks < startTicks) {
      [startTicks, endTicks] = [endTicks, startTicks];
    }
    const clamped = clampRange({ startTicks, endTicks }, bounds);
    if (clamped) {
      normalized.push(clamped);
    }
  }

  normalized.sort((a, b) => a.startTicks - b.startTicks);
  const merged = [];
  for (const range of normalized) {
    const last = merged[merged.length - 1];
    if (!last || range.startTicks > last.endTicks) {
      merged.push({ ...range });
      continue;
    }
    last.endTicks = Math.max(last.endTicks, range.endTicks);
  }
  return merged;
}

function computeGaps(included, bounds) {
  const gaps = [];
  let cursor = bounds.startTicks;
  for (const range of included) {
    if (range.startTicks > cursor) {
      gaps.push({ startTicks: cursor, endTicks: range.startTicks });
    }
    cursor = Math.max(cursor, range.endTicks);
  }
  if (cursor < bounds.endTicks) {
    gaps.push({ startTicks: cursor, endTicks: bounds.endTicks });
  }
  return gaps.filter((gap) => gap.endTicks > gap.startTicks);
}

function sendCommand(config, cmd, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ cmd, payload });
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: config.port,
        path: "/command",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "x-auth-token": config.token
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch (err) {
            resolve({ statusCode: res.statusCode, body: data });
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || command === "help" || command === "--help") {
    usage(0);
  }

  const config = loadConfig(args);
  if (!config.token) {
    console.error("Missing token. Open the panel to generate one or pass --token.");
    process.exit(1);
  }

  if (command === "ping") {
    const result = await sendCommand(config, "ping", {});
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "reload-project") {
    const result = await sendCommand(config, "reloadProject", {});
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "save-project") {
    const result = await sendCommand(config, "saveProject", {});
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "duplicate-sequence") {
    const payload = {};
    if (args.name) {
      payload.name = String(args.name);
    }
    const result = await sendCommand(config, "duplicateSequence", payload);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "list-sequences") {
    const result = await sendCommand(config, "listSequences", {});
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "open-sequence") {
    if (!args.name && !args.id) {
      throw new Error("Provide --name or --id for open-sequence");
    }
    const payload = {};
    if (args.name) {
      payload.name = String(args.name);
    }
    if (args.id) {
      payload.id = String(args.id);
    }
    const result = await sendCommand(config, "openSequence", payload);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "add-markers") {
    const markers = readMarkers(args);
    const result = await sendCommand(config, "addMarkers", { markers });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "sequence-info") {
    const result = await sendCommand(config, "getSequenceInfo", {});
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "sequence-inventory") {
    const result = await sendCommand(config, "sequenceInventory", {});
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "debug-timecode") {
    if (!args.timecode) {
      throw new Error("Provide --timecode for debug-timecode");
    }
    const result = await sendCommand(config, "debugTimecode", { timecode: args.timecode });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "set-playhead") {
    if (!args.timecode) {
      throw new Error("Provide --timecode for set-playhead");
    }
    const result = await sendCommand(config, "setPlayheadTimecode", { timecode: args.timecode });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "set-in-out") {
    if (!args.in || !args.out) {
      throw new Error("Provide --in and --out timecodes for set-in-out");
    }
    const result = await sendCommand(config, "setInOutPoints", {
      inTimecode: args.in,
      outTimecode: args.out
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "extract-range") {
    const payload = {};
    if (args.in !== undefined) {
      payload.inTimecode = String(args.in);
    }
    if (args["in-ticks"] !== undefined) {
      payload.inTicks = Number(args["in-ticks"]);
    }
    if (args["in-seconds"] !== undefined) {
      payload.inSeconds = Number(args["in-seconds"]);
    }
    if (args.out !== undefined) {
      payload.outTimecode = String(args.out);
    }
    if (args["out-ticks"] !== undefined) {
      payload.outTicks = Number(args["out-ticks"]);
    }
    if (args["out-seconds"] !== undefined) {
      payload.outSeconds = Number(args["out-seconds"]);
    }
    if (args["command-id"] !== undefined) {
      payload.commandId = Number(args["command-id"]);
    }

    const hasIn =
      payload.inTimecode !== undefined ||
      payload.inTicks !== undefined ||
      payload.inSeconds !== undefined;
    const hasOut =
      payload.outTimecode !== undefined ||
      payload.outTicks !== undefined ||
      payload.outSeconds !== undefined;
    if (!hasIn || !hasOut) {
      throw new Error("Provide in/out via --in/--out, --in-ticks/--out-ticks, or --in-seconds/--out-seconds");
    }

    const result = await sendCommand(config, "extractRange", payload);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "ripple-delete-selection") {
    const payload = {};
    if (args["command-id"] !== undefined) {
      payload.commandId = Number(args["command-id"]);
    }
    const result = await sendCommand(config, "rippleDeleteSelection", payload);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "rough-cut") {
    const ranges = readRanges(args);
    if (!ranges.length) {
      throw new Error("No ranges provided");
    }

    const activeInfo = await sendCommand(config, "getSequenceInfo", {});
    if (!activeInfo.body || !activeInfo.body.ok) {
      throw new Error(`Failed to read active sequence: ${activeInfo.body && activeInfo.body.error}`);
    }
    const activeName = String(activeInfo.body.data && activeInfo.body.data.name ? activeInfo.body.data.name : "Sequence");
    const duplicateName = args.name ? String(args.name) : `${activeName} Rough Cut`;

    const dupResult = await sendCommand(config, "duplicateSequence", { name: duplicateName });
    if (!dupResult.body || !dupResult.body.ok) {
      throw new Error(`Failed to duplicate sequence: ${dupResult.body && dupResult.body.error}`);
    }

    const inventoryResult = await sendCommand(config, "sequenceInventory", {});
    if (!inventoryResult.body || !inventoryResult.body.ok) {
      throw new Error(`Failed to read sequence inventory: ${inventoryResult.body && inventoryResult.body.error}`);
    }

    const inventory = inventoryResult.body.data;
    const bounds = getSequenceBounds(inventory);
    const timebase = deriveTimebase(inventory);
    const context = {
      timebase,
      fps: deriveNominalFps(inventory, timebase),
      dropFrame: inventory.sequence && inventory.sequence.dropFrame === true,
      sequenceStartTicks: bounds.startTicks,
      noOffset: String(args["no-offset"]).toLowerCase() === "true"
    };
    const paddingTicks = paddingToTicks(args, context);
    const included = normalizeIncludedRanges(ranges, context, bounds, paddingTicks);
    if (!included.length) {
      throw new Error("No valid ranges remain after normalization/clamping");
    }

    const gaps = computeGaps(included, bounds);
    const processed = [];
    for (const gap of gaps.slice().sort((a, b) => b.startTicks - a.startTicks)) {
      const extractResult = await sendCommand(config, "extractRange", {
        inTicks: gap.startTicks,
        outTicks: gap.endTicks
      });
      if (!extractResult.body || !extractResult.body.ok) {
        throw new Error(`Failed to extract gap ${gap.startTicks}-${gap.endTicks}: ${extractResult.body && extractResult.body.error}`);
      }
      processed.push({
        gap,
        seconds: ticksToSeconds(gap.endTicks - gap.startTicks),
        method: extractResult.body.data && extractResult.body.data.extract && extractResult.body.data.extract.method
      });
    }

    const saveResult = await sendCommand(config, "saveProject", {});

    const output = {
      duplicate: dupResult.body.data,
      bounds: {
        startTicks: String(bounds.startTicks),
        endTicks: String(bounds.endTicks),
        durationSeconds: ticksToSeconds(bounds.endTicks - bounds.startTicks)
      },
      padding: {
        ticks: String(paddingTicks),
        seconds: ticksToSeconds(paddingTicks)
      },
      includedRanges: included.map((r) => ({
        startTicks: String(r.startTicks),
        endTicks: String(r.endTicks),
        durationSeconds: ticksToSeconds(r.endTicks - r.startTicks)
      })),
      gapsProcessed: processed,
      saveProject: saveResult.body
    };
    console.log(JSON.stringify({ statusCode: 200, body: { ok: true, data: output } }, null, 2));
    return;
  }

  if (command === "razor-cut") {
    if (args.timecode === undefined && args.seconds === undefined && args.ticks === undefined) {
      throw new Error("Provide --timecode, --seconds, or --ticks for razor-cut");
    }
    const payload = {};
    if (args.timecode !== undefined) {
      payload.timecode = String(args.timecode);
    }
    if (args.seconds !== undefined) {
      payload.seconds = Number(args.seconds);
    }
    if (args.ticks !== undefined) {
      payload.ticks = Number(args.ticks);
    }
    if (args.unit !== undefined) {
      payload.unit = String(args.unit);
    }
    const result = await sendCommand(config, "razorAtTimecode", payload);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "add-markers-file") {
    if (!args.file) {
      throw new Error("Provide --file for add-markers-file");
    }
    const result = await sendCommand(config, "addMarkersFromFile", { filePath: args.file });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "toggle-video-track") {
    const payload = {};
    if (args.track !== undefined) {
      payload.track = args.track;
    }
    if (args.index !== undefined) {
      payload.trackIndex = Number(args.index);
    }
    if (args.number !== undefined) {
      payload.trackNumber = Number(args.number);
    }
    if (args.visible !== undefined) {
      payload.visible = String(args.visible).toLowerCase() === "true";
    }
    if (args.mute !== undefined) {
      payload.mute = String(args.mute).toLowerCase() === "true";
    }
    const result = await sendCommand(config, "toggleVideoTrack", payload);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.error(`Unknown command: ${command}`);
  usage(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
