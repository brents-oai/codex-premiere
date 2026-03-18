#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const { spawnSync } = require("child_process");

const DEFAULT_PORT = 17321;
const TICKS_PER_SECOND = 254016000000;

function usage(exitCode) {
  const text = `
Usage:
  premiere-bridge ping [--port N] [--token TOKEN]
  premiere-bridge reload-project [--port N] [--token TOKEN]
  premiere-bridge save-project [--port N] [--token TOKEN]
  premiere-bridge export-sequence-direct [--transport cep|auto] (--output /abs/path.ext | --output-dir /abs/dir --filename name.ext) --preset /abs/path.epr [--port N] [--token TOKEN]
  premiere-bridge export-sequences-direct [--transport cep|auto] (--sequences '[{"name":"Seq A","outputPath":"/abs/path.ext"},{"id":"SEQ-ID","filename":"seq-b.ext"}]' | --sequences-file /abs/path.json) --preset /abs/path.epr [--output-dir /abs/dir] [--filename-extension .ext] [--port N] [--token TOKEN]
  premiere-bridge export-sequence-audio [--transport cep|uxp|auto] [--output /abs/path.wav] [--preset /abs/path.epr] [--timeout-seconds N] [--port N] [--token TOKEN]
  premiere-bridge duplicate-sequence [--name NAME] [--port N] [--token TOKEN]
  premiere-bridge list-sequences [--port N] [--token TOKEN]
  premiere-bridge open-sequence (--name NAME | --id ID) [--port N] [--token TOKEN]
  premiere-bridge find-item (--name NAME | --path BIN/ITEM) [--contains] [--case-sensitive] [--limit N] [--port N] [--token TOKEN]
  premiere-bridge insert-clip --item-id ID --video-track-index N --audio-track-index N (--at playhead | --timecode 00;00;10;00 | --seconds S | --ticks N) [--transport cep|auto] [--port N] [--token TOKEN]
  premiere-bridge transcript-json [--timeout-seconds N] [--token TOKEN]
  premiere-bridge menu-command-id (--name NAME | --names '["Extract","Ripple Delete"]') [--port N] [--token TOKEN]
  premiere-bridge sequence-info [--port N] [--token TOKEN]
  premiere-bridge sequence-inventory [--port N] [--token TOKEN]
  premiere-bridge get-playhead [--port N] [--token TOKEN]
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
  premiere-bridge set-track-state --track V1|A1 [--kind video|audio] [--visible true|false] [--mute true|false] [--port N] [--token TOKEN]

Config:
  Reads ~/Library/Application Support/PremiereBridge/config.json when available.

Global:
  --dry-run  Validate and compute without writing changes to Premiere.
  --transport cep|uxp|auto  Choose transport (default: config or auto).
  --timeout-seconds N  Timeout for UXP IPC transport (default: 60).

Notes:
  get-playhead auto-verifies the visible Premiere timecode on macOS and prefers it when the bridge read is stale.
  export-sequence-direct is currently CEP-only and requires --preset plus either --output or --output-dir with --filename.
  export-sequences-direct is currently CEP-only and requires --preset plus explicit sequence JSON. Use item outputPath values or --output-dir with per-item filename / --filename-extension for derived filenames.
  insert-clip is currently CEP-only and requires --item-id plus explicit --video-track-index and --audio-track-index destination tracks.
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

function flagEnabled(args, key) {
  const raw = args[key];
  if (raw === undefined) {
    return false;
  }
  if (raw === true) {
    return true;
  }
  const normalized = String(raw).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
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
  if (options.transport) {
    config.transport = String(options.transport).toLowerCase();
  }
  if (!config.transport) {
    config.transport = "auto";
  }

  const timeoutRaw =
    options["timeout-seconds"] !== undefined ? options["timeout-seconds"] : config.uxpTimeoutSeconds;
  const timeout = Number(timeoutRaw);
  config.uxpTimeoutSeconds = Number.isFinite(timeout) && timeout > 0 ? timeout : 60;

  return config;
}

function attachDryRun(payload, dryRun) {
  const base = payload && typeof payload === "object" ? payload : {};
  if (!dryRun) {
    return base;
  }
  return Object.assign({}, base, { __dryRun: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommandSync(command, args, options) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = result.stderr ? String(result.stderr).trim() : "";
    const stdout = result.stdout ? String(result.stdout).trim() : "";
    const details = stderr || stdout || `${command} exited with status ${result.status}`;
    throw new Error(details);
  }
  return String(result.stdout || "");
}

function swiftHelperEnv() {
  const env = { ...process.env };
  const moduleCache =
    env.SWIFT_MODULECACHE_PATH || path.join(env.TMPDIR || os.tmpdir(), "codex-swift-module-cache");
  try {
    fs.mkdirSync(moduleCache, { recursive: true });
  } catch (err) {
  }
  env.SWIFT_MODULECACHE_PATH = moduleCache;
  return env;
}

function runPremiereUiHelper(args) {
  const helperPath = path.join(__dirname, "premiere-ui-timecode.swift");
  const stdout = runCommandSync("swift", [helperPath, ...args], {
    env: swiftHelperEnv()
  });
  const parsed = JSON.parse(stdout);
  if (!parsed || parsed.ok !== true || !parsed.data) {
    throw new Error((parsed && parsed.error) || "Premiere UI helper returned no data");
  }
  return parsed.data;
}

function capturePremiereWindow(windowId) {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), "premiere-playhead-"));
  const capturePath = path.join(captureDir, "window.png");
  try {
    runCommandSync("screencapture", ["-x", `-l${windowId}`, capturePath]);
    return {
      path: capturePath,
      cleanup() {
        fs.rmSync(captureDir, { recursive: true, force: true });
      }
    };
  } catch (err) {
    try {
      fs.rmSync(captureDir, { recursive: true, force: true });
    } catch (cleanupErr) {
    }
    throw err;
  }
}

function clonePlayheadBridgeData(data) {
  if (!data || typeof data !== "object") {
    return data;
  }
  const clone = { ...data };
  delete clone.verification;
  return clone;
}

function numericDeltaOrNull(a, b) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return null;
  }
  return left - right;
}

function normalizeDebugTimecodeData(data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  if (data.timecode !== undefined && data.ticks !== undefined) {
    return {
      timecode: String(data.timecode),
      ticks: String(data.ticks),
      seconds: data.seconds !== undefined ? Number(data.seconds) : ticksToSeconds(data.ticks),
      frames: data.frames !== undefined ? Number(data.frames) : null,
      timebase: data.timebase !== undefined ? String(data.timebase) : null,
      nominalFps: data.nominalFps !== undefined ? Number(data.nominalFps) : null,
      dropFrame: data.dropFrame === true
    };
  }

  const computedTicks = numericOrNull(data.computedTicks);
  const timebase = numericOrNull(data.sequence && data.sequence.timebase);
  if (computedTicks === null || timebase === null || timebase <= 0) {
    return null;
  }

  const nominalFps = deriveNominalFps({ sequence: { timebase } }, timebase);
  return {
    timecode: data.input !== undefined ? String(data.input) : null,
    ticks: String(Math.round(computedTicks)),
    seconds: ticksToSeconds(computedTicks),
    frames: Math.round(computedTicks / timebase),
    timebase: String(Math.round(timebase)),
    nominalFps,
    dropFrame: data.input ? String(data.input).includes(";") : false
  };
}

async function readPlayheadFromPremiereUi() {
  if (process.platform !== "darwin") {
    return {
      ok: false,
      error: "UI verification is only available on macOS"
    };
  }

  try {
    const window = runPremiereUiHelper(["window-info"]);
    const capture = capturePremiereWindow(window.id);
    try {
      const ocr = runPremiereUiHelper(["ocr", capture.path]);
      if (!ocr.selected || !ocr.selected.timecode) {
        return {
          ok: false,
          error: "OCR did not find a playhead timecode candidate",
          window,
          ocr
        };
      }
      return {
        ok: true,
        window,
        selected: ocr.selected,
        candidates: Array.isArray(ocr.candidates) ? ocr.candidates : [],
        image: ocr.image || null
      };
    } finally {
      capture.cleanup();
    }
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err)
    };
  }
}

async function maybeVerifyPlayheadWithUi(config, bridgeResult) {
  if (!bridgeResult || !bridgeResult.body || bridgeResult.body.ok !== true || !bridgeResult.body.data) {
    return bridgeResult;
  }

  const bridgeData = clonePlayheadBridgeData(bridgeResult.body.data);
  const uiSnapshot = await readPlayheadFromPremiereUi();
  const verification = {
    selectedSource: "bridge",
    matched: null,
    bridge: bridgeData,
    ui: uiSnapshot.ok
      ? {
          timecode: uiSnapshot.selected.timecode,
          confidence: uiSnapshot.selected.confidence,
          occurrences: uiSnapshot.selected.occurrences,
          maxHeight: uiSnapshot.selected.maxHeight,
          anchorDistance: uiSnapshot.selected.anchorDistance,
          window: uiSnapshot.window,
          image: uiSnapshot.image,
          candidates: uiSnapshot.candidates
        }
      : {
          error: uiSnapshot.error
        }
  };

  if (!uiSnapshot.ok || !uiSnapshot.selected || !uiSnapshot.selected.timecode) {
    bridgeResult.body.data = {
      ...bridgeData,
      verification
    };
    return bridgeResult;
  }

  const bridgeTimecode = bridgeData.timecode ? String(bridgeData.timecode) : null;
  const uiTimecode = String(uiSnapshot.selected.timecode);

  if (Number(uiSnapshot.selected.confidence) < 0.7) {
    verification.ui.untrusted = true;
    bridgeResult.body.data = {
      ...bridgeData,
      verification
    };
    return bridgeResult;
  }

  let debugResult;
  try {
    debugResult = await sendCommand(config, "debugTimecode", { timecode: uiTimecode });
  } catch (err) {
    verification.ui.conversionError = err && err.message ? err.message : String(err);
    bridgeResult.body.data = {
      ...bridgeData,
      verification
    };
    return bridgeResult;
  }

  if (!debugResult || !debugResult.body || debugResult.body.ok !== true || !debugResult.body.data) {
    verification.ui.conversionError =
      (debugResult && debugResult.body && debugResult.body.error) || "debugTimecode conversion failed";
    bridgeResult.body.data = {
      ...bridgeData,
      verification
    };
    return bridgeResult;
  }

  const converted = normalizeDebugTimecodeData(debugResult.body.data);
  if (!converted) {
    verification.ui.conversionError = "Unable to normalize debugTimecode response";
    bridgeResult.body.data = {
      ...bridgeData,
      verification
    };
    return bridgeResult;
  }
  const uiTicks = Number(converted.ticks);
  const bridgeTicks = Number(bridgeData.ticks);
  const secondsDelta = numericDeltaOrNull(converted.seconds, bridgeData.seconds);
  const tickDelta = Number.isFinite(uiTicks) && Number.isFinite(bridgeTicks) ? uiTicks - bridgeTicks : null;
  const timebase = Number(converted.timebase);
  const frameDelta =
    Number.isFinite(tickDelta) && Number.isFinite(timebase) && timebase > 0 ? Math.round(tickDelta / timebase) : null;

  verification.matched = Number.isFinite(tickDelta) ? tickDelta === 0 : bridgeTimecode === uiTimecode;
  verification.tickDelta = Number.isFinite(tickDelta) ? String(Math.round(tickDelta)) : null;
  verification.secondsDelta = Number.isFinite(secondsDelta) ? secondsDelta : null;
  verification.frameDelta = Number.isFinite(frameDelta) ? frameDelta : null;
  verification.ui.converted = converted;

  if (verification.matched) {
    verification.selectedSource = "bridge";
    bridgeResult.body.data = {
      ...bridgeData,
      verification
    };
    return bridgeResult;
  }

  verification.selectedSource = "ui";

  bridgeResult.body.data = {
    ...bridgeData,
    ticks: String(converted.ticks),
    seconds: converted.seconds,
    timecode: String(converted.timecode),
    method: "macosVisionOcr",
    source: "ui",
    verification
  };
  return bridgeResult;
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

function normalizeSequenceBatchItems(input) {
  if (Array.isArray(input)) {
    return input;
  }
  if (input && Array.isArray(input.sequences)) {
    return input.sequences;
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

function readSequenceBatchItems(options) {
  if (options["sequences-file"]) {
    const raw = fs.readFileSync(options["sequences-file"], "utf8");
    const parsed = JSON.parse(raw);
    const sequences = normalizeSequenceBatchItems(parsed);
    if (!sequences) {
      throw new Error("Sequences file must be an array or an object with a sequences/items array");
    }
    return sequences;
  }

  if (options.sequences) {
    const parsed = JSON.parse(options.sequences);
    const sequences = normalizeSequenceBatchItems(parsed);
    if (!sequences) {
      throw new Error("--sequences must be a JSON array or an object with a sequences/items array");
    }
    return sequences;
  }

  throw new Error("Provide --sequences or --sequences-file");
}

function normalizeFilenameExtension(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === ".") {
    throw new Error("--filename-extension must include a non-empty extension such as .wav");
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("--filename-extension must be an extension only, not a path");
  }
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function normalizeLeafFilename(value, optionName) {
  const trimmed = value === undefined || value === null ? "" : String(value).trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || path.basename(trimmed) !== trimmed) {
    throw new Error(`${optionName} must be a leaf filename such as export.wav`);
  }
  return trimmed;
}

function slugifyFilenameSegment(value) {
  const text = value ? String(value) : "sequence";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "sequence";
}

function summarizeSequenceForBatch(sequence) {
  const seq = sequence && typeof sequence === "object" ? sequence : {};
  return {
    index: seq.index !== undefined ? Number(seq.index) : null,
    name: seq.name !== undefined && seq.name !== null ? String(seq.name) : null,
    id: seq.id !== undefined && seq.id !== null ? String(seq.id) : null,
    binPath: seq.binPath !== undefined && seq.binPath !== null ? String(seq.binPath) : ""
  };
}

function summarizeRequestedBatchItem(item) {
  const raw = item && typeof item === "object" ? item : {};
  const out = {};
  if (raw.id !== undefined && raw.id !== null) {
    out.id = String(raw.id);
  }
  if (raw.name !== undefined && raw.name !== null) {
    out.name = String(raw.name);
  }
  if (raw.outputPath !== undefined && raw.outputPath !== null) {
    out.outputPath = path.resolve(String(raw.outputPath));
  }
  if (raw.filename !== undefined && raw.filename !== null) {
    out.filename = String(raw.filename);
  }
  return out;
}

function describeOutputPath(outputPath) {
  if (!outputPath) {
    return {
      outputPath: null,
      outputDirectory: null,
      outputFilename: null
    };
  }
  const resolved = path.resolve(String(outputPath));
  return {
    outputPath: resolved,
    outputDirectory: path.dirname(resolved),
    outputFilename: path.basename(resolved)
  };
}

function readFileStatus(outputPath) {
  const details = describeOutputPath(outputPath);
  let exists = false;
  let bytes = 0;
  try {
    if (details.outputPath && fs.existsSync(details.outputPath)) {
      exists = true;
      bytes = fs.statSync(details.outputPath).size || 0;
    }
  } catch (errStat) {
  }
  return {
    exists,
    bytes
  };
}

function resolveBatchSequence(requested, sequences) {
  const selector = summarizeRequestedBatchItem(requested);
  const targetId = selector.id || null;
  const targetName = selector.name || null;
  if (!targetId && !targetName) {
    return {
      ok: false,
      error: "Each sequence item must include name, id, or both.",
      data: { requested: selector }
    };
  }

  const matches = (Array.isArray(sequences) ? sequences : []).filter((sequence) => {
    if (!sequence || typeof sequence !== "object") {
      return false;
    }
    if (targetId && String(sequence.id || "") !== targetId) {
      return false;
    }
    if (targetName && String(sequence.name || "") !== targetName) {
      return false;
    }
    return true;
  });

  if (matches.length === 1) {
    return {
      ok: true,
      requested: selector,
      sequence: summarizeSequenceForBatch(matches[0])
    };
  }

  const idMatches = targetId
    ? (Array.isArray(sequences) ? sequences : [])
        .filter((sequence) => sequence && String(sequence.id || "") === targetId)
        .map(summarizeSequenceForBatch)
    : [];
  const nameMatches = targetName
    ? (Array.isArray(sequences) ? sequences : [])
        .filter((sequence) => sequence && String(sequence.name || "") === targetName)
        .map(summarizeSequenceForBatch)
    : [];

  let error = "Sequence selector did not match any sequence.";
  if (matches.length > 1) {
    error = "Sequence selector matched multiple sequences.";
  } else if (targetId && targetName && idMatches.length === 1 && nameMatches.length === 1) {
    error = "Sequence id and name did not resolve to the same sequence.";
  } else if (targetName && nameMatches.length > 1) {
    error = "Sequence name matched multiple sequences. Use id or provide a unique selector.";
  } else if (targetId && idMatches.length === 1 && targetName) {
    error = "Sequence id matched, but the provided name did not match that sequence.";
  } else if (targetName && nameMatches.length === 1 && targetId) {
    error = "Sequence name matched, but the provided id did not match that sequence.";
  }

  return {
    ok: false,
    error,
    data: {
      requested: selector,
      idMatches,
      nameMatches
    }
  };
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

function deriveExactFps(timebase) {
  const tb = Number(timebase);
  if (Number.isNaN(tb) || tb <= 0) {
    return null;
  }
  const exact = TICKS_PER_SECOND / tb;
  return Number.isFinite(exact) && exact > 0 ? exact : null;
}

function parseTimecodeToFrames(timecode, fps, dropFrameHint) {
  if (!timecode) {
    return null;
  }
  const raw = String(timecode);
  // Respect the sequence drop-frame setting; do not infer drop-frame solely
  // from semicolons when the sequence is explicitly non-drop.
  const dropFrame = dropFrameHint === true || (dropFrameHint !== false && raw.includes(";"));
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

function secondsToFrameTicks(seconds, context, mode) {
  const value = Number(seconds);
  if (Number.isNaN(value)) {
    return null;
  }
  if (!context || !context.timebase || !context.fps) {
    return secondsToTicks(value);
  }
  const fpsForSeconds = context.fpsExact && context.fpsExact > 0 ? context.fpsExact : context.fps;
  const framesFloat = value * fpsForSeconds;
  let frames;
  if (mode === "ceil") {
    frames = Math.ceil(framesFloat - 1e-9);
  } else if (mode === "floor") {
    frames = Math.floor(framesFloat + 1e-9);
  } else {
    frames = Math.round(framesFloat);
  }
  return Math.max(0, Math.round(frames * context.timebase));
}

function ticksToSeconds(ticks) {
  return Number(ticks) / TICKS_PER_SECOND;
}

function paddingToTicks(args, context) {
  let paddingTicks = 0;
  if (args["padding-seconds"] !== undefined) {
    const ticks = secondsToFrameTicks(args["padding-seconds"], context, "round");
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

function rangeField(value, context, endpoint) {
  if (value === undefined || value === null) {
    return null;
  }
  const mode = endpoint === "end" ? "ceil" : "floor";
  if (typeof value === "number") {
    if (isProbablyTicks(value)) {
      return Math.round(value);
    }
    return secondsToFrameTicks(value, context, mode);
  }
  const str = String(value);
  if (str.includes(":") || str.includes(";")) {
    return timecodeToTicks(str, context);
  }
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    if (isProbablyTicks(numeric)) {
      return Math.round(numeric);
    }
    return secondsToFrameTicks(numeric, context, mode);
  }
  return null;
}

function isProbablyTicks(value) {
  if (value === undefined || value === null) {
    return false;
  }
  const n = Number(value);
  if (Number.isNaN(n)) {
    return false;
  }
  return Math.abs(n) > TICKS_PER_SECOND;
}

function numericOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function boolOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (value === true || value === false) {
    return value;
  }
  const normalized = String(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return null;
}

function rangeToTicks(range, context) {
  const startTicksRaw =
    numericOrNull(range.startTicks) ??
    numericOrNull(range.inTicks) ??
    (range.startSeconds !== undefined ? secondsToFrameTicks(range.startSeconds, context, "floor") : null) ??
    (range.inSeconds !== undefined ? secondsToFrameTicks(range.inSeconds, context, "floor") : null) ??
    (range.startTimecode !== undefined ? timecodeToTicks(range.startTimecode, context) : null) ??
    (range.inTimecode !== undefined ? timecodeToTicks(range.inTimecode, context) : null) ??
    rangeField(range.start, context, "start") ??
    rangeField(range.in, context, "start");

  const endTicksRaw =
    numericOrNull(range.endTicks) ??
    numericOrNull(range.outTicks) ??
    (range.endSeconds !== undefined ? secondsToFrameTicks(range.endSeconds, context, "ceil") : null) ??
    (range.outSeconds !== undefined ? secondsToFrameTicks(range.outSeconds, context, "ceil") : null) ??
    (range.endTimecode !== undefined ? timecodeToTicks(range.endTimecode, context) : null) ??
    (range.outTimecode !== undefined ? timecodeToTicks(range.outTimecode, context) : null) ??
    rangeField(range.end, context, "end") ??
    rangeField(range.out, context, "end");

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
  const frameTicks = Math.max(1, Math.round(context.timebase));
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
    // Align to frame boundaries to avoid off-by-one gaps on fractional seconds.
    startTicks = Math.floor(startTicks / frameTicks) * frameTicks;
    endTicks = Math.ceil(endTicks / frameTicks) * frameTicks;
    if (endTicks <= startTicks) {
      endTicks = startTicks + frameTicks;
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

function uxpPaths() {
  const baseDir = path.join(os.homedir(), "Library", "Application Support", "PremiereBridge");
  const ipcDir = path.join(baseDir, "uxp-ipc");
  return {
    baseDir,
    ipcDir,
    commandPath: path.join(ipcDir, "command.json"),
    resultPath: path.join(ipcDir, "result.json")
  };
}

function commandId() {
  return `cmd-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function sendCommandCep(config, cmd, payload) {
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

async function sendCommandUxp(config, cmd, payload, options) {
  const paths = uxpPaths();
  fs.mkdirSync(paths.ipcDir, { recursive: true });
  const id = commandId();
  const command = {
    id,
    command: cmd,
    payload: payload || {},
    token: config.token,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(paths.commandPath, JSON.stringify(command, null, 2));

  const timeoutSeconds = options && options.timeoutSeconds ? options.timeoutSeconds : config.uxpTimeoutSeconds;
  const timeoutMs = Math.max(1000, Math.round(Number(timeoutSeconds) * 1000));
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      if (fs.existsSync(paths.resultPath)) {
        const raw = fs.readFileSync(paths.resultPath, "utf8");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.id === id) {
            return { statusCode: 200, body: parsed };
          }
        }
      }
    } catch (errRead) {
      lastError = errRead;
    }
    await sleep(150);
  }
  const detail = lastError ? ` Last error: ${lastError.message}` : "";
  throw new Error(
    `Timed out waiting for UXP response (${timeoutSeconds}s). Ensure the UXP panel is running.${detail}`
  );
}

function isRetryableCepError(err) {
  if (!err) {
    return false;
  }
  const code = err.code || err.errno || "";
  return [
    "ECONNREFUSED",
    "ECONNRESET",
    "EHOSTUNREACH",
    "ENOTFOUND",
    "ETIMEDOUT"
  ].includes(String(code));
}

async function sendCommand(config, cmd, payload) {
  const transport = String(config.transport || "auto").toLowerCase();
  if (!config.token) {
    throw new Error("Missing auth token. Open the UXP panel and save the config first.");
  }
  if (transport === "uxp") {
    return sendCommandUxp(config, cmd, payload);
  }
  if (transport === "cep") {
    return sendCommandCep(config, cmd, payload);
  }
  try {
    return await sendCommandCep(config, cmd, payload);
  } catch (errCep) {
    if (!isRetryableCepError(errCep)) {
      throw errCep;
    }
    return sendCommandUxp(config, cmd, payload);
  }
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
  const dryRun = flagEnabled(args, "dry-run");

  if (command === "ping") {
    const result = await sendCommand(config, "ping", {});
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "reload-project") {
    const result = await sendCommand(config, "reloadProject", attachDryRun({}, dryRun));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "save-project") {
    const result = await sendCommand(config, "saveProject", attachDryRun({}, dryRun));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "duplicate-sequence") {
    const payload = {};
    if (args.name) {
      payload.name = String(args.name);
    }
    const result = await sendCommand(config, "duplicateSequence", attachDryRun(payload, dryRun));
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
    const result = await sendCommand(config, "openSequence", attachDryRun(payload, dryRun));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "find-item") {
    if (!args.name && !args.path) {
      throw new Error("Provide --name or --path for find-item");
    }
    const payload = {};
    if (args.name) {
      payload.name = String(args.name);
    }
    if (args.path) {
      payload.path = String(args.path);
    }
    if (flagEnabled(args, "contains")) {
      payload.contains = true;
    }
    if (flagEnabled(args, "case-sensitive")) {
      payload.caseSensitive = true;
    }
    if (args.limit !== undefined) {
      const limit = Number(args.limit);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error("--limit must be a positive number");
      }
      payload.limit = Math.round(limit);
    }
    const result = await sendCommand(config, "findProjectItem", payload);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "insert-clip") {
    if ((config.transport || "").toLowerCase() === "uxp") {
      throw new Error("insert-clip is currently supported only on CEP. Use --transport cep.");
    }
    if (args["item-id"] === undefined || args["item-id"] === null || String(args["item-id"]).trim() === "") {
      throw new Error("Provide --item-id for insert-clip");
    }

    const videoTrackIndex = numericOrNull(args["video-track-index"]);
    const audioTrackIndex = numericOrNull(args["audio-track-index"]);
    if (videoTrackIndex === null || videoTrackIndex < 0 || Math.floor(videoTrackIndex) !== videoTrackIndex) {
      throw new Error("--video-track-index must be a non-negative integer");
    }
    if (audioTrackIndex === null || audioTrackIndex < 0 || Math.floor(audioTrackIndex) !== audioTrackIndex) {
      throw new Error("--audio-track-index must be a non-negative integer");
    }

    const locationKeys = [
      args.at !== undefined ? "at" : null,
      args.timecode !== undefined ? "timecode" : null,
      args.seconds !== undefined ? "seconds" : null,
      args.ticks !== undefined ? "ticks" : null
    ].filter(Boolean);
    if (locationKeys.length !== 1) {
      throw new Error("Provide exactly one insert location: --at playhead, --timecode, --seconds, or --ticks");
    }

    const payload = {
      itemId: String(args["item-id"]),
      videoTrackIndex,
      audioTrackIndex
    };
    if (args.at !== undefined) {
      const at = String(args.at).toLowerCase();
      if (at !== "playhead") {
        throw new Error("--at currently supports only 'playhead'");
      }
      payload.at = "playhead";
      const playheadResult = await sendCommand(config, "getPlayheadPosition", {});
      await maybeVerifyPlayheadWithUi(config, playheadResult);
      if (!playheadResult.body || playheadResult.body.ok !== true || !playheadResult.body.data) {
        throw new Error(
          `Failed to resolve playhead for insert-clip: ${playheadResult.body && playheadResult.body.error}`
        );
      }
      payload.ticks = Number(playheadResult.body.data.ticks);
      if (playheadResult.body.data.timecode) {
        payload.timecode = String(playheadResult.body.data.timecode);
      }
      if (playheadResult.body.data.source) {
        payload.playheadSource = String(playheadResult.body.data.source);
      }
      if (playheadResult.body.data.method) {
        payload.playheadMethod = String(playheadResult.body.data.method);
      }
    } else if (args.timecode !== undefined) {
      payload.timecode = String(args.timecode);
    } else if (args.seconds !== undefined) {
      const seconds = Number(args.seconds);
      if (!Number.isFinite(seconds) || seconds < 0) {
        throw new Error("--seconds must be a non-negative number");
      }
      payload.seconds = seconds;
    } else if (args.ticks !== undefined) {
      const ticks = Number(args.ticks);
      if (!Number.isFinite(ticks) || ticks < 0) {
        throw new Error("--ticks must be a non-negative number");
      }
      payload.ticks = ticks;
    }

    const result = await sendCommandCep(config, "insertClip", attachDryRun(payload, dryRun));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "transcript-json") {
    const timeoutSeconds = args["timeout-seconds"] !== undefined ? Number(args["timeout-seconds"]) : 30;
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
      throw new Error("--timeout-seconds must be a positive number");
    }
    const result = await sendCommandUxp(
      config,
      "transcriptJSON",
      {},
      { timeoutSeconds }
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "export-sequence-audio") {
    const payload = {};
    if (args.output !== undefined) {
      payload.outputPath = path.resolve(String(args.output));
    }
    if (args.preset !== undefined) {
      payload.presetPath = path.resolve(String(args.preset));
    }
    if (args["timeout-seconds"] !== undefined) {
      const timeoutSeconds = Number(args["timeout-seconds"]);
      if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
        throw new Error("--timeout-seconds must be a positive number");
      }
      payload.timeoutSeconds = timeoutSeconds;
    }
    const result = await sendCommand(config, "exportSequenceAudio", attachDryRun(payload, dryRun));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "export-sequences-direct") {
    const sequenceItems = readSequenceBatchItems(args);
    if (!Array.isArray(sequenceItems) || sequenceItems.length === 0) {
      throw new Error("export-sequences-direct requires at least one sequence item");
    }
    if (args.preset === undefined) {
      throw new Error("export-sequences-direct requires --preset /abs/path.epr");
    }

    const requestedTransport = String(config.transport || "auto").toLowerCase();
    if (requestedTransport === "uxp") {
      throw new Error("export-sequences-direct is currently supported only on CEP. Use --transport cep.");
    }

    const presetPath = path.resolve(String(args.preset));
    if (!fs.existsSync(presetPath)) {
      throw new Error(`export-sequences-direct preset not found: ${presetPath}`);
    }
    const outputDir = args["output-dir"] !== undefined ? path.resolve(String(args["output-dir"])) : null;
    const filenameExtension = normalizeFilenameExtension(args["filename-extension"]);
    const initialResults = sequenceItems.map((item, index) => ({
      itemIndex: index,
      requested: summarizeRequestedBatchItem(item),
      ok: false,
      stage: "plan",
      sequence: null,
      outputPath: null,
      outputDirectory: null,
      outputFilename: null,
      outputPathSource: null,
      presetPath,
      file: {
        exists: false,
        bytes: 0
      }
    }));

    for (let i = 0; i < sequenceItems.length; i += 1) {
      const item = sequenceItems[i];
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        initialResults[i].error = "Each sequence item must be an object.";
      }
    }

    const listFailure = (message, extraData) => ({
      statusCode: 200,
      body: {
        ok: false,
        error: message,
        data: Object.assign(
          {
            transport: "cep",
            presetPath,
            outputDirectory: outputDir,
            filenameExtension,
            requestedCount: sequenceItems.length,
            exportedCount: 0,
            failedCount: sequenceItems.length,
            results: initialResults
          },
          extraData || {}
        )
      }
    });

    let listResult;
    try {
      listResult = await sendCommandCep(config, "listSequences", {});
    } catch (errList) {
      console.log(JSON.stringify(listFailure(`Failed to list sequences before batch export: ${errList.message}`), null, 2));
      return;
    }

    if (!listResult || !listResult.body || listResult.body.ok !== true) {
      console.log(
        JSON.stringify(
          listFailure("Failed to list sequences before batch export.", {
            stage: "listSequences",
            bridge: listResult && listResult.body ? listResult.body : listResult
          }),
          null,
          2
        )
      );
      return;
    }

    const listData = listResult.body.data && typeof listResult.body.data === "object" ? listResult.body.data : {};
    const availableSequences = Array.isArray(listData.sequences) ? listData.sequences : [];
    const activeSequenceBefore = listData.active && typeof listData.active === "object"
      ? {
          id: listData.active.id !== undefined && listData.active.id !== null ? String(listData.active.id) : null,
          name: listData.active.name !== undefined && listData.active.name !== null ? String(listData.active.name) : null
        }
      : { id: null, name: null };

    const plannedResults = sequenceItems.map((item, index) => {
      const requested = summarizeRequestedBatchItem(item);
      const baseResult = {
        itemIndex: index,
        requested,
        ok: false,
        stage: "resolve-sequence",
        sequence: null,
        outputPath: null,
        outputDirectory: null,
        outputFilename: null,
        outputPathSource: null,
        presetPath,
        file: {
          exists: false,
          bytes: 0
        }
      };

      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return Object.assign(baseResult, { error: "Each sequence item must be an object." });
      }

      const resolved = resolveBatchSequence(item, availableSequences);
      if (!resolved.ok) {
        return Object.assign(baseResult, {
          error: resolved.error,
          matches: resolved.data || null
        });
      }

      return Object.assign(baseResult, {
        sequence: resolved.sequence
      });
    });

    const derivedSlugCounts = new Map();
    for (const planned of plannedResults) {
      if (!planned.sequence || !planned.requested || planned.requested.outputPath || planned.requested.filename) {
        continue;
      }
      const slug = slugifyFilenameSegment(planned.sequence.name || planned.sequence.id || `sequence-${planned.itemIndex + 1}`);
      derivedSlugCounts.set(slug, (derivedSlugCounts.get(slug) || 0) + 1);
    }

    const usedDerivedBases = new Map();
    for (let i = 0; i < plannedResults.length; i += 1) {
      const planned = plannedResults[i];
      if (!planned.sequence) {
        continue;
      }
      const requested = planned.requested;

      try {
        if (requested.outputPath) {
          const details = describeOutputPath(requested.outputPath);
          planned.outputPath = details.outputPath;
          planned.outputDirectory = details.outputDirectory;
          planned.outputFilename = details.outputFilename;
          planned.outputPathSource = "item-output-path";
          planned.exportPayload = {
            outputPath: details.outputPath,
            presetPath,
            outputPathSource: planned.outputPathSource
          };
        } else if (requested.filename !== undefined) {
          if (!outputDir) {
            throw new Error("Per-sequence filename requires --output-dir /abs/dir.");
          }
          const filename = normalizeLeafFilename(requested.filename, "sequence filename");
          planned.outputPath = path.join(outputDir, filename);
          planned.outputDirectory = outputDir;
          planned.outputFilename = filename;
          planned.outputPathSource = "item-filename-and-output-dir";
          planned.exportPayload = {
            outputDir,
            filename,
            presetPath,
            outputPathSource: planned.outputPathSource
          };
        } else {
          if (!outputDir) {
            throw new Error("Missing output target. Provide item outputPath values or use --output-dir /abs/dir.");
          }
          if (!filenameExtension) {
            throw new Error("Derived batch filenames require --filename-extension when using --output-dir.");
          }
          const slug = slugifyFilenameSegment(planned.sequence.name || planned.sequence.id || `sequence-${planned.itemIndex + 1}`);
          let filenameBase = slug;
          if ((derivedSlugCounts.get(slug) || 0) > 1) {
            const discriminatorSource = planned.sequence.id || `sequence-${planned.sequence.index !== null ? planned.sequence.index + 1 : planned.itemIndex + 1}`;
            filenameBase = `${slug}-${slugifyFilenameSegment(discriminatorSource)}`;
          }
          const usageCount = (usedDerivedBases.get(filenameBase) || 0) + 1;
          usedDerivedBases.set(filenameBase, usageCount);
          if (usageCount > 1) {
            filenameBase = `${filenameBase}-${usageCount}`;
          }
          const filename = `${filenameBase}${filenameExtension}`;
          planned.outputPath = path.join(outputDir, filename);
          planned.outputDirectory = outputDir;
          planned.outputFilename = filename;
          planned.outputPathSource = "output-dir-and-derived-filename";
          planned.exportPayload = {
            outputDir,
            filename,
            presetPath,
            outputPathSource: planned.outputPathSource
          };
        }
      } catch (errPlan) {
        planned.error = errPlan.message;
        planned.stage = "resolve-output";
        planned.exportPayload = null;
      }
    }

    if (dryRun) {
      const dryRunResults = plannedResults.map((planned) => {
        const file = readFileStatus(planned.outputPath);
        return Object.assign({}, planned, {
          ok: !planned.error,
          skipped: true,
          dryRun: true,
          stage: planned.error ? planned.stage : "dry-run",
          file
        });
      });
      const failedCount = dryRunResults.filter((item) => !item.ok).length;
      console.log(
        JSON.stringify(
          {
            statusCode: 200,
            body: failedCount === 0
              ? {
                  ok: true,
                  data: {
                    transport: "cep",
                    dryRun: true,
                    skipped: true,
                    presetPath,
                    outputDirectory: outputDir,
                    filenameExtension,
                    requestedCount: dryRunResults.length,
                    exportedCount: 0,
                    failedCount,
                    activeSequenceBefore,
                    restore: {
                      skipped: true,
                      reason: "dry-run"
                    },
                    results: dryRunResults
                  }
                }
              : {
                  ok: false,
                  error: "One or more batch export items failed validation.",
                  data: {
                    transport: "cep",
                    dryRun: true,
                    skipped: true,
                    presetPath,
                    outputDirectory: outputDir,
                    filenameExtension,
                    requestedCount: dryRunResults.length,
                    exportedCount: 0,
                    failedCount,
                    activeSequenceBefore,
                    restore: {
                      skipped: true,
                      reason: "dry-run"
                    },
                    results: dryRunResults
                  }
                }
          },
          null,
          2
        )
      );
      return;
    }

    const results = [];
    let exportedCount = 0;

    for (const planned of plannedResults) {
      if (planned.error || !planned.exportPayload || !planned.sequence) {
        results.push(
          Object.assign({}, planned, {
            ok: false,
            skipped: false,
            file: readFileStatus(planned.outputPath)
          })
        );
        continue;
      }

      const openPayload = {};
      if (planned.sequence && planned.sequence.id) {
        openPayload.id = planned.sequence.id;
      } else if (planned.sequence && planned.sequence.name) {
        openPayload.name = planned.sequence.name;
      }

      let openResult;
      try {
        openResult = await sendCommandCep(config, "openSequence", openPayload);
      } catch (errOpen) {
        results.push(
          Object.assign({}, planned, {
            ok: false,
            stage: "open-sequence",
            error: `Failed to open sequence: ${errOpen.message}`,
            file: readFileStatus(planned.outputPath)
          })
        );
        continue;
      }

      const openBody = openResult && openResult.body && typeof openResult.body === "object"
        ? openResult.body
        : null;
      if (!openBody || openBody.ok !== true) {
        results.push(
          Object.assign({}, planned, {
            ok: false,
            stage: "open-sequence",
            error: openBody && openBody.error ? String(openBody.error) : "Failed to open sequence.",
            bridge: openBody && openBody.data ? openBody.data : openBody,
            file: readFileStatus(planned.outputPath)
          })
        );
        continue;
      }

      let exportResult;
      try {
        exportResult = await sendCommandCep(config, "exportSequenceDirect", planned.exportPayload);
      } catch (errExport) {
        results.push(
          Object.assign({}, planned, {
            ok: false,
            stage: "export-sequence-direct",
            error: `Failed to export sequence: ${errExport.message}`,
            file: readFileStatus(planned.outputPath)
          })
        );
        continue;
      }

      const exportBody = exportResult && exportResult.body && typeof exportResult.body === "object"
        ? exportResult.body
        : null;
      const exportData = exportBody && exportBody.data && typeof exportBody.data === "object" ? exportBody.data : {};
      const outputPath = exportData.outputPath || planned.outputPath;
      const outputDetails = describeOutputPath(outputPath);
      const file = readFileStatus(outputDetails.outputPath);
      const exportOk = !!(exportBody && exportBody.ok === true);
      const fileOk = file.exists && file.bytes > 0;
      const itemOk = exportOk && fileOk;
      const itemResult = Object.assign({}, planned, {
        ok: itemOk,
        stage: itemOk ? "exported" : (exportOk ? "verify-output" : "export-sequence-direct"),
        sequence: exportData.sequence && typeof exportData.sequence === "object"
          ? Object.assign({}, planned.sequence, {
              name: exportData.sequence.name !== undefined && exportData.sequence.name !== null
                ? String(exportData.sequence.name)
                : planned.sequence.name
            })
          : planned.sequence,
        outputPath: outputDetails.outputPath,
        outputDirectory: outputDetails.outputDirectory,
        outputFilename: outputDetails.outputFilename,
        outputPathSource: planned.outputPathSource || exportData.outputPathSource || null,
        method: exportData.method || null,
        file,
        error: itemOk
          ? null
          : (exportOk
              ? "Direct export finished but output file is missing or empty."
              : (exportBody && exportBody.error ? String(exportBody.error) : "Direct export failed.")),
        bridge: itemOk ? null : exportData
      });
      if (itemResult.ok) {
        exportedCount += 1;
      }
      results.push(itemResult);
    }

    let restore = {
      skipped: true,
      reason: "No active sequence was recorded before batch export."
    };
    let restoreFailed = false;

    if (activeSequenceBefore && (activeSequenceBefore.id || activeSequenceBefore.name)) {
      const restorePayload = {};
      if (activeSequenceBefore.id) {
        restorePayload.id = activeSequenceBefore.id;
      } else if (activeSequenceBefore.name) {
        restorePayload.name = activeSequenceBefore.name;
      }

      try {
        const restoreResult = await sendCommandCep(config, "openSequence", restorePayload);
        const restoreBody = restoreResult && restoreResult.body && typeof restoreResult.body === "object"
          ? restoreResult.body
          : null;
        if (restoreBody && restoreBody.ok === true) {
          restore = {
            skipped: false,
            ok: true,
            sequence: restoreBody.data && restoreBody.data.sequence ? restoreBody.data.sequence : restorePayload,
            methods: restoreBody.data && restoreBody.data.methods ? restoreBody.data.methods : null
          };
        } else {
          restoreFailed = true;
          restore = {
            skipped: false,
            ok: false,
            error: restoreBody && restoreBody.error ? String(restoreBody.error) : "Failed to restore previously active sequence."
          };
        }
      } catch (errRestore) {
        restoreFailed = true;
        restore = {
          skipped: false,
          ok: false,
          error: `Failed to restore previously active sequence: ${errRestore.message}`
        };
      }
    }

    const failedCount = results.filter((item) => !item.ok).length;
    const overallOk = failedCount === 0 && !restoreFailed;
    let overallError = null;
    if (failedCount > 0 && restoreFailed) {
      overallError = "One or more batch exports failed, and restoring the previously active sequence failed.";
    } else if (failedCount > 0) {
      overallError = "One or more batch exports failed.";
    } else if (restoreFailed) {
      overallError = "Batch exports completed, but restoring the previously active sequence failed.";
    }
    console.log(
      JSON.stringify(
        {
          statusCode: 200,
          body: overallOk
            ? {
                ok: true,
                data: {
                  transport: "cep",
                  presetPath,
                  outputDirectory: outputDir,
                  filenameExtension,
                  requestedCount: results.length,
                  exportedCount,
                  failedCount,
                  restoreFailed,
                  activeSequenceBefore,
                  restore,
                  results
                }
              }
            : {
                ok: false,
                error: overallError,
                data: {
                  transport: "cep",
                  presetPath,
                  outputDirectory: outputDir,
                  filenameExtension,
                  requestedCount: results.length,
                  exportedCount,
                  failedCount,
                  restoreFailed,
                  activeSequenceBefore,
                  restore,
                  results
                }
              }
        },
        null,
        2
      )
    );
    return;
  }

  if (command === "export-sequence-direct") {
    const hasOutput = args.output !== undefined;
    const hasOutputDir = args["output-dir"] !== undefined;
    const hasFilename = args.filename !== undefined;
    if (hasOutput && (hasOutputDir || hasFilename)) {
      throw new Error("export-sequence-direct accepts either --output /abs/path.ext or --output-dir /abs/dir with --filename name.ext, not both");
    }
    if (!hasOutput && (!hasOutputDir || !hasFilename)) {
      throw new Error("export-sequence-direct requires either --output /abs/path.ext or both --output-dir /abs/dir and --filename name.ext");
    }
    if (args.preset === undefined) {
      throw new Error("export-sequence-direct requires --preset /abs/path.epr");
    }
    const requestedTransport = String(config.transport || "auto").toLowerCase();
    if (requestedTransport === "uxp") {
      throw new Error("export-sequence-direct is currently supported only on CEP. Use --transport cep.");
    }
    const payload = {
      presetPath: path.resolve(String(args.preset))
    };
    if (hasOutput) {
      payload.outputPath = path.resolve(String(args.output));
    } else {
      payload.outputDir = path.resolve(String(args["output-dir"]));
      payload.filename = String(args.filename);
    }
    const result = await sendCommandCep(config, "exportSequenceDirect", attachDryRun(payload, dryRun));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "menu-command-id") {
    let names = [];
    if (args.names) {
      const parsed = JSON.parse(String(args.names));
      if (!Array.isArray(parsed)) {
        throw new Error("--names must be a JSON array of menu names");
      }
      names = parsed.map((n) => String(n));
    } else if (args.name) {
      names = [String(args.name)];
    } else {
      throw new Error("Provide --name or --names for menu-command-id");
    }
    const result = await sendCommand(config, "findMenuCommandId", { names });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "add-markers") {
    const markers = readMarkers(args);
    const result = await sendCommand(config, "addMarkers", attachDryRun({ markers }, dryRun));
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

  if (command === "get-playhead") {
    const result = await sendCommand(config, "getPlayheadPosition", {});
    await maybeVerifyPlayheadWithUi(config, result);
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
    const result = await sendCommand(
      config,
      "setPlayheadTimecode",
      attachDryRun({ timecode: args.timecode }, dryRun)
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "set-in-out") {
    if (!args.in || !args.out) {
      throw new Error("Provide --in and --out timecodes for set-in-out");
    }
    const result = await sendCommand(
      config,
      "setInOutPoints",
      attachDryRun(
        {
          inTimecode: args.in,
          outTimecode: args.out
        },
        dryRun
      )
    );
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

    const result = await sendCommand(config, "extractRange", attachDryRun(payload, dryRun));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "ripple-delete-selection") {
    const payload = {};
    if (args["command-id"] !== undefined) {
      payload.commandId = Number(args["command-id"]);
    }
    const result = await sendCommand(config, "rippleDeleteSelection", attachDryRun(payload, dryRun));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "rough-cut") {
    const ranges = readRanges(args);
    if (!ranges.length) {
      throw new Error("No ranges provided");
    }

    const activeInfo = await sendCommand(config, "getSequenceInfo", attachDryRun({}, dryRun));
    if (!activeInfo.body || !activeInfo.body.ok) {
      throw new Error(`Failed to read active sequence: ${activeInfo.body && activeInfo.body.error}`);
    }
    const activeName = String(activeInfo.body.data && activeInfo.body.data.name ? activeInfo.body.data.name : "Sequence");
    const duplicateName = args.name ? String(args.name) : `${activeName} Rough Cut`;

    let dupResult;
    if (dryRun) {
      dupResult = {
        statusCode: 200,
        body: {
          ok: true,
          data: {
            dryRun: true,
            skipped: true,
            name: duplicateName,
            sourceSequence: activeName
          }
        }
      };
    } else {
      dupResult = await sendCommand(config, "duplicateSequence", attachDryRun({ name: duplicateName }, dryRun));
      if (!dupResult.body || !dupResult.body.ok) {
        throw new Error(`Failed to duplicate sequence: ${dupResult.body && dupResult.body.error}`);
      }
    }

    const inventoryResult = await sendCommand(config, "sequenceInventory", attachDryRun({}, dryRun));
    if (!inventoryResult.body || !inventoryResult.body.ok) {
      throw new Error(`Failed to read sequence inventory: ${inventoryResult.body && inventoryResult.body.error}`);
    }

    const inventory = inventoryResult.body.data;
    const bounds = getSequenceBounds(inventory);
    const timebase = deriveTimebase(inventory);
    const fpsExact = deriveExactFps(timebase);
    const context = {
      timebase,
      fps: deriveNominalFps(inventory, timebase),
      fpsExact,
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
      const gapDurationSeconds = ticksToSeconds(gap.endTicks - gap.startTicks);
      const extractInTicks = gap.startTicks;
      const extractOutTicks = gap.endTicks;
      if (dryRun) {
        processed.push({
          gap,
          seconds: gapDurationSeconds,
          extractInTicks: String(extractInTicks),
          extractOutTicks: String(extractOutTicks),
          method: "dryRun",
          skipped: true
        });
        continue;
      }
      const extractResult = await sendCommand(
        config,
        "extractRange",
        attachDryRun(
          {
            inTicks: extractInTicks,
            outTicks: extractOutTicks
          },
          dryRun
        )
      );
      if (!extractResult.body || !extractResult.body.ok) {
        throw new Error(`Failed to extract gap ${gap.startTicks}-${gap.endTicks}: ${extractResult.body && extractResult.body.error}`);
      }
      processed.push({
        gap,
        seconds: gapDurationSeconds,
        extractInTicks: String(extractInTicks),
        extractOutTicks: String(extractOutTicks),
        method: extractResult.body.data && extractResult.body.data.extract && extractResult.body.data.extract.method
      });
    }

    const saveResult = dryRun
      ? { statusCode: 200, body: { ok: true, data: { dryRun: true, skipped: true } } }
      : await sendCommand(config, "saveProject", attachDryRun({}, dryRun));

    const output = {
      dryRun,
      sourceSequence: activeName,
      targetSequenceName: duplicateName,
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
      gapsPlanned: gaps.map((gap) => ({
        startTicks: String(gap.startTicks),
        endTicks: String(gap.endTicks),
        durationSeconds: ticksToSeconds(gap.endTicks - gap.startTicks),
        extractInTicks: String(gap.startTicks),
        extractOutTicks: String(gap.endTicks)
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
    const result = await sendCommand(config, "razorAtTimecode", attachDryRun(payload, dryRun));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "add-markers-file") {
    if (!args.file) {
      throw new Error("Provide --file for add-markers-file");
    }
    const result = await sendCommand(
      config,
      "addMarkersFromFile",
      attachDryRun({ filePath: args.file }, dryRun)
    );
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
    const result = await sendCommand(config, "toggleVideoTrack", attachDryRun(payload, dryRun));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "set-track-state") {
    const payload = {};
    if (args.track !== undefined) {
      payload.track = String(args.track);
    }
    if (args.kind !== undefined) {
      payload.kind = String(args.kind);
    }
    const mute = boolOrNull(args.mute);
    const visible = boolOrNull(args.visible);
    if (mute !== null) {
      payload.mute = mute;
    }
    if (visible !== null) {
      payload.visible = visible;
    }
    if (!payload.track) {
      throw new Error("Provide --track V1|A1 (or numeric track)");
    }
    if (payload.mute === undefined && payload.visible === undefined) {
      throw new Error("Provide --mute and/or --visible");
    }
    const result = await sendCommand(config, "setTrackState", attachDryRun(payload, dryRun));
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
