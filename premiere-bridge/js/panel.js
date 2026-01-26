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

  let http;
  let fs;
  let path;
  let os;
  let crypto;

  const DEFAULT_PORT = 17321;
  let server = null;
  let config = null;

  function log(message) {
    const time = new Date().toISOString().replace("T", " ").replace("Z", "");
    logEl.textContent += `[${time}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
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

  async function handleCommand(command, payload) {
    if (command === "ping") {
      return { ok: true, data: { status: "ok" } };
    }
    if (command === "addMarkers") {
      return evalExtendScript("addMarkersFromJSON", payload || {});
    }
    if (command === "addMarkersFromFile") {
      if (!payload || !payload.filePath) {
        return { ok: false, error: "Missing filePath" };
      }
      try {
        const raw = fs.readFileSync(payload.filePath, "utf8");
        const parsed = JSON.parse(raw);
        const markers = Array.isArray(parsed) ? parsed : parsed.markers;
        if (!markers || !markers.length) {
          return { ok: false, error: "No markers found in file" };
        }
        return evalExtendScript("addMarkersFromJSON", { markers });
      } catch (err) {
        return { ok: false, error: `Failed to read marker file: ${err.message}` };
      }
    }
    if (command === "reloadProject") {
      return evalExtendScript("reloadProject", {});
    }
    if (command === "saveProject") {
      return evalExtendScript("saveProject", payload || {});
    }
    if (command === "duplicateSequence") {
      return evalExtendScript("duplicateSequence", payload || {});
    }
    if (command === "getSequenceInfo") {
      return evalExtendScript("getSequenceInfo", {});
    }
    if (command === "debugTimecode") {
      return evalExtendScript("debugTimecode", payload || {});
    }
    if (command === "setPlayheadTimecode") {
      return evalExtendScript("setPlayheadTimecode", payload || {});
    }
    if (command === "setInOutPoints") {
      return evalExtendScript("setInOutPoints", payload || {});
    }
    if (command === "toggleVideoTrack") {
      return evalExtendScript("toggleVideoTrack", payload || {});
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
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
        return;
      }

      try {
        const raw = await readRequestBody(req);
        const payload = JSON.parse(raw || "{}");
        const result = await handleCommand(payload.cmd, payload.payload);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
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
