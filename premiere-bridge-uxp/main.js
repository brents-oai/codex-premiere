const { entrypoints, storage } = require("uxp");
const premiere = require("premierepro");

let osModule = null;
let pathModule = null;
let fsModule = null;
try {
  osModule = require("os");
} catch (errOs) {
}
try {
  pathModule = require("path");
} catch (errPath) {
}
try {
  fsModule = require("fs");
} catch (errFs) {
}

const { localFileSystem, types } = storage;
const constants = (premiere && (premiere.Constants || premiere.constants)) || {};

const DEFAULT_PORT = 17321;
const TICKS_PER_SECOND = 254016000000;
const MAX_LOG_LINES = 400;
const POLL_MS = 350;

const PATHS = {
  baseDir: null,
  ipcDir: null,
  commandPath: null,
  resultPath: null,
  configPath: null
};

const state = {
  started: false,
  intervalId: null,
  pollInFlight: false,
  lastCommandId: null,
  initialized: false,
  desiredRunning: true,
  config: null
};

let ipcStatusEl;
let lastCommandEl;
let ipcDirEl;
let configPathEl;
let portEl;
let tokenEl;
let logEl;
let startBtn;
let stopBtn;
let saveBtn;
let regenBtn;
let pingBtn;
let reloadBtn;
let saveProjectBtn;
let exportBtn;

const MUTATING_COMMANDS = new Set([
  "reloadProject",
  "saveProject",
  "duplicateSequence",
  "openSequence",
  "addMarkers",
  "addMarkersFromFile",
  "setPlayheadTimecode",
  "setInOutPoints",
  "extractRange",
  "rippleDeleteSelection",
  "razorAtTimecode",
  "toggleVideoTrack",
  "setTrackState"
]);

function joinPath(a, b) {
  if (pathModule && pathModule.join) {
    return pathModule.join(a, b);
  }
  if (!a) {
    return b;
  }
  return a.endsWith("/") ? a + b : a + "/" + b;
}

function fileUrl(nativePath) {
  const normalized = nativePath.startsWith("/") ? nativePath : "/" + nativePath;
  return "file://" + encodeURI(normalized);
}

function ticksToSeconds(ticks) {
  const n = Number(ticks);
  if (Number.isNaN(n)) {
    return null;
  }
  return n / TICKS_PER_SECOND;
}

function pad2(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return (v < 10 ? "0" : "") + String(v);
}

function formatForLog(value, maxLen) {
  const limit = maxLen || 240;
  if (value === undefined) {
    return "";
  }
  let text;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch (err) {
    text = String(value);
  }
  if (!text) {
    return "";
  }
  if (text.length > limit) {
    return text.slice(0, limit) + "...";
  }
  return text;
}

function appendLog(message) {
  if (!logEl) {
    return;
  }
  const time = new Date().toISOString().replace("T", " ").replace("Z", "");
  const line = `[${time}] ${message}`;
  const prev = logEl.textContent ? logEl.textContent.split("\n") : [];
  prev.push(line);
  const trimmed = prev.slice(-MAX_LOG_LINES);
  logEl.textContent = trimmed.join("\n");
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text, isOnline) {
  if (!ipcStatusEl) {
    return;
  }
  ipcStatusEl.textContent = text;
  if (typeof isOnline === "boolean") {
    ipcStatusEl.classList.toggle("online", isOnline);
    ipcStatusEl.classList.toggle("offline", !isOnline);
    if (startBtn) {
      startBtn.disabled = isOnline;
    }
    if (stopBtn) {
      stopBtn.disabled = !isOnline;
    }
  }
}

function setLastCommand(text) {
  if (lastCommandEl) {
    lastCommandEl.textContent = text || "None";
  }
}

function hasUiElements() {
  return !!(
    document.getElementById("ipc-status") &&
    document.getElementById("last-command") &&
    document.getElementById("ipc-dir") &&
    document.getElementById("log")
  );
}

function randomTokenHex(bytes) {
  const size = Math.max(8, Number(bytes) || 16);
  const arr = new Uint8Array(size);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i += 1) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = "";
  for (const b of arr) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

async function ensurePaths() {
  if (PATHS.baseDir) {
    return PATHS;
  }
  let homePath = null;
  try {
    const homeEntry = await localFileSystem.getHomeFolder();
    if (homeEntry && homeEntry.nativePath) {
      homePath = homeEntry.nativePath;
    }
  } catch (errHome) {
  }
  if (!homePath && osModule && osModule.homedir) {
    try {
      homePath = osModule.homedir();
    } catch (errHomedir) {
    }
  }
  if (!homePath) {
    throw new Error("Unable to resolve home directory");
  }
  PATHS.baseDir = joinPath(homePath, "Library/Application Support/PremiereBridge");
  PATHS.ipcDir = joinPath(PATHS.baseDir, "uxp-ipc");
  PATHS.commandPath = joinPath(PATHS.ipcDir, "command.json");
  PATHS.resultPath = joinPath(PATHS.ipcDir, "result.json");
  PATHS.configPath = joinPath(PATHS.baseDir, "config.json");
  return PATHS;
}

async function ensureFolder(nativePath) {
  const url = fileUrl(nativePath);
  try {
    return await localFileSystem.getEntryWithUrl(url);
  } catch (errGet) {
    try {
      return await localFileSystem.createEntryWithUrl(url, { type: types.folder });
    } catch (errCreate) {
      throw new Error(`Failed to ensure folder at ${nativePath}: ${String(errCreate)}`);
    }
  }
}

async function ensureFile(nativePath) {
  const url = fileUrl(nativePath);
  try {
    return await localFileSystem.getEntryWithUrl(url);
  } catch (errGet) {
    try {
      return await localFileSystem.createEntryWithUrl(url, { type: types.file });
    } catch (errCreate) {
      throw new Error(`Failed to ensure file at ${nativePath}: ${String(errCreate)}`);
    }
  }
}

async function readJsonFile(nativePath) {
  try {
    const entry = await localFileSystem.getEntryWithUrl(fileUrl(nativePath));
    const raw = await entry.read();
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

async function writeJsonFile(nativePath, data) {
  const entry = await ensureFile(nativePath);
  await entry.write(JSON.stringify(data, null, 2));
}

function updateFields(config, paths) {
  if (portEl && config && config.port) {
    portEl.value = String(config.port);
  }
  if (tokenEl && config && config.token) {
    tokenEl.value = String(config.token);
  }
  if (ipcDirEl && paths && paths.ipcDir) {
    ipcDirEl.textContent = paths.ipcDir;
  }
  if (configPathEl && paths && paths.configPath) {
    configPathEl.textContent = `Config: ${paths.configPath}`;
  }
}

async function loadConfig() {
  const paths = await ensurePaths();
  await ensureFolder(paths.baseDir);
  const existing = await readJsonFile(paths.configPath);
  let nextConfig = existing && typeof existing === "object" ? existing : {};

  if (!nextConfig.port) {
    nextConfig.port = DEFAULT_PORT;
  }
  if (!nextConfig.token) {
    nextConfig.token = randomTokenHex(16);
  }
  if (!nextConfig.transport) {
    nextConfig.transport = "uxp";
  }

  await writeJsonFile(paths.configPath, nextConfig);
  state.config = nextConfig;
  updateFields(nextConfig, paths);
  return nextConfig;
}

async function saveConfigFromUi() {
  const paths = await ensurePaths();
  const current = state.config || (await loadConfig());
  const nextConfig = Object.assign({}, current, {
    port: Number(portEl && portEl.value ? portEl.value : current.port || DEFAULT_PORT) || DEFAULT_PORT,
    token: tokenEl && tokenEl.value ? String(tokenEl.value) : current.token || randomTokenHex(16),
    transport: "uxp"
  });
  await writeJsonFile(paths.configPath, nextConfig);
  state.config = nextConfig;
  appendLog(`Saved config (port=${nextConfig.port})`);
}

async function regenerateToken() {
  if (!tokenEl) {
    return;
  }
  tokenEl.value = randomTokenHex(16);
  await saveConfigFromUi();
}

function slugifyName(value) {
  const text = value ? String(value) : "active-sequence";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "active-sequence";
}

function timestampForFilename() {
  const now = new Date();
  return [
    now.getFullYear(),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
    "-",
    pad2(now.getHours()),
    pad2(now.getMinutes()),
    pad2(now.getSeconds())
  ].join("");
}

async function pathExists(nativePath) {
  if (!nativePath) {
    return false;
  }
  if (fsModule && typeof fsModule.existsSync === "function") {
    try {
      return fsModule.existsSync(nativePath);
    } catch (errExists) {
    }
  }
  try {
    await localFileSystem.getEntryWithUrl(fileUrl(nativePath));
    return true;
  } catch (errEntry) {
    return false;
  }
}

async function fileInfo(nativePath) {
  const info = { exists: false, bytes: 0 };
  if (!nativePath) {
    return info;
  }
  if (fsModule && typeof fsModule.existsSync === "function" && typeof fsModule.statSync === "function") {
    try {
      if (fsModule.existsSync(nativePath)) {
        const stat = fsModule.statSync(nativePath);
        info.exists = true;
        info.bytes = Number(stat.size || 0);
        return info;
      }
    } catch (errStat) {
    }
  }
  try {
    const entry = await localFileSystem.getEntryWithUrl(fileUrl(nativePath));
    info.exists = true;
    if (entry && typeof entry.getMetadata === "function") {
      try {
        const metadata = await entry.getMetadata();
        if (metadata && metadata.size !== undefined && metadata.size !== null) {
          info.bytes = Number(metadata.size) || 0;
          return info;
        }
      } catch (errMeta) {
      }
    }
    if (entry && entry.size !== undefined && entry.size !== null) {
      info.bytes = Number(entry.size) || 0;
    }
  } catch (errRead) {
  }
  return info;
}

async function ensureParentFolder(nativePath) {
  if (!nativePath) {
    throw new Error("Missing path for ensureParentFolder");
  }
  if (pathModule && typeof pathModule.dirname === "function") {
    await ensureFolder(pathModule.dirname(nativePath));
    return;
  }
  const idx = nativePath.lastIndexOf("/");
  if (idx > 0) {
    await ensureFolder(nativePath.slice(0, idx));
  }
}

async function readSequenceName(sequence) {
  if (!sequence) {
    return null;
  }
  try {
    if (typeof sequence.getName === "function") {
      const value = await sequence.getName();
      if (value) {
        return String(value);
      }
    }
  } catch (errGetName) {
  }
  try {
    if (sequence.name) {
      return String(sequence.name);
    }
  } catch (errName) {
  }
  return null;
}

async function readSequenceId(sequence) {
  if (!sequence) {
    return null;
  }
  try {
    if (typeof sequence.getSequenceId === "function") {
      const value = await sequence.getSequenceId();
      if (value !== undefined && value !== null) {
        return String(value);
      }
    }
  } catch (errGetId) {
  }
  for (const key of ["id", "sequenceID", "sequenceId", "sequence_id", "guid"]) {
    try {
      if (sequence[key] !== undefined && sequence[key] !== null) {
        return String(sequence[key]);
      }
    } catch (errKey) {
    }
  }
  return null;
}

function exportPresetCandidates(payload, config) {
  function normalizeCandidatePath(raw) {
    if (!raw) {
      return null;
    }
    const text = String(raw).trim();
    if (!text) {
      return null;
    }
    if (text.indexOf("plugin:/") === 0) {
      return decodeURI(text.slice("plugin:".length));
    }
    if (text.indexOf("file://") === 0) {
      return decodeURI(text.replace(/^file:\/\//, ""));
    }
    if (text[0] === "/") {
      return text;
    }
    if (pathModule && typeof pathModule.resolve === "function") {
      return pathModule.resolve(text);
    }
    return text;
  }

  const candidates = [];
  const rawCandidates = [
    payload && payload.presetPath,
    config && config.audioExportPreset,
    config && config.defaultAudioExportPreset,
    config && config.exportPresetPath
  ];
  const homeDir = osModule && typeof osModule.homedir === "function" ? osModule.homedir() : null;
  if (homeDir) {
    rawCandidates.push(joinPath(homeDir, "Library/Application Support/PremiereBridge/presets/premiere-bridge-audio-wav-48k.epr"));
    rawCandidates.push(joinPath(homeDir, "Library/Application Support/PremiereBridge/presets/sequence-audio-wav-48k.epr"));
  }
  if (typeof __dirname !== "undefined") {
    rawCandidates.push(joinPath(__dirname, "presets/sequence-audio-wav-48k.epr"));
    rawCandidates.push(joinPath(__dirname, "presets/wav-48k-pcm.epr"));
    rawCandidates.push(joinPath(__dirname, "presets/wav-48k.epr"));
  }
  for (const raw of rawCandidates) {
    const resolved = normalizeCandidatePath(raw);
    if (resolved && !candidates.includes(resolved)) {
      candidates.push(resolved);
    }
  }
  return candidates;
}

async function resolvePresetPath(payload, config) {
  const candidates = exportPresetCandidates(payload, config);
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return { ok: true, presetPath: candidate, candidates };
    }
  }
  return { ok: false, presetPath: null, candidates };
}

async function waitForNonEmptyFile(nativePath, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = await fileInfo(nativePath);
    if (info.exists && Number(info.bytes || 0) > 0) {
      return info;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return await fileInfo(nativePath);
}

function splitDryRunPayload(payload) {
  const base = payload && typeof payload === "object" ? payload : {};
  const dryRun = base.__dryRun === true;
  if (!dryRun) {
    return { dryRun: false, cleanPayload: base };
  }
  const cleanPayload = Object.assign({}, base);
  delete cleanPayload.__dryRun;
  return { dryRun: true, cleanPayload };
}

async function getActiveProject() {
  const project = await premiere.Project.getActiveProject();
  if (!project) {
    throw new Error("No active project");
  }
  return project;
}

async function getActiveSequence(project) {
  const proj = project || (await getActiveProject());
  const sequence = await proj.getActiveSequence();
  if (!sequence) {
    throw new Error("No active sequence");
  }
  return sequence;
}

function tickTimeToTicks(tickTime) {
  if (!tickTime) {
    return null;
  }
  try {
    if (tickTime.ticks !== undefined && tickTime.ticks !== null) {
      const n = Number(tickTime.ticks);
      if (!Number.isNaN(n)) {
        return Math.round(n);
      }
    }
  } catch (errTicks) {
  }
  try {
    if (typeof tickTime.getTicks === "function") {
      const v = tickTime.getTicks();
      const n = Number(v);
      if (!Number.isNaN(n)) {
        return Math.round(n);
      }
    }
  } catch (errGetTicks) {
  }
  return null;
}

function tickTimeToSeconds(tickTime) {
  if (!tickTime) {
    return null;
  }
  try {
    if (tickTime.seconds !== undefined && tickTime.seconds !== null) {
      const n = Number(tickTime.seconds);
      if (!Number.isNaN(n)) {
        return n;
      }
    }
  } catch (errSeconds) {
  }
  try {
    if (typeof tickTime.getSeconds === "function") {
      const v = tickTime.getSeconds();
      const n = Number(v);
      if (!Number.isNaN(n)) {
        return n;
      }
    }
  } catch (errGetSeconds) {
  }
  return null;
}

function tickTimeFromTicks(ticks) {
  const rounded = Math.max(0, Math.round(Number(ticks) || 0));
  return premiere.TickTime.createWithTicks(String(rounded));
}

function createSequenceEditor(sequence) {
  if (premiere.SequenceEditor && typeof premiere.SequenceEditor.getEditor === "function") {
    return premiere.SequenceEditor.getEditor(sequence);
  }
  if (premiere.SequenceEditor && typeof premiere.SequenceEditor.createSequenceEditor === "function") {
    return premiere.SequenceEditor.createSequenceEditor(sequence);
  }
  if (sequence && typeof sequence.createSequenceEditor === "function") {
    return sequence.createSequenceEditor();
  }
  throw new Error(
    "SequenceEditor.getEditor is unavailable (checked premiere.SequenceEditor.getEditor, premiere.SequenceEditor.createSequenceEditor, and sequence.createSequenceEditor)"
  );
}

function selectionAddItem(selection, trackItem) {
  if (!selection) {
    throw new Error("Track item selection is unavailable");
  }
  if (typeof selection.addItem === "function") {
    return selection.addItem(trackItem, false);
  }
  if (typeof selection.addTrackItem === "function") {
    return selection.addTrackItem(trackItem);
  }
  throw new Error("TrackItemSelection.addItem is unavailable");
}

function selectionItems(selection) {
  if (!selection) {
    return [];
  }
  if (typeof selection.getTrackItems === "function") {
    return normalizeTrackItems(selection.getTrackItems());
  }
  if (
    typeof selection.getTrackItemCount === "function" &&
    typeof selection.getTrackItemAt === "function"
  ) {
    const out = [];
    const count = Number(selection.getTrackItemCount()) || 0;
    for (let i = 0; i < count; i += 1) {
      out.push(selection.getTrackItemAt(i));
    }
    return out;
  }
  return [];
}

function relToAbsTicks(ticksValue, context) {
  if (ticksValue === null || ticksValue === undefined) {
    return null;
  }
  const n = Math.round(Number(ticksValue));
  if (Number.isNaN(n) || !context || !context.startTicks) {
    return Number.isNaN(n) ? null : n;
  }
  const start = Math.round(Number(context.startTicks) || 0);
  if (start > 0 && n >= start) {
    return n;
  }
  return start + n;
}

function absToRelTicks(ticksValue, context) {
  if (ticksValue === null || ticksValue === undefined) {
    return null;
  }
  const n = Math.round(Number(ticksValue));
  if (Number.isNaN(n) || !context || !context.startTicks) {
    return Number.isNaN(n) ? null : n;
  }
  const start = Math.round(Number(context.startTicks) || 0);
  if (start <= 0 || n < start) {
    return n;
  }
  return Math.max(0, n - start);
}

function summarizeTicks(ticksValue, context) {
  if (ticksValue === null || ticksValue === undefined || Number.isNaN(Number(ticksValue))) {
    return { ticks: null, seconds: null, timecode: null };
  }
  const rounded = Math.round(Number(ticksValue));
  const absTicks = context ? relToAbsTicks(rounded, context) : rounded;
  return {
    ticks: absTicks === null ? null : String(absTicks),
    seconds: absTicks === null ? null : ticksToSeconds(absTicks),
    timecode: absTicks === null ? null : ticksToTimecode(absTicks, context || null)
  };
}

function deriveDropFrame(settings) {
  if (!settings || !constants || !constants.VideoDisplayFormatType) {
    return null;
  }
  const format = settings.videoDisplayFormat;
  const fmt = constants.VideoDisplayFormatType;
  if (format === fmt.FPS_29_97 || format === fmt.FPS_59_94 || format === fmt.FPS_119_88) {
    return true;
  }
  if (
    format === fmt.FPS_29_97_NON_DROP ||
    format === fmt.FPS_59_94_NON_DROP ||
    format === fmt.FPS_119_88_NON_DROP
  ) {
    return false;
  }
  return null;
}

async function buildSequenceContext() {
  const project = await getActiveProject();
  const sequence = await getActiveSequence(project);

  let settings = null;
  let settingsError = null;
  try {
    if (typeof sequence.getSettings === "function") {
      settings = await sequence.getSettings();
    }
  } catch (errSettings) {
    settingsError = String(errSettings);
  }

  let timebase = null;
  try {
    if (typeof sequence.getTimebase === "function") {
      timebase = Number(await sequence.getTimebase());
    }
  } catch (errTimebase) {
  }
  if ((!timebase || Number.isNaN(timebase)) && settings && settings.videoFrameRate) {
    const ticks = Number(settings.videoFrameRate.ticks);
    if (!Number.isNaN(ticks) && ticks > 0) {
      timebase = ticks;
    }
  }
  if (!timebase || Number.isNaN(timebase) || timebase <= 0) {
    throw new Error("Unable to derive sequence timebase");
  }

  let nominalFps = null;
  if (settings && settings.videoFrameRate && settings.videoFrameRate.seconds) {
    const seconds = Number(settings.videoFrameRate.seconds);
    if (!Number.isNaN(seconds) && seconds > 0) {
      nominalFps = Math.round(1 / seconds);
    }
  }
  if (!nominalFps || Number.isNaN(nominalFps)) {
    nominalFps = Math.round(TICKS_PER_SECOND / timebase);
  }
  if (!nominalFps || nominalFps <= 0) {
    nominalFps = 30;
  }

  let startTicks = 0;
  try {
    if (typeof sequence.getZeroPoint === "function") {
      const zero = await sequence.getZeroPoint();
      const ticks = tickTimeToTicks(zero);
      if (ticks !== null && !Number.isNaN(ticks)) {
        startTicks = ticks;
      }
    }
  } catch (errZero) {
  }

  let endTicks = null;
  try {
    if (typeof sequence.getEndTime === "function") {
      const endTime = await sequence.getEndTime();
      const ticks = tickTimeToTicks(endTime);
      if (ticks !== null && !Number.isNaN(ticks)) {
        endTicks = ticks;
      }
    }
  } catch (errEnd) {
  }

  if (endTicks !== null && startTicks > 0 && endTicks < startTicks) {
    endTicks += startTicks;
  }

  const dropFrame = deriveDropFrame(settings);

  return {
    project,
    sequence,
    settings,
    settingsError,
    timebase,
    nominalFps,
    dropFrame,
    startTicks,
    endTicks
  };
}

function parseTimecodeToFrames(timecode, fps, dropFrameHint) {
  if (!timecode) {
    return null;
  }
  const raw = String(timecode);
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
  if (!context) {
    return null;
  }
  const frames = parseTimecodeToFrames(timecode, context.nominalFps, context.dropFrame);
  if (frames === null) {
    return null;
  }
  return Math.round(context.startTicks + frames * context.timebase);
}

function secondsToTicks(seconds) {
  const value = Number(seconds);
  if (Number.isNaN(value)) {
    return null;
  }
  return Math.round(value * TICKS_PER_SECOND);
}

function ticksToTimecode(ticks, context) {
  const n = Math.max(0, Math.round(Number(ticks) || 0));
  const tb = context && context.timebase ? Number(context.timebase) : null;
  const fps = context && context.nominalFps ? Number(context.nominalFps) : null;
  if (!tb || !fps || Number.isNaN(tb) || Number.isNaN(fps) || tb <= 0 || fps <= 0) {
    return null;
  }
  let frames = Math.floor((n - (context.startTicks || 0)) / tb);
  if (frames < 0) {
    frames = 0;
  }
  const dropFrame = context && context.dropFrame === true;
  if (dropFrame) {
    const dropFrames = Math.round(fps * 0.066666);
    const framesPerHour = fps * 3600;
    const framesPer24Hours = framesPerHour * 24;
    const framesPer10Minutes = (fps * 600) - (dropFrames * 9);
    const framesPerMinute = (fps * 60) - dropFrames;
    frames = frames % framesPer24Hours;
    const d = Math.floor(frames / framesPer10Minutes);
    const m = frames % framesPer10Minutes;
    let extraMinutes = Math.floor(Math.max(0, m - dropFrames) / framesPerMinute);
    if (extraMinutes > 9) {
      extraMinutes = 9;
    }
    const totalMinutes = (d * 10) + extraMinutes;
    frames += dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));
  }
  const framesPerHour = fps * 3600;
  const framesPerMinute = fps * 60;
  const hours = Math.floor(frames / framesPerHour);
  frames = frames % framesPerHour;
  const minutes = Math.floor(frames / framesPerMinute);
  frames = frames % framesPerMinute;
  const seconds = Math.floor(frames / fps);
  const framePart = frames % fps;
  const separator = dropFrame ? ";" : ":";
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}${separator}${pad2(framePart)}`;
}

function ticksFromPayload(payload, prefix, context) {
  if (!payload) {
    return null;
  }
  const ticksKey = prefix + "Ticks";
  if (payload[ticksKey] !== undefined && payload[ticksKey] !== null) {
    const n = Number(payload[ticksKey]);
    if (!Number.isNaN(n)) {
      return Math.round(n);
    }
  }
  const secondsKey = prefix + "Seconds";
  if (payload[secondsKey] !== undefined && payload[secondsKey] !== null) {
    const ticks = secondsToTicks(payload[secondsKey]);
    if (ticks !== null) {
      return Math.round(ticks);
    }
  }
  const timecodeKey = prefix + "Timecode";
  if (payload[timecodeKey]) {
    const ticks = timecodeToTicks(payload[timecodeKey], context);
    if (ticks !== null) {
      return ticks;
    }
  }
  const raw = payload[prefix];
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw === "number") {
    if (Math.abs(raw) > TICKS_PER_SECOND) {
      return Math.round(raw);
    }
    const ticks = secondsToTicks(raw);
    return ticks === null ? null : ticks;
  }
  const str = String(raw);
  if (str.includes(":") || str.includes(";")) {
    return timecodeToTicks(str, context);
  }
  const n = Number(str);
  if (!Number.isNaN(n)) {
    if (Math.abs(n) > TICKS_PER_SECOND) {
      return Math.round(n);
    }
    const ticks = secondsToTicks(n);
    return ticks === null ? null : ticks;
  }
  return null;
}

function ensureInOutTicks(payload, context) {
  const inTicks = ticksFromPayload(payload, "in", context);
  const outTicks = ticksFromPayload(payload, "out", context);
  if (inTicks === null || outTicks === null) {
    return { ok: false, error: "Provide in/out ticks, seconds, or timecode" };
  }
  if (outTicks <= inTicks) {
    return { ok: false, error: "out must be greater than in" };
  }
  return { ok: true, inTicks, outTicks };
}

async function setInOutTicks(context, inTicks, outTicks) {
  const { project, sequence } = context;
  const inRel = absToRelTicks(inTicks, context);
  const outRel = absToRelTicks(outTicks, context);
  const inTime = tickTimeFromTicks(inRel);
  const outTime = tickTimeFromTicks(outRel);
  const inAction = sequence.createSetInPointAction(inTime);
  const outAction = sequence.createSetOutPointAction(outTime);
  await project.executeTransaction(async (compound) => {
    compound.addAction(inAction);
    compound.addAction(outAction);
  }, "Set in/out points");
}

async function exportSequenceAudio(payload) {
  const paths = await ensurePaths();
  const config = state.config || (await loadConfig());
  if (!config || !config.token) {
    throw new Error(`Missing config token at ${paths.configPath}`);
  }

  const project = await getActiveProject();
  const sequence = await getActiveSequence(project);
  const sequenceName = (await readSequenceName(sequence)) || "active-sequence";
  const sequenceId = await readSequenceId(sequence);

  const timeoutSeconds = payload && payload.timeoutSeconds !== undefined ? Number(payload.timeoutSeconds) : 60;
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new Error("timeoutSeconds must be a positive number");
  }
  const timeoutMs = Math.round(timeoutSeconds * 1000);

  const outputBase =
    payload && payload.outputPath
      ? String(payload.outputPath)
      : joinPath(paths.baseDir, `tmp/${slugifyName(sequenceName)}-${timestampForFilename()}.wav`);
  const outputPath = /\.wav$/i.test(outputBase) ? outputBase : `${outputBase}.wav`;
  await ensureParentFolder(outputPath);

  const presetResolved = await resolvePresetPath(payload || {}, config);
  if (!presetResolved.ok || !presetResolved.presetPath) {
    throw new Error(
      `No audio export preset found. Provide --preset or set config.audioExportPreset/defaultAudioExportPreset. Candidates: ${presetResolved.candidates.join(", ")}`
    );
  }
  const presetPath = presetResolved.presetPath;
  const workAreaType = payload && payload.workAreaType !== undefined ? Number(payload.workAreaType) : 0;
  const normalizedWorkAreaType = Number.isFinite(workAreaType) ? Math.max(0, Math.round(workAreaType)) : 0;
  const dryRun = payload && payload.__dryRun === true;

  if (dryRun) {
    return {
      dryRun: true,
      skipped: true,
      transport: "uxp",
      sequence: { name: sequenceName, id: sequenceId },
      outputPath,
      presetPath,
      workAreaType: normalizedWorkAreaType,
      presetCandidates: presetResolved.candidates
    };
  }

  const attempts = [];
  const errors = [];
  let method = null;
  let rawResult = null;
  let pendingExportPromise = null;

  async function attempt(label, invoke) {
    attempts.push(label);
    try {
      await invoke();
      return true;
    } catch (errAttempt) {
      errors.push(`${label}: ${String(errAttempt && errAttempt.message ? errAttempt.message : errAttempt)}`);
      return false;
    }
  }

  function tryStartExport(label, invoke) {
    attempts.push(label);
    try {
      const maybe = invoke();
      rawResult = maybe === undefined ? null : maybe;
      if (maybe && typeof maybe.then === "function") {
        pendingExportPromise = maybe.catch((errPending) => {
          errors.push(
            `${label} (async): ${String(errPending && errPending.message ? errPending.message : errPending)}`
          );
          return null;
        });
      }
      method = label;
      return true;
    } catch (errStart) {
      errors.push(`${label}: ${String(errStart && errStart.message ? errStart.message : errStart)}`);
      return false;
    }
  }

  if (!method && typeof sequence.exportAsMediaDirect === "function") {
    tryStartExport("sequence.exportAsMediaDirect(outputPath,presetPath,workAreaType)", () =>
      sequence.exportAsMediaDirect(outputPath, presetPath, normalizedWorkAreaType)
    );
  }

  if (!method && typeof sequence.exportAsMedia === "function") {
    tryStartExport("sequence.exportAsMedia(outputPath,presetPath,workAreaType)", () =>
      sequence.exportAsMedia(outputPath, presetPath, normalizedWorkAreaType)
    );
  }

  if (!method && typeof project.exportSequenceAsMediaDirect === "function") {
    tryStartExport("project.exportSequenceAsMediaDirect(sequence,outputPath,presetPath,workAreaType)", () =>
      project.exportSequenceAsMediaDirect(sequence, outputPath, presetPath, normalizedWorkAreaType)
    );
  }

  if (!method && premiere.EncoderManager && typeof premiere.EncoderManager.getManager === "function") {
    const exportConstants = (premiere && (premiere.Constants || premiere.constants)) || {};
    const exportTypes = [];
    if (exportConstants.ExportType) {
      const values = exportConstants.ExportType;
      exportTypes.push(values.IMMEDIATELY, values.IMMEDIATE, values.EXPORT_IMMEDIATELY, values.ExportImmediately);
      exportTypes.push(values.QUEUE_IN_AME, values.QUEUE, values.QUEUE_TO_AME);
      try {
        Object.keys(values).forEach((key) => exportTypes.push(values[key]));
      } catch (errEnumKeys) {
      }
    }
    exportTypes.push(0, 1, 2);
    const normalizedExportTypes = exportTypes.filter(
      (value, index, arr) => value !== undefined && value !== null && arr.indexOf(value) === index
    );

    let manager = null;
    const managerReady = await attempt("EncoderManager.getManager()", async () => {
      manager = await premiere.EncoderManager.getManager();
      if (!manager) {
        throw new Error("EncoderManager.getManager() returned null");
      }
    });

    if (managerReady && manager && typeof manager.exportSequence === "function") {
      for (const exportType of normalizedExportTypes) {
        if (method) {
          break;
        }
        const attemptSpecs = [
          {
            label: `EncoderManager.exportSequence(sequence,${String(exportType)},outputPath,presetPath,true)`,
            args: [sequence, exportType, outputPath, presetPath, true]
          },
          {
            label: `EncoderManager.exportSequence(sequence,${String(exportType)},outputPath,presetPath,false)`,
            args: [sequence, exportType, outputPath, presetPath, false]
          },
          {
            label: `EncoderManager.exportSequence(sequence,outputPath,presetPath,${String(exportType)},true)`,
            args: [sequence, outputPath, presetPath, exportType, true]
          },
          {
            label: `EncoderManager.exportSequence(sequence,outputPath,presetPath,${String(exportType)},false)`,
            args: [sequence, outputPath, presetPath, exportType, false]
          },
          {
            label: `EncoderManager.exportSequence(sequence,${String(exportType)},outputPath,presetPath)`,
            args: [sequence, exportType, outputPath, presetPath]
          }
        ];
        for (const spec of attemptSpecs) {
          if (method) {
            break;
          }
          tryStartExport(spec.label, () => manager.exportSequence.apply(manager, spec.args));
        }
      }
    } else if (managerReady && manager && typeof manager.exportSequence === "undefined") {
      errors.push("EncoderManager available but exportSequence is undefined");
    }
  }

  if (!method) {
    throw new Error(
      `No supported UXP export API available for sequence audio. Attempts: ${attempts.join(", ")}. Errors: ${errors.join(" | ")}`
    );
  }

  let file = await waitForNonEmptyFile(outputPath, timeoutMs);
  if ((!file.exists || Number(file.bytes || 0) <= 0) && pendingExportPromise) {
    await Promise.race([
      pendingExportPromise,
      new Promise((resolve) => setTimeout(resolve, 1000))
    ]);
    file = await fileInfo(outputPath);
  }
  if (!file.exists || Number(file.bytes || 0) <= 0) {
    throw new Error(`Export command finished but output file is missing or empty at ${outputPath}. Method: ${method}`);
  }

  return {
    transport: "uxp",
    sequence: { name: sequenceName, id: sequenceId },
    outputPath,
    presetPath,
    method,
    rawResult: rawResult === undefined ? null : rawResult,
    file,
    durationSeconds: null,
    workAreaType: normalizedWorkAreaType,
    attempts
  };
}

async function exportTranscriptJson() {
  const project = await getActiveProject();
  const sequence = await getActiveSequence(project);
  const projectItem = await sequence.getProjectItem();
  if (!projectItem) {
    throw new Error("Active sequence has no project item");
  }
  const clipItem = await premiere.ClipProjectItem.cast(projectItem);
  if (!clipItem) {
    throw new Error("Unable to cast sequence project item to ClipProjectItem");
  }
  const jsonText = await premiere.Transcript.exportToJSON(clipItem);
  if (!jsonText) {
    throw new Error("Transcript export returned empty data");
  }
  let transcriptJson = null;
  try {
    transcriptJson = JSON.parse(jsonText);
  } catch (errParse) {
    transcriptJson = null;
  }
  return {
    sequence: {
      name: sequence.name || null,
      guid: sequence.guid || null
    },
    transcriptText: jsonText,
    transcriptJson
  };
}

function clipName(trackItem) {
  if (!trackItem) {
    return null;
  }
  if (trackItem.name) {
    return String(trackItem.name);
  }
  return null;
}

async function clipSource(trackItem) {
  let inTicks = null;
  let outTicks = null;
  try {
    if (typeof trackItem.getInPoint === "function") {
      const inPoint = await trackItem.getInPoint();
      inTicks = tickTimeToTicks(inPoint);
    }
  } catch (errIn) {
  }
  try {
    if (typeof trackItem.getOutPoint === "function") {
      const outPoint = await trackItem.getOutPoint();
      outTicks = tickTimeToTicks(outPoint);
    }
  } catch (errOut) {
  }
  return {
    inPoint: summarizeTicks(inTicks),
    outPoint: summarizeTicks(outTicks)
  };
}

function normalizeTrackItems(items) {
  if (!items) {
    return [];
  }
  if (Array.isArray(items)) {
    return items;
  }
  if (typeof items.length === "number") {
    try {
      return Array.prototype.slice.call(items);
    } catch (errSlice) {
    }
  }
  if (typeof items.getItemCount === "function" && typeof items.getTrackItemAt === "function") {
    const out = [];
    const count = Number(items.getItemCount()) || 0;
    for (let i = 0; i < count; i += 1) {
      out.push(items.getTrackItemAt(i));
    }
    return out;
  }
  return [];
}

async function getTrackClipItems(track) {
  if (!track || typeof track.getTrackItems !== "function") {
    throw new Error("Track does not expose getTrackItems()");
  }

  const attempts = [];
  const clipTypeCandidates = [];

  if (constants && constants.TrackItemType && constants.TrackItemType.CLIP !== undefined) {
    clipTypeCandidates.push(constants.TrackItemType.CLIP);
  }
  if (premiere && premiere.TrackItemType && premiere.TrackItemType.CLIP !== undefined) {
    clipTypeCandidates.push(premiere.TrackItemType.CLIP);
  }

  for (const clipType of clipTypeCandidates) {
    if (attempts.indexOf(`typed:${String(clipType)}`) !== -1) {
      continue;
    }
    attempts.push(`typed:${String(clipType)}`);
    try {
      return normalizeTrackItems(await track.getTrackItems(clipType, false));
    } catch (errTyped) {
    }
  }

  const fallbackCalls = [
    { label: "implicit-false", args: [false] },
    { label: "implicit-empty", args: [] }
  ];
  for (const attempt of fallbackCalls) {
    attempts.push(attempt.label);
    try {
      return normalizeTrackItems(await track.getTrackItems.apply(track, attempt.args));
    } catch (errFallback) {
    }
  }

  throw new Error(`Unable to enumerate track items via getTrackItems (${attempts.join(", ")})`);
}

async function collectTrackItems(context, kind, trackIndex, track) {
  const items = await getTrackClipItems(track);
  const clips = [];
  const durationContext = {
    timebase: context.timebase,
    nominalFps: context.nominalFps,
    dropFrame: context.dropFrame,
    startTicks: 0
  };
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const startTicksRel = tickTimeToTicks(await item.getStartTime());
    const endTicksRel = tickTimeToTicks(await item.getEndTime());
    const durationTicks = tickTimeToTicks(await item.getDuration());
    clips.push({
      kind,
      trackIndex,
      clipIndex: i,
      name: clipName(item),
      start: summarizeTicks(startTicksRel, context),
      end: summarizeTicks(endTicksRel, context),
      duration: summarizeTicks(durationTicks, durationContext),
      source: await clipSource(item)
    });
  }
  return clips;
}

async function sequenceInventory() {
  const context = await buildSequenceContext();
  const { sequence } = context;

  const videoTracks = [];
  const videoCount = await sequence.getVideoTrackCount();
  for (let i = 0; i < videoCount; i += 1) {
    const track = await sequence.getVideoTrack(i);
    const clips = await collectTrackItems(context, "video", i, track);
    videoTracks.push({ kind: "video", trackIndex: i, clipCount: clips.length, clips });
  }

  const audioTracks = [];
  const audioCount = await sequence.getAudioTrackCount();
  for (let i = 0; i < audioCount; i += 1) {
    const track = await sequence.getAudioTrack(i);
    const clips = await collectTrackItems(context, "audio", i, track);
    audioTracks.push({ kind: "audio", trackIndex: i, clipCount: clips.length, clips });
  }

  return {
    sequence: {
      name: sequence.name || null,
      guid: sequence.guid || null,
      id: sequence.guid || null,
      timebase: String(context.timebase),
      nominalFps: context.nominalFps,
      dropFrame: context.dropFrame,
      start: summarizeTicks(context.startTicks),
      startTimecode: ticksToTimecode(context.startTicks, context),
      settings: context.settings,
      settingsError: context.settingsError
    },
    tracks: {
      video: videoTracks,
      audio: audioTracks
    }
  };
}

async function getSequenceInfo() {
  const context = await buildSequenceContext();
  const { sequence } = context;
  return {
    name: sequence.name || null,
    guid: sequence.guid || null,
    id: sequence.guid || null,
    timebase: String(context.timebase),
    settings: context.settings,
    settingsError: context.settingsError
  };
}

async function getPlayheadPosition() {
  const context = await buildSequenceContext();
  const { sequence } = context;
  if (typeof sequence.getPlayerPosition !== "function") {
    throw new Error("Sequence.getPlayerPosition is unavailable");
  }
  const rawPosition = await sequence.getPlayerPosition();
  const relTicks = tickTimeToTicks(rawPosition);
  const relSeconds = tickTimeToSeconds(rawPosition);
  if (relTicks === null || Number.isNaN(relTicks)) {
    throw new Error("Unable to read current playhead position");
  }
  let inPointTicks = null;
  try {
    if (typeof sequence.getInPoint === "function") {
      inPointTicks = tickTimeToTicks(await sequence.getInPoint());
    }
  } catch (errInPoint) {
  }
  let videoDisplayFormat = null;
  try {
    if (typeof sequence.getSequenceVideoTimeDisplayFormat === "function") {
      videoDisplayFormat = await sequence.getSequenceVideoTimeDisplayFormat();
    }
  } catch (errDisplayFormat) {
  }
  const summary = summarizeTicks(relTicks, context);
  return {
    ticks: summary.ticks,
    seconds: summary.seconds,
    timecode: summary.timecode,
    method: "sequence.getPlayerPosition",
    source: "uxp",
    rawPlayerPositionTicks: String(relTicks),
    rawPlayerPositionSecondsTicks:
      relSeconds === null || Number.isNaN(relSeconds) ? null : String(Math.round(secondsToTicks(relSeconds))),
    sequenceInPointTicks:
      inPointTicks === null || Number.isNaN(inPointTicks) ? null : String(Math.round(inPointTicks)),
    sequenceStartTicks: String(context.startTicks || 0),
    videoDisplayFormat: videoDisplayFormat
  };
}

async function debugTimecode(payload) {
  const context = await buildSequenceContext();
  if (!payload || !payload.timecode) {
    throw new Error("Provide timecode");
  }
  const ticks = timecodeToTicks(payload.timecode, context);
  if (ticks === null) {
    throw new Error("Unable to convert timecode");
  }
  const frames = Math.round((ticks - context.startTicks) / context.timebase);
  return {
    timecode: String(payload.timecode),
    ticks: String(ticks),
    seconds: ticksToSeconds(ticks),
    frames,
    timebase: String(context.timebase),
    nominalFps: context.nominalFps,
    dropFrame: context.dropFrame
  };
}

async function setPlayheadTimecode(payload) {
  const context = await buildSequenceContext();
  const { sequence } = context;
  if (!payload || (!payload.timecode && payload.ticks === undefined && payload.seconds === undefined)) {
    throw new Error("Provide timecode, ticks, or seconds");
  }
  let ticks = null;
  if (payload.ticks !== undefined && payload.ticks !== null) {
    ticks = Math.round(Number(payload.ticks));
  } else if (payload.seconds !== undefined && payload.seconds !== null) {
    ticks = secondsToTicks(payload.seconds);
  } else if (payload.timecode) {
    ticks = timecodeToTicks(payload.timecode, context);
  }
  if (ticks === null || Number.isNaN(ticks)) {
    throw new Error("Unable to convert playhead target to ticks");
  }
  const relTicks = absToRelTicks(ticks, context);
  await sequence.setPlayerPosition(tickTimeFromTicks(relTicks));
  return {
    ticks: String(ticks),
    timecode: ticksToTimecode(ticks, context)
  };
}

function parseTrackRef(trackRef, kindHint) {
  if (!trackRef && !kindHint) {
    throw new Error("Provide --track like V1 or A1");
  }
  const raw = trackRef ? String(trackRef).trim() : "";
  const match = raw.match(/^([VAva])(\d+)$/);
  if (match) {
    const kind = match[1].toUpperCase() === "V" ? "video" : "audio";
    const index = Math.max(0, Number(match[2]) - 1);
    return { kind, index, trackLabel: `${kind === "video" ? "V" : "A"}${index + 1}` };
  }
  const kind = kindHint && String(kindHint).toLowerCase() === "audio" ? "audio" : "video";
  const index = Math.max(0, Number(raw || 1) - 1);
  return { kind, index, trackLabel: `${kind === "video" ? "V" : "A"}${index + 1}` };
}

async function resolveTrack(sequence, trackRef, kindHint) {
  const parsed = parseTrackRef(trackRef, kindHint);
  const count = parsed.kind === "video" ? await sequence.getVideoTrackCount() : await sequence.getAudioTrackCount();
  if (parsed.index >= count) {
    throw new Error(`${parsed.trackLabel} does not exist (count=${count})`);
  }
  const track = parsed.kind === "video" ? await sequence.getVideoTrack(parsed.index) : await sequence.getAudioTrack(parsed.index);
  return { parsed, track, count };
}

async function setTrackState(payload) {
  const context = await buildSequenceContext();
  const { sequence } = context;
  const { parsed, track } = await resolveTrack(sequence, payload && payload.track, payload && payload.kind);
  const muteRaw = payload && payload.mute !== undefined ? payload.mute : payload && payload.visible !== undefined ? !payload.visible : null;
  if (muteRaw === null) {
    throw new Error("Provide mute or visible");
  }
  const mute = muteRaw === true || String(muteRaw).toLowerCase() === "true";
  await track.setMute(mute);
  return {
    track: parsed.trackLabel,
    kind: parsed.kind,
    mute,
    visible: !mute
  };
}

async function toggleVideoTrack(payload) {
  const nextPayload = Object.assign({}, payload || {});
  nextPayload.kind = "video";
  if (nextPayload.visible !== undefined && nextPayload.visible !== null) {
    nextPayload.mute = !(
      nextPayload.visible === true || String(nextPayload.visible).toLowerCase() === "true"
    );
  }
  return setTrackState(nextPayload);
}

async function projectItemId(projectItem) {
  if (!projectItem) {
    return null;
  }
  try {
    if (typeof projectItem.getId === "function") {
      const id = await projectItem.getId();
      if (id !== undefined && id !== null) {
        return String(id);
      }
    }
  } catch (errId) {
  }
  if (projectItem.id) {
    return String(projectItem.id);
  }
  return null;
}

async function projectItemName(projectItem) {
  if (!projectItem) {
    return null;
  }
  try {
    if (typeof projectItem.getName === "function") {
      const name = await projectItem.getName();
      if (name) {
        return String(name);
      }
    }
  } catch (errName) {
  }
  if (projectItem.name) {
    return String(projectItem.name);
  }
  return null;
}

async function buildSequenceBinMap(project) {
  const sequences = await project.getSequences();
  const seqByItemId = new Map();
  for (const seq of sequences) {
    try {
      const item = await seq.getProjectItem();
      const id = await projectItemId(item);
      if (id) {
        seqByItemId.set(id, seq);
      }
    } catch (errItem) {
    }
  }

  const root = await project.getRootItem();
  const map = new Map();

  async function traverseFolder(folderItem, pathParts) {
    const items = await folderItem.getItems();
    for (const item of items) {
      const name = (await projectItemName(item)) || "(unnamed)";
      const nextParts = pathParts.concat([name]);
      const id = await projectItemId(item);
      if (id && seqByItemId.has(id)) {
        map.set(id, {
          binPath: pathParts.join("/"),
          itemPath: nextParts.join("/")
        });
      }
      let folderCast = null;
      try {
        folderCast = await premiere.FolderItem.cast(item);
      } catch (errCast) {
        folderCast = null;
      }
      if (folderCast && typeof folderCast.getItems === "function") {
        await traverseFolder(folderCast, nextParts);
      }
    }
  }

  await traverseFolder(root, []);
  return { sequences, map };
}

async function listSequences() {
  const project = await getActiveProject();
  const { sequences, map } = await buildSequenceBinMap(project);
  const out = [];
  for (const seq of sequences) {
    const item = await seq.getProjectItem();
    const itemId = await projectItemId(item);
    const binInfo = itemId ? map.get(itemId) : null;
    out.push({
      name: seq.name || null,
      guid: seq.guid || null,
      id: seq.guid || null,
      projectItemId: itemId,
      binPath: binInfo ? binInfo.binPath : null,
      itemPath: binInfo ? binInfo.itemPath : null
    });
  }
  out.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  return { sequences: out };
}

async function findSequence(project, payload) {
  const sequences = await project.getSequences();
  const name = payload && payload.name ? String(payload.name) : null;
  const id = payload && (payload.id || payload.guid) ? String(payload.id || payload.guid) : null;
  if (!name && !id) {
    throw new Error("Provide name or id");
  }
  let found = null;
  if (id) {
    found = sequences.find((s) => String(s.guid) === id);
  }
  if (!found && name) {
    found = sequences.find((s) => String(s.name) === name);
  }
  if (!found) {
    throw new Error("Sequence not found");
  }
  return found;
}

async function openSequence(payload) {
  const project = await getActiveProject();
  const sequence = await findSequence(project, payload || {});
  await project.setActiveSequence(sequence);
  await project.openSequence(sequence);
  return {
    name: sequence.name || null,
    guid: sequence.guid || null,
    id: sequence.guid || null
  };
}

function uniqueSequenceName(baseName, existingNames) {
  const base = String(baseName || "Sequence").trim() || "Sequence";
  if (!existingNames.has(base)) {
    return base;
  }
  let i = 2;
  while (existingNames.has(`${base} ${i}`)) {
    i += 1;
  }
  return `${base} ${i}`;
}

async function duplicateSequence(payload) {
  const context = await buildSequenceContext();
  const { project, sequence } = context;
  const before = await project.getSequences();
  const beforeIds = new Set(before.map((s) => String(s.guid)));

  const cloneAction = sequence.createCloneAction();
  await project.executeTransaction(async (compound) => {
    compound.addAction(cloneAction);
  }, "Clone sequence");

  const after = await project.getSequences();
  const created = after.find((s) => !beforeIds.has(String(s.guid))) || after[after.length - 1];
  if (!created) {
    throw new Error("Clone action did not produce a sequence");
  }

  const existingNames = new Set(after.map((s) => String(s.name)));
  const desiredName = payload && payload.name ? uniqueSequenceName(payload.name, existingNames) : created.name;

  if (desiredName && desiredName !== created.name) {
    const item = await created.getProjectItem();
    const renameAction = item.createSetNameAction(desiredName);
    await project.executeTransaction(async (compound) => {
      compound.addAction(renameAction);
    }, "Rename cloned sequence");
  }

  await project.setActiveSequence(created);
  await project.openSequence(created);

  return {
    name: desiredName || created.name || null,
    guid: created.guid || null,
    id: created.guid || null,
    activated: true,
    methods: {
      clone: "sequence.createCloneAction + project.executeTransaction",
      activate: "project.setActiveSequence + project.openSequence"
    }
  };
}

async function reloadProject() {
  const project = await getActiveProject();
  const projectPath = await project.getProjectPath();
  if (!projectPath) {
    throw new Error("Project path is unavailable; save the project first");
  }
  try {
    const options = new premiere.CloseProjectOptions();
    options.setShowCancelButton(false);
    options.setPromptIfDirty(false);
    await project.close(options);
  } catch (errCloseOptions) {
    await project.close();
  }
  await premiere.Project.open(projectPath);
  return { projectPath, reloaded: true };
}

async function saveProject() {
  const project = await getActiveProject();
  await project.save();
  return { saved: true, projectPath: await project.getProjectPath() };
}

function colorIndexFromValue(colorValue) {
  if (colorValue === null || colorValue === undefined) {
    return null;
  }
  let raw = colorValue;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      return colorIndex(trimmed);
    }
    raw = parsed;
  }
  const value = Number(raw);
  if (Number.isNaN(value)) {
    return null;
  }
  const map = {
    4281740498: 1,
    4289825711: 2,
    4280578025: 3,
    4281049552: 4,
    4294967295: 5,
    4294741314: 6,
    4292277273: 7
  };
  if (Object.prototype.hasOwnProperty.call(map, value)) {
    return map[value];
  }
  if (value >= 0 && value <= 7) {
    return Math.max(0, Math.min(7, Math.round(value)));
  }
  return null;
}

function colorIndex(colorName) {
  if (!colorName) {
    return null;
  }
  const name = String(colorName).toLowerCase();
  const map = {
    green: 0,
    red: 1,
    purple: 2,
    orange: 3,
    yellow: 4,
    white: 5,
    blue: 6,
    cyan: 7
  };
  return Object.prototype.hasOwnProperty.call(map, name) ? map[name] : null;
}

function clampColorIndex(value) {
  const n = Number(value);
  if (Number.isNaN(n)) {
    return null;
  }
  if (n < 0 || n > 7) {
    return null;
  }
  return Math.max(0, Math.min(7, Math.round(n)));
}

function resolveColorIndex(markerData) {
  if (!markerData) {
    return { index: null, source: null };
  }
  if (markerData.colorIndex !== undefined && markerData.colorIndex !== null) {
    return { index: clampColorIndex(markerData.colorIndex), source: "colorIndex" };
  }
  if (markerData.colorValue !== undefined && markerData.colorValue !== null) {
    return { index: colorIndexFromValue(markerData.colorValue), source: "colorValue" };
  }
  if (markerData.color !== undefined && markerData.color !== null) {
    return { index: colorIndex(markerData.color), source: "color" };
  }
  return { index: null, source: null };
}

function markerTicks(marker, context) {
  if (!marker) {
    return null;
  }
  if (marker.timeTicks !== undefined && marker.timeTicks !== null) {
    const n = Number(marker.timeTicks);
    if (!Number.isNaN(n)) {
      return Math.round(n);
    }
  }
  if (marker.timeSeconds !== undefined && marker.timeSeconds !== null) {
    const ticks = secondsToTicks(marker.timeSeconds);
    if (ticks !== null) {
      return ticks;
    }
  }
  if (marker.timecode) {
    const ticks = timecodeToTicks(marker.timecode, context);
    if (ticks !== null) {
      return ticks;
    }
  }
  if (marker.time !== undefined && marker.time !== null) {
    const ticks = ticksFromPayload({ time: marker.time }, "time", context);
    if (ticks !== null) {
      return ticks;
    }
  }
  return null;
}

async function addMarkers(payload) {
  const context = await buildSequenceContext();
  const { project, sequence } = context;
  const markers = payload && Array.isArray(payload.markers) ? payload.markers : null;
  if (!markers || !markers.length) {
    throw new Error("Markers array is required");
  }
  const collection = await premiere.Markers.getMarkers(sequence);
  const actions = [];
  for (const markerData of markers) {
    const ticks = markerTicks(markerData, context);
    if (ticks === null) {
      continue;
    }
    const time = tickTimeFromTicks(absToRelTicks(ticks, context));
    const marker = collection.createAddMarkerAction(time);
    if (markerData.name && typeof marker.setName === "function") {
      marker.setName(String(markerData.name));
    }
    if (markerData.comment && typeof marker.setComments === "function") {
      marker.setComments(String(markerData.comment));
    }
    if (markerData.durationTicks && typeof marker.setDuration === "function") {
      marker.setDuration(tickTimeFromTicks(markerData.durationTicks));
    }
    const color = resolveColorIndex(markerData);
    if (color.index !== null && typeof marker.setColorByIndex === "function") {
      marker.setColorByIndex(color.index);
    }
    actions.push(marker);
  }
  if (!actions.length) {
    throw new Error("No markers could be parsed");
  }
  await project.executeTransaction(async (compound) => {
    for (const action of actions) {
      compound.addAction(action);
    }
  }, "Add markers");
  return { markersAdded: actions.length };
}

async function addMarkersFromFile(payload) {
  const filePath = payload && payload.filePath ? String(payload.filePath) : null;
  if (!filePath) {
    throw new Error("Missing filePath");
  }
  let raw;
  try {
    const entry = await localFileSystem.getEntryWithUrl(fileUrl(filePath));
    raw = await entry.read();
  } catch (errRead) {
    throw new Error(`Failed to read marker file: ${String(errRead)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (errParse) {
    throw new Error(`Marker file is not valid JSON: ${String(errParse)}`);
  }
  const markers = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.markers) ? parsed.markers : null;
  if (!markers || !markers.length) {
    throw new Error("No markers found in file");
  }
  return addMarkers({ markers });
}

async function createEmptySelection() {
  let selection = null;
  const ok = await premiere.TrackItemSelection.createEmptySelection((sel) => {
    selection = sel;
  });
  if (!ok || !selection) {
    throw new Error("Unable to create track item selection");
  }
  return selection;
}

async function getAllTrackItems(sequence) {
  const result = { video: [], audio: [] };
  const videoCount = await sequence.getVideoTrackCount();
  for (let i = 0; i < videoCount; i += 1) {
    const track = await sequence.getVideoTrack(i);
    const items = await getTrackClipItems(track);
    result.video.push({ index: i, track, items });
  }
  const audioCount = await sequence.getAudioTrackCount();
  for (let i = 0; i < audioCount; i += 1) {
    const track = await sequence.getAudioTrack(i);
    const items = await getTrackClipItems(track);
    result.audio.push({ index: i, track, items });
  }
  return result;
}

async function splitTrackItemAtTicks(context, editor, track, trackItem, splitTicks) {
  const { project } = context;
  const startRelTicks = tickTimeToTicks(await trackItem.getStartTime());
  const endRelTicks = tickTimeToTicks(await trackItem.getEndTime());
  const startTicks = relToAbsTicks(startRelTicks, context);
  const endTicks = relToAbsTicks(endRelTicks, context);
  if (startTicks === null || endTicks === null) {
    return { split: false, reason: "missing start/end" };
  }
  if (splitTicks <= startTicks || splitTicks >= endTicks) {
    return { split: false, reason: "outside clip" };
  }

  const inPointTicks = tickTimeToTicks(await trackItem.getInPoint());
  if (inPointTicks === null) {
    return { split: false, reason: "missing inPoint" };
  }
  const deltaTicks = splitTicks - startTicks;
  const newInTicks = inPointTicks + deltaTicks;

  const beforeItems = await getTrackClipItems(track);
  const beforeSet = new Set(beforeItems);

  const cloneAction = editor.createCloneTrackItemAction(
    trackItem,
    tickTimeFromTicks(0),
    0,
    0,
    true,
    false
  );
  try {
    await project.executeTransaction(async (compound) => {
      compound.addAction(cloneAction);
    }, "Clone track item for split");
  } catch (errClone) {
    throw new Error(`SequenceEditor.createCloneTrackItemAction failed: ${String(errClone)}`);
  }

  const afterItems = await getTrackClipItems(track);
  const newItems = afterItems.filter((item) => !beforeSet.has(item));
  const clone = newItems[0];
  if (!clone) {
    return { split: false, reason: "clone not found" };
  }

  const splitRelTicks = absToRelTicks(splitTicks, context);
  const splitTime = tickTimeFromTicks(splitRelTicks);
  const leftOut = tickTimeFromTicks(newInTicks);
  const rightIn = tickTimeFromTicks(newInTicks);

  const actions = [
    trackItem.createSetEndAction(splitTime),
    trackItem.createSetOutPointAction(leftOut),
    clone.createSetStartAction(splitTime),
    clone.createSetInPointAction(rightIn)
  ];

  try {
    await project.executeTransaction(async (compound) => {
      for (const action of actions) {
        compound.addAction(action);
      }
    }, "Split track item");
  } catch (errSplit) {
    throw new Error(`Track item split actions failed: ${String(errSplit)}`);
  }

  return { split: true };
}

async function splitAllTracksAtTicks(context, splitTicks) {
  const { project, sequence } = context;
  const editor = createSequenceEditor(sequence);
  const tracks = await getAllTrackItems(sequence);
  const summary = { splitTicks, candidateCount: 0, splits: 0, errors: [] };

  async function processTrack(kind, trackInfo) {
    const candidates = [];
    for (const item of trackInfo.items) {
      const startRelTicks = tickTimeToTicks(await item.getStartTime());
      const endRelTicks = tickTimeToTicks(await item.getEndTime());
      const startTicks = relToAbsTicks(startRelTicks, context);
      const endTicks = relToAbsTicks(endRelTicks, context);
      if (startTicks === null || endTicks === null) {
        continue;
      }
      if (startTicks < splitTicks && endTicks > splitTicks) {
        candidates.push(item);
      }
    }
    summary.candidateCount += candidates.length;
    for (const item of candidates) {
      try {
        const result = await splitTrackItemAtTicks(context, editor, trackInfo.track, item, splitTicks);
        if (result.split) {
          summary.splits += 1;
        }
      } catch (errSplit) {
        summary.errors.push(`${kind}[${trackInfo.index}]: ${String(errSplit)}`);
      }
    }
  }

  for (const trackInfo of tracks.video) {
    await processTrack("video", trackInfo);
  }
  for (const trackInfo of tracks.audio) {
    await processTrack("audio", trackInfo);
  }

  return summary;
}

async function removeRangeWithRipple(context, inTicks, outTicks) {
  const { project, sequence } = context;
  const editor = createSequenceEditor(sequence);
  const selection = await createEmptySelection();
  const tracks = await getAllTrackItems(sequence);

  async function addRangeItems(trackInfos) {
    for (const trackInfo of trackInfos) {
      const items = await getTrackClipItems(trackInfo.track);
      for (const item of items) {
        const startRelTicks = tickTimeToTicks(await item.getStartTime());
        const endRelTicks = tickTimeToTicks(await item.getEndTime());
        const startTicks = relToAbsTicks(startRelTicks, context);
        const endTicks = relToAbsTicks(endRelTicks, context);
        if (startTicks === null || endTicks === null) {
          continue;
        }
        if (startTicks >= inTicks && endTicks <= outTicks) {
          selectionAddItem(selection, item);
        }
      }
    }
  }

  await addRangeItems(tracks.video);
  await addRangeItems(tracks.audio);

  const selectedItems = selectionItems(selection);
  const count = selectedItems.length;
  if (!count) {
    throw new Error("No track items found within the range to remove");
  }

  const removeAction = editor.createRemoveItemsAction(
    selection,
    true,
    constants.MediaType.ANY,
    true
  );

  await project.executeTransaction(async (compound) => {
    compound.addAction(removeAction);
  }, "Remove range with ripple");

  return { removedItems: count };
}

async function razorAtTimecode(payload) {
  const context = await buildSequenceContext();
  const ticks = payload && payload.ticks !== undefined ? Number(payload.ticks) : payload && payload.seconds !== undefined ? secondsToTicks(payload.seconds) : payload && payload.timecode ? timecodeToTicks(payload.timecode, context) : null;
  if (ticks === null || Number.isNaN(ticks)) {
    throw new Error("Provide ticks, seconds, or timecode");
  }
  const splitSummary = await splitAllTracksAtTicks(context, ticks);
  if (splitSummary.candidateCount > 0 && splitSummary.splits === 0) {
    const uniqueErrors = Array.from(new Set(splitSummary.errors));
    throw new Error(
      `UXP razor-cut is currently blocked by Premiere Pro: SequenceEditor.createCloneTrackItemAction failed on all ${splitSummary.candidateCount} eligible track items. ${uniqueErrors.join(" | ")}`
    );
  }
  return {
    ticks: String(ticks),
    timecode: ticksToTimecode(ticks, context),
    method: "splitAllTracksAtTicks",
    splitSummary
  };
}

async function extractRange(payload) {
  const context = await buildSequenceContext();
  const computed = ensureInOutTicks(payload || {}, context);
  if (!computed.ok) {
    throw new Error(computed.error);
  }
  const { inTicks, outTicks } = computed;

  await setInOutTicks(context, inTicks, outTicks);
  const razorIn = await razorAtTimecode({ ticks: inTicks });
  const razorOut = await razorAtTimecode({ ticks: outTicks });
  const remove = await removeRangeWithRipple(context, inTicks, outTicks);

  return {
    inTicks: String(inTicks),
    outTicks: String(outTicks),
    inTimecode: ticksToTimecode(inTicks, context),
    outTimecode: ticksToTimecode(outTicks, context),
    razor: { inResult: razorIn, outResult: razorOut },
    extract: { method: "removeRangeWithRipple", remove }
  };
}

async function rippleDeleteSelection() {
  const context = await buildSequenceContext();
  const { sequence } = context;
  const selection = sequence.getSelection();
  const selectedItems = selectionItems(selection);
  const count = selectedItems.length;
  if (!count) {
    throw new Error("No selected track items found");
  }

  let minStart = null;
  let maxEnd = null;
  for (let i = 0; i < count; i += 1) {
    const item = selectedItems[i];
    const startRelTicks = tickTimeToTicks(await item.getStartTime());
    const endRelTicks = tickTimeToTicks(await item.getEndTime());
    const startTicks = relToAbsTicks(startRelTicks, context);
    const endTicks = relToAbsTicks(endRelTicks, context);
    if (startTicks === null || endTicks === null) {
      continue;
    }
    minStart = minStart === null ? startTicks : Math.min(minStart, startTicks);
    maxEnd = maxEnd === null ? endTicks : Math.max(maxEnd, endTicks);
  }

  if (minStart === null || maxEnd === null || maxEnd <= minStart) {
    throw new Error("Unable to compute selection bounds");
  }

  return extractRange({ inTicks: minStart, outTicks: maxEnd });
}

async function findProjectItem(payload) {
  const project = await getActiveProject();
  const root = await project.getRootItem();
  const nameQuery = payload && payload.name ? String(payload.name) : null;
  const pathQuery = payload && payload.path ? String(payload.path) : null;
  if (!nameQuery && !pathQuery) {
    throw new Error("Provide name or path");
  }
  const contains = payload && payload.contains === true;
  const caseSensitive = payload && payload.caseSensitive === true;
  const limit = payload && payload.limit ? Math.max(1, Number(payload.limit)) : 25;

  const matches = [];

  function normalize(text) {
    return caseSensitive ? String(text) : String(text).toLowerCase();
  }

  const targetName = nameQuery ? normalize(nameQuery) : null;
  const targetPath = pathQuery ? normalize(pathQuery) : null;

  async function traverse(folderItem, pathParts) {
    if (matches.length >= limit) {
      return;
    }
    const items = await folderItem.getItems();
    for (const item of items) {
      if (matches.length >= limit) {
        return;
      }
      const name = (await projectItemName(item)) || "(unnamed)";
      const nextParts = pathParts.concat([name]);
      const fullPath = nextParts.join("/");
      const cmpName = normalize(name);
      const cmpPath = normalize(fullPath);

      const nameMatch = targetName
        ? contains
          ? cmpName.includes(targetName)
          : cmpName === targetName
        : false;
      const pathMatch = targetPath
        ? contains
          ? cmpPath.includes(targetPath)
          : cmpPath === targetPath
        : false;

      if (nameMatch || pathMatch) {
        const id = await projectItemId(item);
        matches.push({ id, name, path: fullPath, kind: item.type || null });
      }

      let folderCast = null;
      try {
        folderCast = await premiere.FolderItem.cast(item);
      } catch (errCast) {
        folderCast = null;
      }
      if (folderCast && typeof folderCast.getItems === "function") {
        await traverse(folderCast, nextParts);
      }
    }
  }

  await traverse(root, []);
  return { matches, limit };
}

async function findMenuCommandId(payload) {
  const names = payload && Array.isArray(payload.names) ? payload.names.map((n) => String(n)) : payload && payload.name ? [String(payload.name)] : [];
  if (!names.length) {
    throw new Error("Provide name or names");
  }
  return {
    results: names.map((name) => ({ name, id: null, ok: false, error: "Unsupported in UXP" })),
    available: {
      appFindMenuCommandId: false,
      appExecuteCommand: false
    }
  };
}

async function handleCommand(command, payload) {
  const { dryRun, cleanPayload } = splitDryRunPayload(payload);
  if (command === "ping") {
    return { ok: true, data: { status: "ok", transport: "uxp" } };
  }
  if (dryRun && MUTATING_COMMANDS.has(command)) {
    return {
      ok: true,
      data: { dryRun: true, skipped: true, command, payload: cleanPayload }
    };
  }
  if (command === "transcriptJSON") {
    return { ok: true, data: await exportTranscriptJson() };
  }
  if (command === "exportSequenceAudio") {
    return { ok: true, data: await exportSequenceAudio(payload || {}) };
  }
  if (command === "getSequenceInfo") {
    return { ok: true, data: await getSequenceInfo() };
  }
  if (command === "sequenceInventory") {
    return { ok: true, data: await sequenceInventory() };
  }
  if (command === "getPlayheadPosition") {
    return { ok: true, data: await getPlayheadPosition() };
  }
  if (command === "debugTimecode") {
    return { ok: true, data: await debugTimecode(cleanPayload) };
  }
  if (command === "setPlayheadTimecode") {
    return { ok: true, data: await setPlayheadTimecode(cleanPayload) };
  }
  if (command === "setInOutPoints") {
    const context = await buildSequenceContext();
    const computed = ensureInOutTicks(cleanPayload, context);
    if (!computed.ok) {
      throw new Error(computed.error);
    }
    await setInOutTicks(context, computed.inTicks, computed.outTicks);
    return {
      ok: true,
      data: {
        inTicks: String(computed.inTicks),
        outTicks: String(computed.outTicks),
        methods: ["sequence.createSetInPointAction", "sequence.createSetOutPointAction"]
      }
    };
  }
  if (command === "razorAtTimecode") {
    return { ok: true, data: await razorAtTimecode(cleanPayload) };
  }
  if (command === "extractRange") {
    return { ok: true, data: await extractRange(cleanPayload) };
  }
  if (command === "rippleDeleteSelection") {
    return { ok: true, data: await rippleDeleteSelection() };
  }
  if (command === "addMarkers") {
    return { ok: true, data: await addMarkers(cleanPayload) };
  }
  if (command === "addMarkersFromFile") {
    return { ok: true, data: await addMarkersFromFile(cleanPayload) };
  }
  if (command === "toggleVideoTrack") {
    return { ok: true, data: await toggleVideoTrack(cleanPayload) };
  }
  if (command === "setTrackState") {
    return { ok: true, data: await setTrackState(cleanPayload) };
  }
  if (command === "duplicateSequence") {
    return { ok: true, data: await duplicateSequence(cleanPayload) };
  }
  if (command === "openSequence") {
    return { ok: true, data: await openSequence(cleanPayload) };
  }
  if (command === "listSequences") {
    return { ok: true, data: await listSequences() };
  }
  if (command === "reloadProject") {
    return { ok: true, data: await reloadProject() };
  }
  if (command === "saveProject") {
    return { ok: true, data: await saveProject() };
  }
  if (command === "findProjectItem") {
    return { ok: true, data: await findProjectItem(cleanPayload) };
  }
  if (command === "findMenuCommandId") {
    return { ok: true, data: await findMenuCommandId(cleanPayload) };
  }
  return { ok: false, error: `Unknown command: ${command}` };
}

async function pollOnce() {
  const paths = await ensurePaths();
  await ensureFolder(paths.baseDir);
  await ensureFolder(paths.ipcDir);
  await ensureFile(paths.commandPath);
  await ensureFile(paths.resultPath);

  const config = state.config || (await loadConfig());
  updateFields(config, paths);

  const command = await readJsonFile(paths.commandPath);
  if (!command || !command.id || !command.command) {
    return;
  }
  const lastResult = await readJsonFile(paths.resultPath);
  if (lastResult && String(lastResult.id) === String(command.id)) {
    state.lastCommandId = command.id;
    return;
  }
  if (state.lastCommandId === command.id) {
    return;
  }

  state.lastCommandId = command.id;
  setLastCommand(`${command.command} (${command.id})`);

  if (!command.token || command.token !== config.token) {
    appendLog(`Unauthorized command ${command.command}`);
    await writeJsonFile(paths.resultPath, {
      id: command.id,
      ok: false,
      error: "Unauthorized",
      transport: "uxp",
      timestamp: new Date().toISOString()
    });
    return;
  }

  appendLog(`Command ${command.command} <= ${formatForLog(command.payload, 200)}`);
  const startTime = Date.now();
  let result;
  try {
    result = await handleCommand(command.command, command.payload || {});
  } catch (errCommand) {
    result = { ok: false, error: String(errCommand) };
  }
  const durationMs = Date.now() - startTime;
  appendLog(`Command ${command.command} => ${result.ok ? "ok" : "error"} (${durationMs}ms)`);

  const response = Object.assign({}, result, {
    id: command.id,
    transport: "uxp",
    timestamp: new Date().toISOString(),
    durationMs
  });

  await writeJsonFile(paths.resultPath, response);
}

async function startIpc() {
  state.desiredRunning = true;
  if (state.started) {
    setStatus("Online", true);
    return;
  }
  await ensurePaths();
  await loadConfig();
  setStatus("Starting", false);
  state.started = true;
  state.intervalId = setInterval(async () => {
    if (!state.desiredRunning) {
      return;
    }
    if (state.pollInFlight) {
      return;
    }
    state.pollInFlight = true;
    try {
      await pollOnce();
      setStatus("Online", true);
    } catch (errPoll) {
      appendLog(`IPC poll failed: ${String(errPoll)}`);
      setStatus("Error", false);
    } finally {
      state.pollInFlight = false;
    }
  }, POLL_MS);
}

function stopIpc() {
  state.desiredRunning = false;
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  state.started = false;
  setStatus("Offline", false);
}

async function pingNow() {
  try {
    const result = await handleCommand("ping", {});
    appendLog(`Ping => ${formatForLog(result, 160)}`);
  } catch (errPing) {
    appendLog(`Ping failed: ${String(errPing)}`);
  }
}

async function reloadProjectNow() {
  try {
    const result = await handleCommand("reloadProject", {});
    appendLog(`Reload => ${formatForLog(result, 160)}`);
  } catch (errReload) {
    appendLog(`Reload failed: ${String(errReload)}`);
  }
}

async function saveProjectNow() {
  try {
    const result = await handleCommand("saveProject", {});
    appendLog(`Save => ${formatForLog(result, 160)}`);
  } catch (errSave) {
    appendLog(`Save failed: ${String(errSave)}`);
  }
}

async function exportTranscriptNow() {
  try {
    const result = await exportTranscriptJson();
    appendLog(`Transcript export ok (segments=${result.transcriptJson && result.transcriptJson.segments ? result.transcriptJson.segments.length : "?"})`);
  } catch (errExport) {
    appendLog(`Transcript export failed: ${String(errExport)}`);
  }
}

function wireUi() {
  ipcStatusEl = document.getElementById("ipc-status");
  lastCommandEl = document.getElementById("last-command");
  ipcDirEl = document.getElementById("ipc-dir");
  configPathEl = document.getElementById("configPath");
  portEl = document.getElementById("port");
  tokenEl = document.getElementById("token");
  logEl = document.getElementById("log");
  startBtn = document.getElementById("startBtn");
  stopBtn = document.getElementById("stopBtn");
  saveBtn = document.getElementById("saveBtn");
  regenBtn = document.getElementById("regenBtn");
  pingBtn = document.getElementById("pingBtn");
  reloadBtn = document.getElementById("reloadBtn");
  saveProjectBtn = document.getElementById("saveProjectBtn");
  exportBtn = document.getElementById("exportBtn");

  if (startBtn) {
    startBtn.addEventListener("click", () => startIpc());
  }
  if (stopBtn) {
    stopBtn.addEventListener("click", () => stopIpc());
  }
  if (saveBtn) {
    saveBtn.addEventListener("click", () => saveConfigFromUi());
  }
  if (regenBtn) {
    regenBtn.addEventListener("click", () => regenerateToken());
  }
  if (pingBtn) {
    pingBtn.addEventListener("click", () => pingNow());
  }
  if (reloadBtn) {
    reloadBtn.addEventListener("click", () => reloadProjectNow());
  }
  if (saveProjectBtn) {
    saveProjectBtn.addEventListener("click", () => saveProjectNow());
  }
  if (exportBtn) {
    exportBtn.addEventListener("click", () => exportTranscriptNow());
  }
}

function init() {
  if (!hasUiElements()) {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        state.initialized = false;
        init();
      },
      { once: true }
    );
    return;
  }
  if (!state.initialized) {
    wireUi();
    setLastCommand("None");
    state.initialized = true;
  }
  startIpc();
}

entrypoints.setup({
  panels: {
    "premiere-bridge-uxp-panel": {
      show() {
        init();
      },
      hide() {
        stopIpc();
      }
    }
  }
});
