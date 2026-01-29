const { entrypoints, storage } = require("uxp");
let osModule = null;
let pathModule = null;
try {
  osModule = require("os");
} catch (errOs) {
}
try {
  pathModule = require("path");
} catch (errPath) {
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
