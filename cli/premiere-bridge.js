#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");

const DEFAULT_PORT = 17321;

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
