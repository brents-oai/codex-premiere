const { entrypoints, storage } = require("uxp");
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
const premiere = require("premierepro");

const { localFileSystem, types } = storage;

const PATHS = {
  baseDir: null,
  ipcDir: null,
  commandPath: null,
  resultPath: null,
  configPath: null
};

function joinPath(a, b) {
  if (pathModule && pathModule.join) {
    return pathModule.join(a, b);
  }
  if (!a) {
    return b;
  }
  return a.endsWith("/") ? a + b : a + "/" + b;
}

async function ensurePaths() {
  if (PATHS.baseDir) {
    return PATHS;
  }
  var homePath = null;
  try {
    var homeEntry = await localFileSystem.getHomeFolder();
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

const state = {
  started: false,
  intervalId: null,
  lastCommandId: null,
  pollInFlight: false,
  initialized: false
};

let ipcStatusEl;
let lastCommandEl;
let ipcDirEl;
let logEl;
let startBtn;
let stopBtn;
let exportBtn;

function fileUrl(nativePath) {
  const normalized = nativePath.startsWith("/") ? nativePath : "/" + nativePath;
  return "file://" + encodeURI(normalized);
}

function setStatus(text) {
  if (ipcStatusEl) {
    ipcStatusEl.textContent = text;
  }
}

function setLastCommand(text) {
  if (lastCommandEl) {
    lastCommandEl.textContent = text || "None";
  }
}

function appendLog(message) {
  if (!logEl) {
    return;
  }
  const ts = new Date().toISOString();
  const line = `[${ts}] ${message}`;
  const prev = logEl.textContent ? logEl.textContent.split("\n") : [];
  prev.push(line);
  const trimmed = prev.slice(-120);
  logEl.textContent = trimmed.join("\n");
  logEl.scrollTop = logEl.scrollHeight;
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

async function readConfig() {
  const paths = await ensurePaths();
  const cfg = await readJsonFile(paths.configPath);
  if (!cfg || !cfg.token) {
    setStatus("Missing config/token");
    return null;
  }
  return cfg;
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
  const d = new Date();
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  return [
    d.getFullYear(),
    pad2(d.getMonth() + 1),
    pad2(d.getDate()),
    "-",
    pad2(d.getHours()),
    pad2(d.getMinutes()),
    pad2(d.getSeconds())
  ].join("");
}

async function pathExists(nativePath) {
  if (!nativePath) {
    return false;
  }
  if (fsModule && fsModule.existsSync) {
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
  if (fsModule && fsModule.existsSync && fsModule.statSync) {
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
  if (pathModule && pathModule.dirname) {
    const dir = pathModule.dirname(nativePath);
    await ensureFolder(dir);
    return;
  }
  const idx = nativePath.lastIndexOf("/");
  if (idx > 0) {
    await ensureFolder(nativePath.slice(0, idx));
  }
}

async function readSequenceName(seq) {
  if (!seq) {
    return null;
  }
  try {
    if (typeof seq.getName === "function") {
      const value = await seq.getName();
      if (value) {
        return String(value);
      }
    }
  } catch (errGetName) {
  }
  try {
    if (seq.name) {
      return String(seq.name);
    }
  } catch (errNameProp) {
  }
  return null;
}

async function readSequenceId(seq) {
  if (!seq) {
    return null;
  }
  try {
    if (typeof seq.getSequenceId === "function") {
      const value = await seq.getSequenceId();
      if (value !== undefined && value !== null) {
        return String(value);
      }
    }
  } catch (errGetId) {
  }
  const idKeys = ["id", "sequenceID", "sequenceId", "sequence_id"];
  for (const key of idKeys) {
    try {
      if (seq[key] !== undefined && seq[key] !== null) {
        return String(seq[key]);
      }
    } catch (errKey) {
    }
  }
  return null;
}

function exportPresetCandidates(payload, cfg) {
  function normalizeCandidatePath(raw) {
    if (!raw) {
      return null;
    }
    const text = String(raw).trim();
    if (!text) {
      return null;
    }
    // UXP path.resolve may prefix absolute paths with "plugin:"; convert back.
    if (text.indexOf("plugin:/") === 0) {
      return decodeURI(text.slice("plugin:".length));
    }
    if (text.indexOf("file://") === 0) {
      return decodeURI(text.replace(/^file:\/\//, ""));
    }
    if (text[0] === "/") {
      return text;
    }
    if (pathModule && pathModule.resolve) {
      return pathModule.resolve(text);
    }
    return text;
  }

  const candidates = [];
  const rawCandidates = [
    payload && payload.presetPath,
    cfg && cfg.audioExportPreset,
    cfg && cfg.defaultAudioExportPreset,
    cfg && cfg.exportPresetPath
  ];
  const homeDir = osModule && osModule.homedir ? osModule.homedir() : null;
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
    if (!raw) {
      continue;
    }
    const resolved = normalizeCandidatePath(raw);
    if (!resolved) {
      continue;
    }
    if (!candidates.includes(resolved)) {
      candidates.push(resolved);
    }
  }
  return candidates;
}

async function resolvePresetPath(payload, cfg) {
  const candidates = exportPresetCandidates(payload, cfg);
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

async function exportSequenceAudio(payload) {
  const paths = await ensurePaths();
  const cfg = await readConfig();
  if (!cfg) {
    throw new Error(`Missing config token at ${paths.configPath}`);
  }

  const project = await premiere.Project.getActiveProject();
  if (!project) {
    throw new Error("No active project");
  }
  const sequence = await project.getActiveSequence();
  if (!sequence) {
    throw new Error("No active sequence");
  }

  const sequenceName = (await readSequenceName(sequence)) || "active-sequence";
  const sequenceId = await readSequenceId(sequence);
  const timeoutSeconds = payload && payload.timeoutSeconds !== undefined ? Number(payload.timeoutSeconds) : 60;
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new Error("timeoutSeconds must be a positive number");
  }
  const timeoutMs = Math.round(timeoutSeconds * 1000);

  const outputBase = payload && payload.outputPath
    ? String(payload.outputPath)
    : joinPath(paths.baseDir, `tmp/${slugifyName(sequenceName)}-${timestampForFilename()}.wav`);
  const outputPath = /\.wav$/i.test(outputBase) ? outputBase : `${outputBase}.wav`;
  await ensureParentFolder(outputPath);

  const presetResolved = await resolvePresetPath(payload || {}, cfg);
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

  let method = null;
  let rawResult = null;
  let pendingExportPromise = null;

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

  if (!method && premiere && premiere.EncoderManager && typeof premiere.EncoderManager.getManager === "function") {
    const constants = (premiere && (premiere.Constants || premiere.constants)) || {};
    const exportTypes = [];
    if (constants.ExportType) {
      const c = constants.ExportType;
      exportTypes.push(c.IMMEDIATELY, c.IMMEDIATE, c.EXPORT_IMMEDIATELY, c.ExportImmediately);
      exportTypes.push(c.QUEUE_IN_AME, c.QUEUE, c.QUEUE_TO_AME);
      try {
        Object.keys(c).forEach((k) => exportTypes.push(c[k]));
      } catch (errEnumKeys) {
      }
    }
    // Fallback enum guesses if constants are not exposed in this runtime.
    exportTypes.push(0, 1, 2);
    const normalizedExportTypes = exportTypes.filter((v, idx, arr) => v !== undefined && v !== null && arr.indexOf(v) === idx);

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

  const file = await waitForNonEmptyFile(outputPath, timeoutMs);
  if (!file.exists && pendingExportPromise) {
    // Give any pending promise one final chance without blocking indefinitely.
    await Promise.race([
      pendingExportPromise,
      new Promise((resolve) => setTimeout(resolve, 1000))
    ]);
  }
  if (!file.exists || Number(file.bytes || 0) <= 0) {
    throw new Error(
      `Export command finished but output file is missing or empty at ${outputPath}. Method: ${method}`
    );
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
  const project = await premiere.Project.getActiveProject();
  if (!project) {
    throw new Error("No active project");
  }
  const sequence = await project.getActiveSequence();
  if (!sequence) {
    throw new Error("No active sequence");
  }
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

  const seqName = await readSequenceName(sequence);
  const seqId = await readSequenceId(sequence);

  return {
    sequence: {
      name: seqName || null,
      id: seqId != null ? String(seqId) : null
    },
    transcriptText: jsonText,
    transcriptJson: transcriptJson
  };
}

async function handleCommand(command, payload) {
  if (command === "transcriptJSON") {
    return await exportTranscriptJson(payload);
  }
  if (command === "exportSequenceAudio") {
    return await exportSequenceAudio(payload || {});
  }
  throw new Error(`Unknown command: ${command}`);
}

async function pollOnce() {
  const paths = await ensurePaths();
  if (ipcDirEl) {
    ipcDirEl.textContent = paths.ipcDir;
  }

  setStatus("Preparing");
  await ensureFolder(paths.baseDir);
  await ensureFolder(paths.ipcDir);
  await ensureFile(paths.commandPath);
  await ensureFile(paths.resultPath);

  const cfg = await readConfig();
  if (!cfg) {
    appendLog(`Config not found at ${paths.configPath}; ensure CEP panel has run at least once.`);
    return;
  }

  const command = await readJsonFile(paths.commandPath);
  if (!command || !command.id || !command.command) {
    setStatus("Idle");
    return;
  }

  if (state.lastCommandId && String(command.id) === String(state.lastCommandId)) {
    setStatus("Idle");
    return;
  }

  state.lastCommandId = String(command.id);
  setLastCommand(`${command.command} (${command.id})`);

  if (command.token && String(command.token) !== String(cfg.token)) {
    appendLog("Rejected command due to token mismatch.");
    await writeJsonFile(paths.resultPath, {
      id: command.id,
      ok: false,
      error: "Token mismatch",
      timestamp: new Date().toISOString()
    });
    setStatus("Idle");
    return;
  }

  setStatus("Running");
  appendLog(`Handling command: ${command.command}`);

  try {
    const data = await handleCommand(command.command, command.payload || {});
    await writeJsonFile(paths.resultPath, {
      id: command.id,
      ok: true,
      data,
      timestamp: new Date().toISOString()
    });
    appendLog(`Command completed: ${command.command}`);
  } catch (err) {
    await writeJsonFile(paths.resultPath, {
      id: command.id,
      ok: false,
      error: String(err && err.message ? err.message : err),
      timestamp: new Date().toISOString()
    });
    appendLog(`Command failed: ${command.command} -> ${String(err)}`);
  }

  setStatus("Idle");
}

async function startIpc() {
  if (state.started) {
    return;
  }
  state.started = true;
  setStatus("Starting");
  appendLog("IPC loop starting.");

  const tick = async () => {
    if (state.pollInFlight) {
      return;
    }
    state.pollInFlight = true;
    try {
      await pollOnce();
    } catch (err) {
      appendLog(`IPC error: ${String(err)}`);
      setStatus("Error");
    } finally {
      state.pollInFlight = false;
    }
  };

  state.intervalId = setInterval(tick, 700);
  await tick();
}

function stopIpc() {
  if (!state.started) {
    return;
  }
  state.started = false;
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  setStatus("Stopped");
  appendLog("IPC loop stopped.");
}

async function manualExport() {
  appendLog("Manual transcript export requested.");
  setStatus("Running");
  try {
    const data = await exportTranscriptJson();
    appendLog(
      `Transcript export OK for sequence: ${data.sequence && data.sequence.name ? data.sequence.name : "(unknown)"}`
    );
  } catch (err) {
    appendLog(`Manual export failed: ${String(err)}`);
  } finally {
    setStatus("Idle");
  }
}

function wireUi() {
  ipcStatusEl = document.getElementById("ipc-status");
  lastCommandEl = document.getElementById("last-command");
  ipcDirEl = document.getElementById("ipc-dir");
  logEl = document.getElementById("log");
  startBtn = document.getElementById("start-btn");
  stopBtn = document.getElementById("stop-btn");
  exportBtn = document.getElementById("export-btn");

  if (startBtn) {
    startBtn.addEventListener("click", () => {
      startIpc();
    });
  }
  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      stopIpc();
    });
  }
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      manualExport();
    });
  }
}

function hasUiElements() {
  return !!(
    document.getElementById("ipc-status") &&
    document.getElementById("ipc-dir") &&
    document.getElementById("log")
  );
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
