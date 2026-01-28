(function () {
  const logEl = document.getElementById("log");
  const statusEl = document.getElementById("status");
  const portEl = document.getElementById("port");
  const tokenEl = document.getElementById("token");
  const configPathEl = document.getElementById("configPath");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const saveBtn = document.getElementById("saveBtn");
  const regenBtn = document.getElementById("regenBtn");
  const pingBtn = document.getElementById("pingBtn");
  const reloadBtn = document.getElementById("reloadBtn");

  const cep = window.__adobe_cep__;
  const canNode = typeof require === "function";
  const CSInterfaceCtor = window.CSInterface;
  const csInterface = CSInterfaceCtor ? new CSInterfaceCtor() : null;
  const themeChangeEvent =
    (CSInterfaceCtor && CSInterfaceCtor.THEME_COLOR_CHANGED_EVENT) ||
    "com.adobe.csxs.events.ThemeColorChanged";

  let http;
  let fs;
  let path;
  let os;
  let crypto;

  const DEFAULT_PORT = 17321;
  const MAX_LOG_LINES = 400;
  let server = null;
  let config = null;
  let logLines = [];
  let lastTheme = null;

  function luminanceFromColor(color) {
    if (!color) {
      return 0;
    }
    const r = Number(color.red || 0) / 255;
    const g = Number(color.green || 0) / 255;
    const b = Number(color.blue || 0) / 255;
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
  }

  function getHostSkinInfo() {
    try {
      if (csInterface && csInterface.getHostEnvironment) {
        const env = csInterface.getHostEnvironment();
        if (env && env.appSkinInfo) {
          return env.appSkinInfo;
        }
      }
    } catch (errCs) {
    }
    try {
      if (cep && cep.getHostEnvironment) {
        const raw = cep.getHostEnvironment();
        const env = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (env && env.appSkinInfo) {
          return env.appSkinInfo;
        }
      }
    } catch (errCep) {
    }
    return null;
  }

  function applyThemeFromHost() {
    let theme = "dark";
    let bg = null;
    let lum = 0;
    try {
      const skin = getHostSkinInfo();
      bg = skin && skin.panelBackgroundColor && skin.panelBackgroundColor.color;
      if (bg) {
        lum = luminanceFromColor(bg);
        theme = lum < 0.5 ? "dark" : "light";
      }
    } catch (err) {
      theme = "dark";
    }
    if (theme !== lastTheme) {
      document.documentElement.dataset.theme = theme;
      lastTheme = theme;
      if (bg) {
        const rgb = `${bg.red || 0},${bg.green || 0},${bg.blue || 0}`;
        log(`Theme -> ${theme} (lum=${lum.toFixed(3)} rgb=${rgb})`);
      } else {
        log(`Theme -> ${theme} (no host skin info)`);
      }
    }
  }

  function log(message) {
    const time = new Date().toISOString().replace("T", " ").replace("Z", "");
    const line = `[${time}] ${message}`;
    logLines.push(line);
    if (logLines.length > MAX_LOG_LINES) {
      logLines = logLines.slice(logLines.length - MAX_LOG_LINES);
    }
    logEl.textContent = `${logLines.join("\n")}\n`;
    logEl.scrollTop = logEl.scrollHeight;
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
      return `${text.slice(0, limit)}…`;
    }
    return text;
  }

  function summarizeResult(result) {
    if (!result || typeof result !== "object") {
      return formatForLog(result, 160);
    }
    if (!result.ok) {
      return `error=${result.error || "unknown"}`;
    }
    if (!result.data || typeof result.data !== "object") {
      return "ok";
    }
    const keys = Object.keys(result.data).slice(0, 6);
    return keys.length ? `ok dataKeys=${keys.join(",")}` : "ok";
  }

  function setStatus(isOnline) {
    statusEl.textContent = isOnline ? "Online" : "Offline";
    statusEl.classList.toggle("online", isOnline);
    statusEl.classList.toggle("offline", !isOnline);
    startBtn.disabled = isOnline;
    stopBtn.disabled = !isOnline;
  }

  function ensureNodeModules() {
    if (!canNode) {
      log("Node integration is unavailable. Check CEF flags in manifest.");
      return false;
    }
    http = require("http");
    fs = require("fs");
    path = require("path");
    os = require("os");
    crypto = require("crypto");
    return true;
  }

  function configDir() {
    return path.join(os.homedir(), "Library", "Application Support", "PremiereBridge");
  }

  function configPath() {
    return path.join(configDir(), "config.json");
  }

  function loadConfig() {
    const cfgPath = configPath();
    let data = {};
    try {
      if (fs.existsSync(cfgPath)) {
        data = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      }
    } catch (err) {
      log(`Failed to read config: ${err.message}`);
    }

    if (!data.port) {
      data.port = DEFAULT_PORT;
    }

    if (!data.token) {
      data.token = crypto.randomBytes(16).toString("hex");
    }

    saveConfig(data);
    return data;
  }

  function saveConfig(nextConfig) {
    const dir = configDir();
    const cfgPath = configPath();
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(cfgPath, JSON.stringify(nextConfig, null, 2), { mode: 0o600 });
    } catch (err) {
      log(`Failed to write config: ${err.message}`);
    }
  }

  function updateFields() {
    portEl.value = config.port;
    tokenEl.value = config.token;
    configPathEl.textContent = `Config: ${configPath()}`;
  }

  function buildScript(fn, payload) {
    const json = JSON.stringify(payload || {});
    const escaped = JSON.stringify(json);
    return `PremiereBridge.${fn}(${escaped})`;
  }

  function evalExtendScript(fn, payload) {
    return new Promise((resolve) => {
      if (!cep || !cep.evalScript) {
        resolve({ ok: false, error: "CEP evalScript unavailable" });
        return;
      }
      const script = buildScript(fn, payload);
      cep.evalScript(script, (result) => {
        if (!result) {
          resolve({ ok: false, error: "Empty response from ExtendScript" });
          return;
        }
        try {
          resolve(JSON.parse(result));
        } catch (err) {
          resolve({ ok: false, error: "Failed to parse ExtendScript response", raw: result });
        }
      });
    });
  }

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
    "toggleVideoTrack"
  ]);

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

  async function handleCommand(command, payload) {
    const { dryRun, cleanPayload } = splitDryRunPayload(payload);
    if (command === "ping") {
      return { ok: true, data: { status: "ok" } };
    }
    if (command === "addMarkers") {
      const markers = cleanPayload.markers;
      if (!Array.isArray(markers) || !markers.length) {
        return { ok: false, error: "Markers array is required" };
      }
      if (dryRun) {
        return {
          ok: true,
          data: { dryRun: true, skipped: true, markersCount: markers.length }
        };
      }
      return evalExtendScript("addMarkersFromJSON", { markers });
    }
    if (command === "addMarkersFromFile") {
      if (!cleanPayload.filePath) {
        return { ok: false, error: "Missing filePath" };
      }
      try {
        const raw = fs.readFileSync(cleanPayload.filePath, "utf8");
        const parsed = JSON.parse(raw);
        const markers = Array.isArray(parsed) ? parsed : parsed.markers;
        if (!markers || !markers.length) {
          return { ok: false, error: "No markers found in file" };
        }
        if (dryRun) {
          return {
            ok: true,
            data: {
              dryRun: true,
              skipped: true,
              filePath: cleanPayload.filePath,
              markersCount: markers.length
            }
          };
        }
        return evalExtendScript("addMarkersFromJSON", { markers });
      } catch (err) {
        return { ok: false, error: `Failed to read marker file: ${err.message}` };
      }
    }
    if (dryRun && MUTATING_COMMANDS.has(command)) {
      return {
        ok: true,
        data: { dryRun: true, skipped: true, command, payload: cleanPayload }
      };
    }
    if (command === "reloadProject") {
      return evalExtendScript("reloadProject", {});
    }
    if (command === "saveProject") {
      return evalExtendScript("saveProject", cleanPayload);
    }
    if (command === "duplicateSequence") {
      return evalExtendScript("duplicateSequence", cleanPayload);
    }
    if (command === "listSequences") {
      return evalExtendScript("listSequences", cleanPayload);
    }
    if (command === "openSequence") {
      return evalExtendScript("openSequence", cleanPayload);
    }
    if (command === "findMenuCommandId") {
      return evalExtendScript("findMenuCommandId", cleanPayload);
    }
    if (command === "getSequenceInfo") {
      return evalExtendScript("getSequenceInfo", {});
    }
    if (command === "sequenceInventory") {
      return evalExtendScript("sequenceInventory", {});
    }
    if (command === "debugTimecode") {
      return evalExtendScript("debugTimecode", cleanPayload);
    }
    if (command === "setPlayheadTimecode") {
      return evalExtendScript("setPlayheadTimecode", cleanPayload);
    }
    if (command === "setInOutPoints") {
      return evalExtendScript("setInOutPoints", cleanPayload);
    }
    if (command === "extractRange") {
      return evalExtendScript("extractRange", cleanPayload);
    }
    if (command === "rippleDeleteSelection") {
      return evalExtendScript("rippleDeleteSelection", cleanPayload);
    }
    if (command === "razorAtTimecode") {
      return evalExtendScript("razorAtTimecode", cleanPayload);
    }
    if (command === "toggleVideoTrack") {
      return evalExtendScript("toggleVideoTrack", cleanPayload);
    }
    return { ok: false, error: `Unknown command: ${command}` };
  }

  function readRequestBody(req) {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1e6) {
          reject(new Error("Request too large"));
          req.destroy();
        }
      });
      req.on("end", () => resolve(body));
      req.on("error", reject);
    });
  }

  function startServer() {
    if (server) {
      return;
    }

    server = http.createServer(async (req, res) => {
      if (req.method !== "POST" || req.url !== "/command") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Not found" }));
        return;
      }

      const token = req.headers["x-auth-token"];
      if (!token || token !== config.token) {
        log(`Unauthorized request from ${req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "unknown"}`);
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
        return;
      }

      try {
        const raw = await readRequestBody(req);
        const payload = JSON.parse(raw || "{}");
        const cmd = payload.cmd ? String(payload.cmd) : "unknown";
        const cmdPayload = payload.payload || {};
        const startTime = Date.now();
        log(`Command ${cmd} <= ${formatForLog(cmdPayload, 200)}`);
        const result = await handleCommand(cmd, cmdPayload);
        const durationMs = Date.now() - startTime;
        log(`Command ${cmd} => ${summarizeResult(result)} (${durationMs}ms)`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        log(`Request error: ${err.message}`);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });

    server.on("error", (err) => {
      log(`Server error: ${err.message}`);
      setStatus(false);
      server = null;
    });

    server.listen(config.port, "127.0.0.1", () => {
      log(`Server listening on 127.0.0.1:${config.port}`);
      setStatus(true);
    });
  }

  function stopServer() {
    if (!server) {
      return;
    }
    server.close(() => {
      log("Server stopped");
      setStatus(false);
      server = null;
    });
  }

  function saveAndRestart() {
    const nextConfig = {
      port: Number(portEl.value) || DEFAULT_PORT,
      token: tokenEl.value || crypto.randomBytes(16).toString("hex")
    };
    config = nextConfig;
    saveConfig(nextConfig);
    updateFields();
    if (server) {
      stopServer();
      setTimeout(startServer, 200);
    }
  }

  function init() {
    applyThemeFromHost();
    if (csInterface && themeChangeEvent && csInterface.addEventListener) {
      csInterface.addEventListener(themeChangeEvent, applyThemeFromHost);
    } else if (cep && themeChangeEvent && cep.addEventListener) {
      cep.addEventListener(themeChangeEvent, applyThemeFromHost);
    }
    if (!ensureNodeModules()) {
      setStatus(false);
      startBtn.disabled = true;
      stopBtn.disabled = true;
      return;
    }

    config = loadConfig();
    updateFields();
    setStatus(false);
    startServer();

    startBtn.addEventListener("click", startServer);
    stopBtn.addEventListener("click", stopServer);
    saveBtn.addEventListener("click", saveAndRestart);
    regenBtn.addEventListener("click", () => {
      tokenEl.value = crypto.randomBytes(16).toString("hex");
    });
    pingBtn.addEventListener("click", async () => {
      const result = await handleCommand("ping", {});
      log(`Ping: ${JSON.stringify(result)}`);
    });
    reloadBtn.addEventListener("click", async () => {
      const result = await handleCommand("reloadProject", {});
      log(`Reload: ${JSON.stringify(result)}`);
    });
  }

  init();
})();
