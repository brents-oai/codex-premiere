var PremiereBridge = PremiereBridge || {};

PremiereBridge._ok = function (data) {
  return JSON.stringify({ ok: true, data: data || null });
};

PremiereBridge._err = function (message, data) {
  return JSON.stringify({ ok: false, error: message || "Unknown error", data: data || null });
};

PremiereBridge._parse = function (jsonStr) {
  if (!jsonStr) {
    return null;
  }
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    try {
      return eval("(" + jsonStr + ")");
    } catch (err2) {
      return null;
    }
  }
};

PremiereBridge._getQeSequence = function () {
  try {
    if (app && app.enableQE) {
      app.enableQE();
      if (qe && qe.project && qe.project.getActiveSequence) {
        return qe.project.getActiveSequence();
      }
    }
  } catch (err) {
  }
  return null;
};

PremiereBridge.TICKS_PER_SECOND = 254016000000;

PremiereBridge._getSequenceTimebase = function (seq) {
  try {
    if (seq && seq.getSettings) {
      var settings = seq.getSettings();
      if (settings && settings.videoFrameRate && settings.videoFrameRate.ticks) {
        var ticksValue = Number(settings.videoFrameRate.ticks);
        if (!isNaN(ticksValue) && ticksValue > 0) {
          return ticksValue;
        }
      }
    }
  } catch (err) {
  }
  if (seq && seq.timebase) {
    var seqTimebase = Number(seq.timebase);
    if (!isNaN(seqTimebase) && seqTimebase > 0) {
      return seqTimebase;
    }
  }
  return null;
};

PremiereBridge._getNominalFps = function (seq, timebase) {
  try {
    if (seq && seq.getSettings) {
      var settings = seq.getSettings();
      if (settings && settings.videoFrameRate && settings.videoFrameRate.seconds) {
        var secondsValue = Number(settings.videoFrameRate.seconds);
        if (!isNaN(secondsValue) && secondsValue > 0) {
          return Math.round(1 / secondsValue);
        }
      }
    }
  } catch (err) {
  }
  if (timebase) {
    var fps = PremiereBridge.TICKS_PER_SECOND / Number(timebase);
    if (!isNaN(fps)) {
      return Math.round(fps);
    }
  }
  return 30;
};

PremiereBridge._secondsToTicks = function (seconds) {
  try {
    var qeSeq = PremiereBridge._getQeSequence();
    if (qeSeq && qeSeq.secondsToTicks) {
      return qeSeq.secondsToTicks(seconds);
    }
  } catch (err) {
  }
  if (seconds !== null && seconds !== undefined && !isNaN(Number(seconds))) {
    return Math.round(Number(seconds) * PremiereBridge.TICKS_PER_SECOND);
  }
  var t = new Time();
  t.seconds = seconds;
  return t.ticks;
};

PremiereBridge._timecodeToTicks = function (timecode) {
  function parseTimecode(raw) {
    if (!raw) {
      return null;
    }
    var str = String(raw);
    var drop = str.indexOf(";") !== -1;
    var clean = str.replace(/;/g, ":");
    var parts = clean.split(":");
    if (parts.length < 4) {
      return null;
    }
    var hours = Number(parts[0]);
    var minutes = Number(parts[1]);
    var seconds = Number(parts[2]);
    var frames = Number(parts[3]);
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(frames)) {
      return null;
    }
    return {
      hours: hours,
      minutes: minutes,
      seconds: seconds,
      frames: frames,
      drop: drop
    };
  }

  try {
    var qeSeq = PremiereBridge._getQeSequence();
    if (qeSeq && qeSeq.timecodeToTicks) {
      try {
        return qeSeq.timecodeToTicks(timecode);
      } catch (errTc1) {
        return qeSeq.timecodeToTicks(String(timecode).replace(/;/g, ":"));
      }
    }
  } catch (err2) {
  }

  try {
    var parsed = parseTimecode(timecode);
    if (!parsed) {
      return null;
    }

    var seq2 = app.project.activeSequence;
    var timebase = PremiereBridge._getSequenceTimebase(seq2);
    var nominal = PremiereBridge._getNominalFps(seq2, timebase);

    var totalMinutes = parsed.hours * 60 + parsed.minutes;
    var totalFrames = ((parsed.hours * 3600 + parsed.minutes * 60 + parsed.seconds) * nominal) + parsed.frames;
    if (parsed.drop) {
      var dropFrames = Math.round(nominal * 0.066666);
      totalFrames -= dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));
    }

    if (timebase) {
      return totalFrames * Number(timebase);
    }

    var seconds = totalFrames / nominal;
    return PremiereBridge._secondsToTicks(seconds);
  } catch (err3) {
  }
  return null;
};

PremiereBridge._toTime = function (marker) {
  if (!marker) {
    return null;
  }

  var t = new Time();

  if (marker.timecode !== undefined && marker.timecode !== null) {
    var ticksFromTimecode = PremiereBridge._timecodeToTicks(String(marker.timecode));
    if (ticksFromTimecode !== null && ticksFromTimecode !== undefined) {
      t.ticks = String(ticksFromTimecode);
      return t;
    }
  }

  if (marker.timeSeconds !== undefined && marker.timeSeconds !== null) {
    var secondsValue = Number(marker.timeSeconds);
    if (!isNaN(secondsValue)) {
      t.ticks = String(PremiereBridge._secondsToTicks(secondsValue));
      return t;
    }
  }

  if (marker.time !== undefined && marker.time !== null) {
    var timeValue = Number(marker.time);
    if (!isNaN(timeValue)) {
      t.ticks = String(PremiereBridge._secondsToTicks(timeValue));
      return t;
    }
  }

  if (marker.timeTicks !== undefined && marker.timeTicks !== null) {
    var tickValue = Number(marker.timeTicks);
    if (!isNaN(tickValue)) {
      t.ticks = String(tickValue);
      return t;
    }
  }

  return null;
};

PremiereBridge._colorValue = function (colorName) {
  if (!colorName) {
    return null;
  }
  var name = String(colorName).toLowerCase();
  var map = {
    red: 4281740498,
    purple: 4289825711,
    orange: 4280578025,
    yellow: 4281049552,
    white: 4294967295,
    blue: 4294741314,
    cyan: 4292277273
  };
  return map.hasOwnProperty(name) ? map[name] : null;
};

PremiereBridge._colorNameFromValue = function (colorValue) {
  var value = Number(colorValue);
  if (isNaN(value)) {
    return null;
  }
  var map = {
    4281740498: "Red",
    4289825711: "Purple",
    4280578025: "Orange",
    4281049552: "Yellow",
    4294967295: "White",
    4294741314: "Blue",
    4292277273: "Cyan"
  };
  return map.hasOwnProperty(value) ? map[value] : null;
};

PremiereBridge._colorIndexFromValue = function (colorValue) {
  var value = Number(colorValue);
  if (isNaN(value)) {
    return null;
  }
  var map = {
    4281740498: 1,
    4289825711: 2,
    4280578025: 3,
    4281049552: 4,
    4294967295: 5,
    4294741314: 6,
    4292277273: 7
  };
  return map.hasOwnProperty(value) ? map[value] : null;
};

PremiereBridge._colorIndex = function (colorName) {
  if (!colorName) {
    return null;
  }
  var name = String(colorName).toLowerCase();
  var map = {
    green: 0,
    red: 1,
    purple: 2,
    orange: 3,
    yellow: 4,
    white: 5,
    blue: 6,
    cyan: 7
  };
  return map.hasOwnProperty(name) ? map[name] : null;
};

PremiereBridge._findMarkerIndex = function (markerCollection, targetMarker) {
  try {
    var index = 0;
    var current = markerCollection.getFirstMarker();
    while (current) {
      if (current === targetMarker) {
        return index;
      }
      if (current.guid && targetMarker && targetMarker.guid && current.guid === targetMarker.guid) {
        return index;
      }
      current = markerCollection.getNextMarker(current);
      index++;
    }
  } catch (err) {
  }
  return null;
};

PremiereBridge._applyColorIndex = function (markerCollection, marker, colorIndex) {
  if (colorIndex === null || colorIndex === undefined || isNaN(colorIndex)) {
    return false;
  }
  try {
    if (marker.setColorByIndex) {
      marker.setColorByIndex(colorIndex);
      return true;
    }
  } catch (err1) {
  }
  try {
    var markerIndex = PremiereBridge._findMarkerIndex(markerCollection, marker);
    if (markerIndex !== null && marker.setColorByIndex) {
      marker.setColorByIndex(colorIndex, markerIndex);
      return true;
    }
  } catch (err2) {
  }
  return false;
};

PremiereBridge.getSequenceInfo = function () {
  try {
    var info = {};
    var seq = app.project.activeSequence;
    if (seq) {
      info.name = seq.name;
      info.timebase = seq.timebase;
      if (seq.getSettings) {
        try {
          info.settings = seq.getSettings();
        } catch (errSettings) {
          info.settingsError = String(errSettings);
        }
      }
    } else {
      return PremiereBridge._err("No active sequence");
    }

    var qeSeq = PremiereBridge._getQeSequence();
    if (qeSeq) {
      info.qe = {};
      if (qeSeq.getSettings) {
        try {
          info.qe.settings = qeSeq.getSettings();
        } catch (errQeSettings) {
          info.qe.settingsError = String(errQeSettings);
        }
      }
    }

    return PremiereBridge._ok(info);
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.debugTimecode = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var timecode = payload.timecode ? String(payload.timecode) : null;
    if (!timecode) {
      return PremiereBridge._err("Missing timecode");
    }

    var result = { input: timecode };
    var seq = app.project.activeSequence;
    result.sequence = {
      name: seq ? seq.name : null,
      timebase: seq ? seq.timebase : null
    };
    if (seq && seq.getSettings) {
      try {
        result.sequence.settings = seq.getSettings();
      } catch (errSettings) {
        result.sequence.settingsError = String(errSettings);
      }
    }

    var qeSeq = PremiereBridge._getQeSequence();
    if (qeSeq) {
      result.qe = {};
      try {
        result.qe.timecodeToTicks = qeSeq.timecodeToTicks(timecode);
      } catch (errTcRaw) {
        result.qe.timecodeToTicksError = String(errTcRaw);
      }
      try {
        result.qe.timecodeToTicksNormalized = qeSeq.timecodeToTicks(timecode.replace(/;/g, ":"));
      } catch (errTcNorm) {
        result.qe.timecodeToTicksNormalizedError = String(errTcNorm);
      }
      try {
        result.qe.ticksToTimecode = qeSeq.ticksToTimecode(result.qe.timecodeToTicks);
      } catch (errTicksToTc) {
        result.qe.ticksToTimecodeError = String(errTicksToTc);
      }
      try {
        result.qe.ticksToTimecodeNormalized = qeSeq.ticksToTimecode(result.qe.timecodeToTicksNormalized);
      } catch (errTicksToTcNorm) {
        result.qe.ticksToTimecodeNormalizedError = String(errTicksToTcNorm);
      }
    }

    var computedTicks = PremiereBridge._timecodeToTicks(timecode);
    result.computedTicks = computedTicks;
    if (qeSeq && qeSeq.ticksToTimecode) {
      try {
        result.computedTimecode = qeSeq.ticksToTimecode(computedTicks);
      } catch (errComputed) {
        result.computedTimecodeError = String(errComputed);
      }
    }

    return PremiereBridge._ok(result);
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.setPlayheadTimecode = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var timecode = payload.timecode ? String(payload.timecode) : null;
    if (!timecode) {
      return PremiereBridge._err("Missing timecode");
    }

    var sequence = app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }

    var ticks = PremiereBridge._timecodeToTicks(timecode);
    if (ticks === null || ticks === undefined || isNaN(Number(ticks))) {
      return PremiereBridge._err("Failed to convert timecode to ticks");
    }

    var tickValue = Number(ticks);
    var tickString = String(Math.round(tickValue));
    var method = null;
    var errors = [];
    var setOk = false;

    var qeSeq = PremiereBridge._getQeSequence();
    if (qeSeq && qeSeq.setPlayerPosition) {
      try {
        qeSeq.setPlayerPosition(tickString);
        setOk = true;
        method = "qe.setPlayerPosition";
      } catch (errQeString) {
        try {
          qeSeq.setPlayerPosition(tickValue);
          setOk = true;
          method = "qe.setPlayerPosition";
        } catch (errQeNumber) {
          errors.push(String(errQeNumber || errQeString));
        }
      }
    }

    if (!setOk && sequence.setPlayerPosition) {
      try {
        sequence.setPlayerPosition(tickString);
        setOk = true;
        method = "dom.setPlayerPosition";
      } catch (errDomString) {
        try {
          sequence.setPlayerPosition(tickValue);
          setOk = true;
          method = "dom.setPlayerPosition";
        } catch (errDomNumber) {
          try {
            var t = new Time();
            t.ticks = tickString;
            sequence.setPlayerPosition(t);
            setOk = true;
            method = "dom.setPlayerPosition(Time)";
          } catch (errDomTime) {
            errors.push(String(errDomTime || errDomNumber || errDomString));
          }
        }
      }
    }

    if (!setOk) {
      return PremiereBridge._err("Unable to set playhead position", { errors: errors });
    }

    return PremiereBridge._ok({ timecode: timecode, ticks: tickString, method: method });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.setInOutPoints = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var sequence = app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }

    function ticksFrom(prefix) {
      var ticksKey = prefix + "Ticks";
      if (payload[ticksKey] !== undefined && payload[ticksKey] !== null) {
        var ticksValue = Number(payload[ticksKey]);
        if (!isNaN(ticksValue)) {
          return ticksValue;
        }
      }

      var timecodeKey = prefix + "Timecode";
      if (payload[timecodeKey] !== undefined && payload[timecodeKey] !== null) {
        var ticksFromTimecode = PremiereBridge._timecodeToTicks(String(payload[timecodeKey]));
        if (ticksFromTimecode !== null && ticksFromTimecode !== undefined && !isNaN(Number(ticksFromTimecode))) {
          return Number(ticksFromTimecode);
        }
      }

      var secondsKey = prefix + "Seconds";
      if (payload[secondsKey] !== undefined && payload[secondsKey] !== null) {
        var secondsValue = Number(payload[secondsKey]);
        if (!isNaN(secondsValue)) {
          return Number(PremiereBridge._secondsToTicks(secondsValue));
        }
      }

      if (payload[prefix] !== undefined && payload[prefix] !== null) {
        var raw = payload[prefix];
        var str = String(raw);
        if (str.indexOf(":") !== -1 || str.indexOf(";") !== -1) {
          var ticksFromRawTimecode = PremiereBridge._timecodeToTicks(str);
          if (ticksFromRawTimecode !== null && ticksFromRawTimecode !== undefined && !isNaN(Number(ticksFromRawTimecode))) {
            return Number(ticksFromRawTimecode);
          }
        }
        var numericRaw = Number(raw);
        if (!isNaN(numericRaw)) {
          return Number(PremiereBridge._secondsToTicks(numericRaw));
        }
      }

      return null;
    }

    var inTicks = ticksFrom("in");
    var outTicks = ticksFrom("out");
    if (inTicks === null || outTicks === null) {
      return PremiereBridge._err("Missing or invalid in/out values", {
        received: payload
      });
    }

    inTicks = Math.round(Number(inTicks));
    outTicks = Math.round(Number(outTicks));
    if (isNaN(inTicks) || isNaN(outTicks)) {
      return PremiereBridge._err("Failed to compute in/out ticks", { inTicks: inTicks, outTicks: outTicks });
    }
    if (outTicks < inTicks) {
      return PremiereBridge._err("Out point must be after in point", { inTicks: inTicks, outTicks: outTicks });
    }

    var methods = [];
    var errors = [];

    function setPoint(target, setterName, ticksValue, label, methodPrefix) {
      if (!target || !target[setterName]) {
        return false;
      }
      var ticksString = String(ticksValue);
      try {
        target[setterName](ticksString);
        methods.push(methodPrefix + setterName + "(string)");
        return true;
      } catch (errString) {
        try {
          target[setterName](ticksValue);
          methods.push(methodPrefix + setterName + "(number)");
          return true;
        } catch (errNumber) {
          try {
            var t = new Time();
            t.ticks = ticksString;
            target[setterName](t);
            methods.push(methodPrefix + setterName + "(Time)");
            return true;
          } catch (errTime) {
            errors.push(label + ": " + String(errTime || errNumber || errString));
          }
        }
      }
      return false;
    }

    var qeSeq = PremiereBridge._getQeSequence();
    var inApplied = false;
    var outApplied = false;

    // Prefer DOM here; QE accepts different units in some contexts.
    inApplied = setPoint(sequence, "setInPoint", inTicks, "DOM in", "dom.");
    outApplied = setPoint(sequence, "setOutPoint", outTicks, "DOM out", "dom.");

    if ((!inApplied || !outApplied) && qeSeq) {
      if (!inApplied) {
        inApplied = setPoint(qeSeq, "setInPoint", inTicks, "QE in", "qe.");
      }
      if (!outApplied) {
        outApplied = setPoint(qeSeq, "setOutPoint", outTicks, "QE out", "qe.");
      }
    }

    if (!inApplied || !outApplied) {
      return PremiereBridge._err("Failed to set in/out points", {
        inApplied: inApplied,
        outApplied: outApplied,
        inTicks: String(inTicks),
        outTicks: String(outTicks),
        methods: methods,
        errors: errors,
        available: {
          qeSetIn: !!(qeSeq && qeSeq.setInPoint),
          qeSetOut: !!(qeSeq && qeSeq.setOutPoint),
          domSetIn: !!sequence.setInPoint,
          domSetOut: !!sequence.setOutPoint
        }
      });
    }

    return PremiereBridge._ok({
      inTicks: String(inTicks),
      outTicks: String(outTicks),
      methods: methods
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.addMarkersFromJSON = function (jsonStr) {
  try {
    var data = PremiereBridge._parse(jsonStr);
    if (!data || !data.markers || !data.markers.length) {
      return PremiereBridge._err("No markers provided");
    }

    var sequence = app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }

    var markerCollection = sequence.markers;
    var added = 0;
    var errors = [];

    for (var i = 0; i < data.markers.length; i++) {
      var markerData = data.markers[i];
      var startTime = PremiereBridge._toTime(markerData);
      if (!startTime) {
        errors.push({ index: i, error: "Invalid time" });
        continue;
      }

      var marker = null;
      var ticksValue = null;
      if (startTime.ticks !== undefined && startTime.ticks !== null) {
        ticksValue = String(startTime.ticks);
      }
      try {
        marker = markerCollection.createMarker(startTime);
      } catch (createErr1) {
        try {
          marker = markerCollection.createMarker(ticksValue !== null ? ticksValue : startTime);
        } catch (createErr2) {
          try {
            marker = markerCollection.createMarker(startTime.seconds);
          } catch (createErr3) {
            try {
              marker = markerCollection.createMarker(startTime.ticks);
            } catch (createErr4) {
              errors.push({ index: i, error: "Failed to create marker: " + String(createErr4) });
              continue;
            }
          }
        }
      }

      if (!marker) {
        errors.push({ index: i, error: "Failed to create marker" });
        continue;
      }

      if (markerData.name) {
        marker.name = markerData.name;
      }

      if (markerData.comment) {
        if (marker.comments !== undefined) {
          marker.comments = markerData.comment;
        } else if (marker.comment !== undefined) {
          marker.comment = markerData.comment;
        }
      }

      var colorSet = false;
      var colorIndex = null;
      if (markerData.colorIndex !== undefined && markerData.colorIndex !== null) {
        colorIndex = Number(markerData.colorIndex);
      } else if (markerData.colorValue !== undefined && markerData.colorValue !== null) {
        var mappedIndex = PremiereBridge._colorIndexFromValue(markerData.colorValue);
        if (mappedIndex !== null) {
          colorIndex = mappedIndex;
        } else {
          var rawIndex = Number(markerData.colorValue);
          if (!isNaN(rawIndex) && rawIndex >= 0 && rawIndex <= 7) {
            colorIndex = rawIndex;
          }
        }
      } else if (markerData.color !== undefined && markerData.color !== null) {
        if (typeof markerData.color === "number") {
          colorIndex = Number(markerData.color);
        } else if (typeof markerData.color === "string") {
          colorIndex = PremiereBridge._colorIndex(markerData.color);
        }
      }

      if (colorIndex !== null && !isNaN(colorIndex)) {
        colorSet = PremiereBridge._applyColorIndex(markerCollection, marker, colorIndex);
        if (!colorSet && marker.setColorByName && typeof markerData.color === "string") {
          try {
            marker.setColorByName(markerData.color);
            colorSet = true;
          } catch (errColorNameFallback) {
          }
        }
      }

      if (markerData.durationSeconds !== undefined && marker.end !== undefined) {
        var duration = Number(markerData.durationSeconds);
        if (!isNaN(duration) && duration > 0) {
          var endTime = new Time();
          endTime.seconds = startTime.seconds + duration;
          marker.end = endTime.ticks;
        }
      }

      added++;
    }

    return PremiereBridge._ok({ added: added, errors: errors });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.saveProject = function (jsonStr) {
  try {
    var project = app.project;
    if (!project) {
      return PremiereBridge._err("No project loaded");
    }

    try {
      project.save();
    } catch (saveErr) {
      return PremiereBridge._err("Failed to save project", { error: String(saveErr) });
    }

    return PremiereBridge._ok({ method: "project.save", path: project.path || null });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.reloadProject = function () {
  try {
    var project = app.project;
    if (!project) {
      return PremiereBridge._err("No project loaded");
    }

    var projectPath = project.path;
    if (!projectPath) {
      return PremiereBridge._err("Project has no file path");
    }

    try {
      project.save();
    } catch (saveErr) {
      return PremiereBridge._err("Failed to save project before reload", { error: String(saveErr) });
    }

    var file = new File(projectPath);
    var filePath = file.fsName;

    if (project.closeDocument) {
      try {
        project.closeDocument();
      } catch (closeErr) {
      }
    }

    if (app.openDocument) {
      try {
        app.openDocument(file);
        return PremiereBridge._ok({ method: "app.openDocument(file)" });
      } catch (openErr1) {
        try {
          app.openDocument(filePath);
          return PremiereBridge._ok({ method: "app.openDocument(path)" });
        } catch (openErr2) {
        }
      }
    }

    if (app.openDocument2) {
      try {
        app.openDocument2(filePath);
        return PremiereBridge._ok({ method: "app.openDocument2" });
      } catch (openErr3) {
      }
    }

    return PremiereBridge._err("Reload is not supported by the current scripting API");
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.toggleVideoTrack = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var trackIndex = null;

    if (payload.track !== undefined && payload.track !== null) {
      var trackStr = String(payload.track).toUpperCase();
      if (trackStr.indexOf("V") === 0) {
        trackIndex = Number(trackStr.slice(1)) - 1;
      } else {
        trackIndex = Number(trackStr) - 1;
      }
    } else if (payload.trackNumber !== undefined && payload.trackNumber !== null) {
      trackIndex = Number(payload.trackNumber) - 1;
    } else if (payload.trackIndex !== undefined && payload.trackIndex !== null) {
      trackIndex = Number(payload.trackIndex);
    }

    if (trackIndex === null || isNaN(trackIndex) || trackIndex < 0) {
      return PremiereBridge._err("Invalid track identifier");
    }

    var desiredMute = null;
    if (payload.mute !== undefined && payload.mute !== null) {
      desiredMute = !!payload.mute;
    } else if (payload.visible !== undefined && payload.visible !== null) {
      desiredMute = !payload.visible;
    }

    var method = null;
    var currentMute = null;

    var qeSeq = PremiereBridge._getQeSequence();
    if (qeSeq && qeSeq.getVideoTrackAt) {
      var qeTrack = qeSeq.getVideoTrackAt(trackIndex);
      if (!qeTrack) {
        return PremiereBridge._err("Video track not found");
      }

      if (qeTrack.isMuted) {
        try {
          currentMute = qeTrack.isMuted();
        } catch (errMuted) {
        }
      } else if (qeTrack.getMute) {
        try {
          currentMute = qeTrack.getMute();
        } catch (errGetMute) {
        }
      } else if (qeTrack.isEnabled) {
        try {
          currentMute = !qeTrack.isEnabled();
        } catch (errEnabled) {
        }
      }

      var nextMute = desiredMute;
      if (nextMute === null) {
        if (currentMute === null) {
          return PremiereBridge._err("Unable to determine current track state for toggle");
        }
        nextMute = !currentMute;
      }

      if (qeTrack.setMute) {
        qeTrack.setMute(nextMute ? 1 : 0);
        method = "qe.setMute";
      } else if (qeTrack.setEnabled) {
        qeTrack.setEnabled(!nextMute);
        method = "qe.setEnabled";
      } else {
        return PremiereBridge._err("Unable to toggle video track (no supported setter)");
      }

      return PremiereBridge._ok({ trackIndex: trackIndex, muted: nextMute, method: method });
    }

    var sequence = app.project.activeSequence;
    if (!sequence || !sequence.videoTracks) {
      return PremiereBridge._err("No active sequence or video tracks");
    }

    var track = null;
    if (sequence.videoTracks[trackIndex]) {
      track = sequence.videoTracks[trackIndex];
    } else if (sequence.videoTracks.numTracks && trackIndex < sequence.videoTracks.numTracks) {
      track = sequence.videoTracks[trackIndex];
    }

    if (!track) {
      return PremiereBridge._err("Video track not found");
    }

    if (track.isMuted) {
      try {
        currentMute = track.isMuted();
      } catch (errMuted2) {
      }
    } else if (track.getMute) {
      try {
        currentMute = track.getMute();
      } catch (errGetMute2) {
      }
    } else if (track.isEnabled) {
      try {
        currentMute = !track.isEnabled();
      } catch (errEnabled2) {
      }
    }

    var fallbackMute = desiredMute;
    if (fallbackMute === null) {
      if (currentMute === null) {
        return PremiereBridge._err("Unable to determine current track state for toggle");
      }
      fallbackMute = !currentMute;
    }

    if (track.setMute) {
      track.setMute(fallbackMute ? 1 : 0);
      method = "dom.setMute";
    } else if (track.setEnabled) {
      track.setEnabled(!fallbackMute);
      method = "dom.setEnabled";
    } else {
      return PremiereBridge._err("Unable to toggle video track (no supported setter)");
    }

    return PremiereBridge._ok({ trackIndex: trackIndex, muted: fallbackMute, method: method });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};
