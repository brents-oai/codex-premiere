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

PremiereBridge.findMenuCommandId = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    if (!app || !app.findMenuCommandId) {
      return PremiereBridge._err("app.findMenuCommandId is unavailable", {
        available: {
          appFindMenuCommandId: !!(app && app.findMenuCommandId),
          appExecuteCommand: !!(app && app.executeCommand)
        }
      });
    }

    var names = [];
    if (payload.names && payload.names.length) {
      for (var i = 0; i < payload.names.length; i++) {
        names.push(String(payload.names[i]));
      }
    } else if (payload.name) {
      names = [String(payload.name)];
    }
    if (!names.length) {
      return PremiereBridge._err("Provide a name or names array");
    }

    var results = [];
    for (var j = 0; j < names.length; j++) {
      var name = names[j];
      var id = null;
      var errMsg = null;
      try {
        id = Number(app.findMenuCommandId(name));
      } catch (errFind) {
        errMsg = String(errFind);
      }
      results.push({
        name: name,
        id: id,
        ok: !errMsg && !isNaN(id) && id > 0,
        error: errMsg
      });
    }

    return PremiereBridge._ok({
      results: results,
      available: {
        appFindMenuCommandId: !!(app && app.findMenuCommandId),
        appExecuteCommand: !!(app && app.executeCommand)
      }
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
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

PremiereBridge._timeToTicks = function (value) {
  if (value === undefined || value === null) {
    return null;
  }
  try {
    if (value.ticks !== undefined && value.ticks !== null) {
      var ticksFromObj = Number(value.ticks);
      if (!isNaN(ticksFromObj)) {
        return ticksFromObj;
      }
    }
  } catch (errTicks) {
  }
  try {
    if (value.seconds !== undefined && value.seconds !== null) {
      var secondsFromObj = Number(value.seconds);
      if (!isNaN(secondsFromObj)) {
        return secondsFromObj * PremiereBridge.TICKS_PER_SECOND;
      }
    }
  } catch (errSeconds) {
  }
  var numeric = Number(value);
  if (!isNaN(numeric)) {
    return numeric;
  }
  return null;
};

PremiereBridge._timeToSeconds = function (value) {
  if (value === undefined || value === null) {
    return null;
  }
  try {
    if (value.seconds !== undefined && value.seconds !== null) {
      var secondsFromObj = Number(value.seconds);
      if (!isNaN(secondsFromObj)) {
        return secondsFromObj;
      }
    }
  } catch (errSeconds) {
  }
  var ticks = PremiereBridge._timeToTicks(value);
  if (ticks === null) {
    return null;
  }
  return Number(ticks) / PremiereBridge.TICKS_PER_SECOND;
};

PremiereBridge._collectionCount = function (collection, maxScan) {
  if (!collection) {
    return 0;
  }
  try {
    if (collection.numItems !== undefined && collection.numItems !== null) {
      var nItems = Number(collection.numItems);
      if (!isNaN(nItems) && nItems >= 0) {
        return nItems;
      }
    }
  } catch (errNumItems) {
  }
  try {
    if (collection.numTracks !== undefined && collection.numTracks !== null) {
      var nTracks = Number(collection.numTracks);
      if (!isNaN(nTracks) && nTracks >= 0) {
        return nTracks;
      }
    }
  } catch (errNumTracks) {
  }
  try {
    if (collection.length !== undefined && collection.length !== null) {
      var len = Number(collection.length);
      if (!isNaN(len) && len >= 0) {
        return len;
      }
    }
  } catch (errLength) {
  }
  var scanLimit = maxScan || 256;
  var count = 0;
  for (var i = 0; i < scanLimit; i++) {
    try {
      if (collection[i]) {
        count = i + 1;
      }
    } catch (errIndex) {
      break;
    }
  }
  return count;
};

PremiereBridge._ticksToTimecode = function (ticks) {
  if (ticks === null || ticks === undefined) {
    return null;
  }
  var qeSeq = PremiereBridge._getQeSequence();
  if (qeSeq && qeSeq.ticksToTimecode) {
    try {
      return qeSeq.ticksToTimecode(String(Math.round(Number(ticks))));
    } catch (errTicksString) {
      try {
        return qeSeq.ticksToTimecode(Number(ticks));
      } catch (errTicksNumber) {
      }
    }
  }
  return null;
};

PremiereBridge._sequenceStartTicks = function (sequence, qeSeq) {
  var startTicks = null;
  try {
    if (sequence && sequence.zeroPoint !== undefined && sequence.zeroPoint !== null) {
      startTicks = PremiereBridge._timeToTicks(sequence.zeroPoint);
    }
  } catch (errZeroPoint) {
  }
  if (startTicks === null && qeSeq && qeSeq.getZeroPoint) {
    try {
      startTicks = PremiereBridge._timeToTicks(qeSeq.getZeroPoint());
    } catch (errQeZero) {
    }
  }
  if (startTicks === null || isNaN(Number(startTicks))) {
    startTicks = 0;
  }
  return Math.round(Number(startTicks));
};

PremiereBridge._ticksFromPayload = function (payload, prefix) {
  if (!payload) {
    return null;
  }
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
};

PremiereBridge._computeInOutTicks = function (payload) {
  var inTicks = PremiereBridge._ticksFromPayload(payload, "in");
  var outTicks = PremiereBridge._ticksFromPayload(payload, "out");
  if (inTicks === null || outTicks === null) {
    return {
      ok: false,
      error: "Missing or invalid in/out values",
      data: { received: payload }
    };
  }

  inTicks = Math.round(Number(inTicks));
  outTicks = Math.round(Number(outTicks));
  if (isNaN(inTicks) || isNaN(outTicks)) {
    return {
      ok: false,
      error: "Failed to compute in/out ticks",
      data: { inTicks: inTicks, outTicks: outTicks }
    };
  }
  if (outTicks < inTicks) {
    return {
      ok: false,
      error: "Out point must be after in point",
      data: { inTicks: inTicks, outTicks: outTicks }
    };
  }

  return {
    ok: true,
    inTicks: inTicks,
    outTicks: outTicks
  };
};

PremiereBridge._setInOutTicks = function (sequence, qeSeq, inTicks, outTicks) {
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

  return {
    ok: inApplied && outApplied,
    inApplied: inApplied,
    outApplied: outApplied,
    methods: methods,
    errors: errors,
    available: {
      qeSetIn: !!(qeSeq && qeSeq.setInPoint),
      qeSetOut: !!(qeSeq && qeSeq.setOutPoint),
      domSetIn: !!(sequence && sequence.setInPoint),
      domSetOut: !!(sequence && sequence.setOutPoint)
    }
  };
};

PremiereBridge._clipSelectionState = function (clip) {
  if (!clip) {
    return false;
  }
  try {
    if (clip.isSelected) {
      return !!clip.isSelected();
    }
  } catch (errIsSelected) {
  }
  try {
    if (clip.getSelectionState) {
      return !!clip.getSelectionState();
    }
  } catch (errGetSelection) {
  }
  try {
    if (clip.selected !== undefined && clip.selected !== null) {
      return !!clip.selected;
    }
  } catch (errSelected) {
  }
  return false;
};

PremiereBridge._selectedTrackItems = function (sequence) {
  var selected = [];
  if (!sequence) {
    return selected;
  }

  function collect(kind, trackCollection) {
    var trackCount = PremiereBridge._collectionCount(trackCollection, 64);
    for (var t = 0; t < trackCount; t++) {
      var track = null;
      try {
        track = trackCollection[t];
      } catch (errTrackGet) {
      }
      if (!track || !track.clips) {
        continue;
      }
      var clipCollection = track.clips;
      var clipCount = PremiereBridge._collectionCount(clipCollection, 512);
      for (var c = 0; c < clipCount; c++) {
        var clip = null;
        try {
          clip = clipCollection[c];
        } catch (errClipGet) {
        }
        if (!clip || !PremiereBridge._clipSelectionState(clip)) {
          continue;
        }
        var startTicks = PremiereBridge._timeToTicks(clip.start);
        var endTicks = PremiereBridge._timeToTicks(clip.end);
        selected.push({
          kind: kind,
          trackIndex: t,
          clipIndex: c,
          name: clip.name ? String(clip.name) : null,
          startTicks: startTicks !== null ? Math.round(Number(startTicks)) : null,
          endTicks: endTicks !== null ? Math.round(Number(endTicks)) : null
        });
      }
    }
  }

  collect("video", sequence.videoTracks);
  collect("audio", sequence.audioTracks);
  return selected;
};

PremiereBridge._selectionBounds = function (selectedItems) {
  if (!selectedItems || !selectedItems.length) {
    return null;
  }
  var minStart = null;
  var maxEnd = null;
  for (var i = 0; i < selectedItems.length; i++) {
    var item = selectedItems[i];
    if (!item) {
      continue;
    }
    var startTicks = item.startTicks;
    var endTicks = item.endTicks;
    if (startTicks !== null && startTicks !== undefined && !isNaN(Number(startTicks))) {
      if (minStart === null || startTicks < minStart) {
        minStart = startTicks;
      }
    }
    if (endTicks !== null && endTicks !== undefined && !isNaN(Number(endTicks))) {
      if (maxEnd === null || endTicks > maxEnd) {
        maxEnd = endTicks;
      }
    }
  }
  if (minStart === null || maxEnd === null) {
    return null;
  }
  return {
    inTicks: Math.round(Number(minStart)),
    outTicks: Math.round(Number(maxEnd))
  };
};

PremiereBridge._performExtractInOut = function (sequence, qeSeq, payload) {
  var errors = [];
  var available = {
    domExtractInOut: !!(sequence && sequence.extractInOut),
    domExtract: !!(sequence && sequence.extract),
    domLiftInOut: !!(sequence && sequence.liftInOut),
    domLift: !!(sequence && sequence.lift),
    domRemoveInOut: !!(sequence && sequence.removeInOut),
    qeExtractInOut: !!(qeSeq && qeSeq.extractInOut),
    qeExtract: !!(qeSeq && qeSeq.extract),
    qeLiftInOut: !!(qeSeq && qeSeq.liftInOut),
    qeLift: !!(qeSeq && qeSeq.lift),
    qeRemoveInOut: !!(qeSeq && qeSeq.removeInOut),
    qeRippleDeleteInOut: !!(qeSeq && qeSeq.rippleDeleteInOut),
    qeRippleDelete: !!(qeSeq && qeSeq.rippleDelete),
    appExecuteCommand: !!(app && app.executeCommand),
    appFindMenuCommandId: !!(app && app.findMenuCommandId)
  };

  function attemptCall(target, methodName, label, argSets) {
    if (!target || !target[methodName]) {
      return null;
    }
    var argsList = argSets && argSets.length ? argSets : [[]];
    for (var i = 0; i < argsList.length; i++) {
      var args = argsList[i];
      try {
        target[methodName].apply(target, args);
        return label + "(" + (args.length ? args.join(",") : "") + ")";
      } catch (errCall) {
        errors.push(label + ": " + String(errCall));
      }
    }
    return null;
  }

  function attemptMenuCommand(menuName) {
    if (!app || !app.findMenuCommandId || !app.executeCommand) {
      return null;
    }
    var id = -1;
    try {
      id = Number(app.findMenuCommandId(menuName));
    } catch (errFind) {
      errors.push("app.findMenuCommandId(" + menuName + "): " + String(errFind));
      return null;
    }
    if (isNaN(id) || id <= 0) {
      errors.push("app.findMenuCommandId(" + menuName + "): " + String(id));
      return null;
    }
    try {
      app.executeCommand(id);
      return "app.executeCommand(" + menuName + ":" + id + ")";
    } catch (errExec) {
      errors.push("app.executeCommand(" + menuName + ":" + id + "): " + String(errExec));
      return null;
    }
  }

  var methodUsed = null;

  // Prefer the UI command when available; it tends to match Premiere's semantics.
  methodUsed = attemptMenuCommand("Extract");
  if (!methodUsed) {
    methodUsed = attemptCall(sequence, "extractInOut", "dom.extractInOut");
  }
  if (!methodUsed) {
    methodUsed = attemptCall(sequence, "extract", "dom.extractInOut");
  }
  if (!methodUsed) {
    methodUsed = attemptCall(sequence, "liftInOut", "dom.liftInOut");
  }
  if (!methodUsed) {
    methodUsed = attemptCall(sequence, "lift", "dom.liftInOut");
  }
  if (!methodUsed) {
    methodUsed = attemptCall(sequence, "removeInOut", "dom.removeInOut", [[1, 1], [1], []]);
  }

  if (!methodUsed) {
    methodUsed = attemptCall(qeSeq, "extractInOut", "qe.extractInOut");
  }
  if (!methodUsed) {
    methodUsed = attemptCall(qeSeq, "extract", "qe.extractInOut");
  }
  if (!methodUsed) {
    methodUsed = attemptCall(qeSeq, "liftInOut", "qe.liftInOut");
  }
  if (!methodUsed) {
    methodUsed = attemptCall(qeSeq, "lift", "qe.liftInOut");
  }
  if (!methodUsed) {
    methodUsed = attemptCall(qeSeq, "removeInOut", "qe.removeInOut", [[1, 1], [1], []]);
  }
  if (!methodUsed) {
    methodUsed = attemptCall(qeSeq, "rippleDeleteInOut", "qe.rippleDeleteInOut", [[1], []]);
  }
  if (!methodUsed) {
    methodUsed = attemptCall(qeSeq, "rippleDelete", "qe.rippleDelete", [[1], []]);
  }

  if (!methodUsed && payload && payload.commandId !== undefined && payload.commandId !== null && app.executeCommand) {
    var commandId = Number(payload.commandId);
    if (!isNaN(commandId)) {
      try {
        app.executeCommand(commandId);
        methodUsed = "app.executeCommand(" + commandId + ")";
      } catch (errExec) {
        errors.push("app.executeCommand: " + String(errExec));
      }
    }
  }

  return {
    ok: !!methodUsed,
    method: methodUsed,
    errors: errors,
    available: available
  };
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
    var qeSeq = PremiereBridge._getQeSequence();
    var computed = PremiereBridge._computeInOutTicks(payload);
    if (!computed.ok) {
      return PremiereBridge._err(computed.error, computed.data);
    }

    var inTicks = computed.inTicks;
    var outTicks = computed.outTicks;
    var applied = PremiereBridge._setInOutTicks(sequence, qeSeq, inTicks, outTicks);
    if (!applied.ok) {
      return PremiereBridge._err("Failed to set in/out points", {
        inApplied: applied.inApplied,
        outApplied: applied.outApplied,
        inTicks: String(inTicks),
        outTicks: String(outTicks),
        methods: applied.methods,
        errors: applied.errors,
        available: applied.available
      });
    }

    return PremiereBridge._ok({
      inTicks: String(inTicks),
      outTicks: String(outTicks),
      methods: applied.methods
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.extractRange = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var sequence = app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }

    var qeSeq = PremiereBridge._getQeSequence();
    var computed = PremiereBridge._computeInOutTicks(payload);
    if (!computed.ok) {
      return PremiereBridge._err(computed.error, computed.data);
    }

    var inTicks = computed.inTicks;
    var outTicks = computed.outTicks;
    var setResult = PremiereBridge._setInOutTicks(sequence, qeSeq, inTicks, outTicks);
    if (!setResult.ok) {
      return PremiereBridge._err("Failed to set in/out points", {
        inApplied: setResult.inApplied,
        outApplied: setResult.outApplied,
        inTicks: String(inTicks),
        outTicks: String(outTicks),
        methods: setResult.methods,
        errors: setResult.errors,
        available: setResult.available
      });
    }

    var inTimecode = payload.inTimecode ? String(payload.inTimecode) : PremiereBridge._ticksToTimecode(inTicks);
    var outTimecode = payload.outTimecode ? String(payload.outTimecode) : PremiereBridge._ticksToTimecode(outTicks);

    function razorPayload(ticksValue, timecodeValue) {
      if (timecodeValue) {
        return { timecode: timecodeValue, unit: "timecode" };
      }
      return { ticks: ticksValue, unit: "ticks" };
    }

    var razorInRaw = PremiereBridge.razorAtTimecode(JSON.stringify(razorPayload(inTicks, inTimecode)));
    var razorOutRaw = PremiereBridge.razorAtTimecode(JSON.stringify(razorPayload(outTicks, outTimecode)));
    var razorIn = PremiereBridge._parse(razorInRaw);
    var razorOut = PremiereBridge._parse(razorOutRaw);

    var extractResult = PremiereBridge._performExtractInOut(sequence, qeSeq, payload);
    if (!extractResult.ok) {
      return PremiereBridge._err("Unable to extract in/out range", {
        inTicks: String(inTicks),
        outTicks: String(outTicks),
        inTimecode: inTimecode,
        outTimecode: outTimecode,
        setInOut: setResult,
        razor: {
          inResult: razorIn,
          outResult: razorOut
        },
        available: extractResult.available,
        errors: extractResult.errors
      });
    }

    return PremiereBridge._ok({
      inTicks: String(inTicks),
      outTicks: String(outTicks),
      inTimecode: inTimecode,
      outTimecode: outTimecode,
      setInOut: {
        methods: setResult.methods
      },
      razor: {
        inResult: razorIn,
        outResult: razorOut
      },
      extract: {
        method: extractResult.method,
        errors: extractResult.errors,
        available: extractResult.available
      }
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.rippleDeleteSelection = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var sequence = app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }

    var qeSeq = PremiereBridge._getQeSequence();
    var selectedItems = PremiereBridge._selectedTrackItems(sequence);
    if (!selectedItems.length) {
      return PremiereBridge._err("No selected track items found");
    }
    var bounds = PremiereBridge._selectionBounds(selectedItems);
    if (!bounds) {
      return PremiereBridge._err("Unable to compute selection bounds", {
        selectionCount: selectedItems.length
      });
    }

    var extractPayload = {
      inTicks: bounds.inTicks,
      outTicks: bounds.outTicks
    };
    if (payload.commandId !== undefined && payload.commandId !== null) {
      extractPayload.commandId = payload.commandId;
    }

    var extractRaw = PremiereBridge.extractRange(JSON.stringify(extractPayload));
    var extractResult = PremiereBridge._parse(extractRaw);
    if (!extractResult || !extractResult.ok) {
      return PremiereBridge._err("Failed to ripple delete selection", {
        selectionCount: selectedItems.length,
        bounds: bounds,
        extractResult: extractResult
      });
    }

    var sample = selectedItems.slice(0, 12);
    return PremiereBridge._ok({
      selectionCount: selectedItems.length,
      selectionSample: sample,
      bounds: {
        inTicks: String(bounds.inTicks),
        outTicks: String(bounds.outTicks),
        inTimecode: PremiereBridge._ticksToTimecode(bounds.inTicks),
        outTimecode: PremiereBridge._ticksToTimecode(bounds.outTicks)
      },
      extract: extractResult.data,
      available: {
        qeAvailable: !!qeSeq
      }
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.sequenceInventory = function () {
  try {
    var sequence = app.project && app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }

    var qeSeq = PremiereBridge._getQeSequence();
    var settings = null;
    var settingsError = null;
    if (sequence.getSettings) {
      try {
        settings = sequence.getSettings();
      } catch (errSettings) {
        settingsError = String(errSettings);
      }
    }

    var timebase = PremiereBridge._getSequenceTimebase(sequence);
    var nominalFps = PremiereBridge._getNominalFps(sequence, timebase);
    var startTicks = PremiereBridge._sequenceStartTicks(sequence, qeSeq);
    var startTimecode = PremiereBridge._ticksToTimecode(startTicks);
    var dropFrame = null;
    if (startTimecode && String(startTimecode).indexOf(";") !== -1) {
      dropFrame = true;
    } else if (startTimecode) {
      dropFrame = false;
    }

    function summarizeTicks(ticksValue) {
      if (ticksValue === null || ticksValue === undefined || isNaN(Number(ticksValue))) {
        return { ticks: null, seconds: null, timecode: null };
      }
      var rounded = Math.round(Number(ticksValue));
      return {
        ticks: String(rounded),
        seconds: rounded / PremiereBridge.TICKS_PER_SECOND,
        timecode: PremiereBridge._ticksToTimecode(rounded)
      };
    }

    function clipName(clip) {
      if (!clip) {
        return null;
      }
      try {
        if (clip.name) {
          return String(clip.name);
        }
      } catch (errClipName) {
      }
      try {
        if (clip.projectItem && clip.projectItem.name) {
          return String(clip.projectItem.name);
        }
      } catch (errProjectItemName) {
      }
      return null;
    }

    function clipSource(clip) {
      var inTicks = null;
      var outTicks = null;
      try {
        if (clip && clip.inPoint !== undefined && clip.inPoint !== null) {
          inTicks = PremiereBridge._timeToTicks(clip.inPoint);
        }
      } catch (errInPoint) {
      }
      try {
        if (clip && clip.outPoint !== undefined && clip.outPoint !== null) {
          outTicks = PremiereBridge._timeToTicks(clip.outPoint);
        }
      } catch (errOutPoint) {
      }
      return {
        inPoint: summarizeTicks(inTicks),
        outPoint: summarizeTicks(outTicks)
      };
    }

    function collectTracks(kind, trackCollection) {
      var tracks = [];
      var trackCount = PremiereBridge._collectionCount(trackCollection, 64);
      for (var t = 0; t < trackCount; t++) {
        var track = null;
        try {
          track = trackCollection[t];
        } catch (errTrackGet) {
        }
        if (!track) {
          continue;
        }

        var clips = [];
        var clipCollection = track.clips;
        var clipCount = PremiereBridge._collectionCount(clipCollection, 512);
        for (var c = 0; c < clipCount; c++) {
          var clip = null;
          try {
            clip = clipCollection[c];
          } catch (errClipGet) {
          }
          if (!clip) {
            continue;
          }

          var startTicksValue = PremiereBridge._timeToTicks(clip.start);
          var endTicksValue = PremiereBridge._timeToTicks(clip.end);
          var durationTicks = null;
          if (startTicksValue !== null && endTicksValue !== null) {
            durationTicks = Math.max(0, Math.round(endTicksValue - startTicksValue));
          }

          clips.push({
            kind: kind,
            trackIndex: t,
            clipIndex: c,
            name: clipName(clip),
            nodeId: clip && clip.nodeId ? String(clip.nodeId) : null,
            start: summarizeTicks(startTicksValue),
            end: summarizeTicks(endTicksValue),
            duration: summarizeTicks(durationTicks),
            source: clipSource(clip)
          });
        }

        tracks.push({
          kind: kind,
          trackIndex: t,
          name: track.name ? String(track.name) : null,
          clipCount: clips.length,
          clips: clips
        });
      }
      return tracks;
    }

    var videoTracks = collectTracks("video", sequence.videoTracks);
    var audioTracks = collectTracks("audio", sequence.audioTracks);

    return PremiereBridge._ok({
      sequence: {
        name: sequence.name ? String(sequence.name) : null,
        id: sequence.sequenceID ? String(sequence.sequenceID) : null,
        timebase: timebase ? String(timebase) : sequence.timebase ? String(sequence.timebase) : null,
        nominalFps: nominalFps,
        dropFrame: dropFrame,
        start: summarizeTicks(startTicks),
        startTimecode: startTimecode,
        settings: settings,
        settingsError: settingsError
      },
      tracks: {
        video: videoTracks,
        audio: audioTracks
      }
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.razorAtTimecode = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var sequence = app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }

    var ticksValue = null;
    var source = null;
    if (payload.ticks !== undefined && payload.ticks !== null) {
      var rawTicks = Number(payload.ticks);
      if (!isNaN(rawTicks)) {
        ticksValue = rawTicks;
        source = "ticks";
      }
    }
    if (ticksValue === null && payload.timecode !== undefined && payload.timecode !== null) {
      var ticksFromTimecode = PremiereBridge._timecodeToTicks(String(payload.timecode));
      if (ticksFromTimecode !== null && ticksFromTimecode !== undefined && !isNaN(Number(ticksFromTimecode))) {
        ticksValue = Number(ticksFromTimecode);
        source = "timecode";
      }
    }
    if (ticksValue === null && payload.seconds !== undefined && payload.seconds !== null) {
      var secondsValue = Number(payload.seconds);
      if (!isNaN(secondsValue)) {
        ticksValue = Number(PremiereBridge._secondsToTicks(secondsValue));
        source = "seconds";
      }
    }

    if (ticksValue === null) {
      return PremiereBridge._err("Provide timecode, seconds, or ticks");
    }

    ticksValue = Math.round(Number(ticksValue));
    if (isNaN(ticksValue)) {
      return PremiereBridge._err("Failed to compute ticks", { payload: payload });
    }

    var ticksString = String(ticksValue);
    var secondsValue = ticksValue / PremiereBridge.TICKS_PER_SECOND;
    var errors = [];
    var playheadMethod = null;

    var qeSeq = PremiereBridge._getQeSequence();
    if (qeSeq && qeSeq.setPlayerPosition) {
      try {
        qeSeq.setPlayerPosition(ticksString);
        playheadMethod = "qe.setPlayerPosition(string)";
      } catch (errQeString) {
        try {
          qeSeq.setPlayerPosition(ticksValue);
          playheadMethod = "qe.setPlayerPosition(number)";
        } catch (errQeNumber) {
          errors.push("setPlayerPosition (QE): " + String(errQeNumber || errQeString));
        }
      }
    }
    if (!playheadMethod && sequence.setPlayerPosition) {
      try {
        sequence.setPlayerPosition(ticksString);
        playheadMethod = "dom.setPlayerPosition(string)";
      } catch (errDomString) {
        try {
          sequence.setPlayerPosition(ticksValue);
          playheadMethod = "dom.setPlayerPosition(number)";
        } catch (errDomNumber) {
          try {
            var playheadTime = new Time();
            playheadTime.ticks = ticksString;
            sequence.setPlayerPosition(playheadTime);
            playheadMethod = "dom.setPlayerPosition(Time)";
          } catch (errDomTime) {
            errors.push("setPlayerPosition (DOM): " + String(errDomTime || errDomNumber || errDomString));
          }
        }
      }
    }

    function getTrackCount(collection) {
      if (!collection) {
        return 0;
      }
      if (collection.numTracks !== undefined && collection.numTracks !== null) {
        var n = Number(collection.numTracks);
        if (!isNaN(n) && n > 0) {
          return n;
        }
      }
      if (collection.length !== undefined && collection.length !== null) {
        var len = Number(collection.length);
        if (!isNaN(len) && len > 0) {
          return len;
        }
      }
      var count = 0;
      for (var i = 0; i < 64; i++) {
        if (collection[i]) {
          count = i + 1;
        }
      }
      return count;
    }

    var videoCount = getTrackCount(sequence.videoTracks);
    var audioCount = getTrackCount(sequence.audioTracks);

    var resolvedTimecode = payload.timecode ? String(payload.timecode) : null;
    if (!resolvedTimecode && qeSeq && qeSeq.ticksToTimecode) {
      try {
        resolvedTimecode = qeSeq.ticksToTimecode(ticksString);
      } catch (errTicksToTc) {
      }
    }
    var normalizedTimecode = resolvedTimecode ? String(resolvedTimecode).replace(/;/g, ":") : null;

    function firstTrack(kind) {
      if (!qeSeq) {
        return null;
      }
      try {
        if (kind === "video" && qeSeq.getVideoTrackAt && videoCount > 0) {
          return qeSeq.getVideoTrackAt(0);
        }
        if (kind === "audio" && qeSeq.getAudioTrackAt && audioCount > 0) {
          return qeSeq.getAudioTrackAt(0);
        }
      } catch (errFirstTrack) {
      }
      return null;
    }

    function timeToTicks(value) {
      if (value === undefined || value === null) {
        return null;
      }
      try {
        if (value.ticks !== undefined && value.ticks !== null) {
          var ticksFromObj = Number(value.ticks);
          if (!isNaN(ticksFromObj)) {
            return ticksFromObj;
          }
        }
      } catch (errTicks) {
      }
      try {
        if (value.seconds !== undefined && value.seconds !== null) {
          var secondsFromObj = Number(value.seconds);
          if (!isNaN(secondsFromObj)) {
            return secondsFromObj * PremiereBridge.TICKS_PER_SECOND;
          }
        }
      } catch (errSeconds) {
      }
      var numeric = Number(value);
      if (!isNaN(numeric)) {
        return numeric;
      }
      return null;
    }

    function getDomTrack(collection, index) {
      if (!collection || index < 0) {
        return null;
      }
      try {
        if (collection[index]) {
          return collection[index];
        }
      } catch (errIndex) {
      }
      return null;
    }

    function getClipCount(track) {
      if (!track || !track.clips) {
        return 0;
      }
      var clips = track.clips;
      try {
        if (clips.numItems !== undefined && clips.numItems !== null) {
          var n = Number(clips.numItems);
          if (!isNaN(n)) {
            return n;
          }
        }
      } catch (errNumItems) {
      }
      try {
        if (clips.length !== undefined && clips.length !== null) {
          var len = Number(clips.length);
          if (!isNaN(len)) {
            return len;
          }
        }
      } catch (errLength) {
      }
      var count = 0;
      for (var i = 0; i < 256; i++) {
        try {
          if (clips[i]) {
            count = i + 1;
          }
        } catch (errIndex) {
          break;
        }
      }
      return count;
    }

    function trackSpansCut(track, cutTicks) {
      if (!track || !track.clips) {
        return false;
      }
      var clips = track.clips;
      for (var i = 0; i < 256; i++) {
        var clip = null;
        try {
          clip = clips[i];
        } catch (errClip) {
          break;
        }
        if (!clip) {
          continue;
        }
        var startTicks = timeToTicks(clip.start);
        var endTicks = timeToTicks(clip.end);
        if (startTicks !== null && endTicks !== null && startTicks < cutTicks && endTicks > cutTicks) {
          return true;
        }
      }
      return false;
    }

    function trackDiagnostics(kind, collection, count, fallbackGetterName) {
      var diag = {
        kind: kind,
        count: count,
        totalClips: 0,
        spanningCount: 0,
        tracks: []
      };
      if (count <= 0) {
        return diag;
      }
      for (var i = 0; i < count; i++) {
        var track = null;
        var sourceUsed = "dom";
        try {
          track = getDomTrack(collection, i);
        } catch (errDomTrack) {
        }
        if (!track && qeSeq && fallbackGetterName && qeSeq[fallbackGetterName]) {
          sourceUsed = "qe";
          try {
            track = qeSeq[fallbackGetterName](i);
          } catch (errQeTrack) {
            diag.tracks.push({ index: i, error: String(errQeTrack), source: sourceUsed });
            continue;
          }
        }
        if (!track) {
          diag.tracks.push({ index: i, missing: true, source: sourceUsed });
          continue;
        }
        var clipCount = getClipCount(track);
        var spans = trackSpansCut(track, ticksValue);
        diag.totalClips += clipCount;
        if (spans) {
          diag.spanningCount++;
        }
        diag.tracks.push({
          index: i,
          clips: clipCount,
          spansCut: spans,
          source: sourceUsed
        });
      }
      return diag;
    }

    function totalClips(diag) {
      if (!diag) {
        return 0;
      }
      var total = Number(diag.totalClips);
      if (!isNaN(total)) {
        return total;
      }
      var sum = 0;
      if (diag.tracks && diag.tracks.length) {
        for (var i = 0; i < diag.tracks.length; i++) {
          var entry = diag.tracks[i];
          if (!entry) {
            continue;
          }
          var c = Number(entry.clips);
          if (!isNaN(c)) {
            sum += c;
          }
        }
      }
      return sum;
    }

    var beforeDiag = {
      video: trackDiagnostics("video", sequence.videoTracks, videoCount, "getVideoTrackAt"),
      audio: trackDiagnostics("audio", sequence.audioTracks, audioCount, "getAudioTrackAt")
    };
    var beforeTotalClips = totalClips(beforeDiag.video) + totalClips(beforeDiag.audio);

    var firstVideoTrack = firstTrack("video");
    var firstAudioTrack = firstTrack("audio");

    var availability = {
      qeSequenceAddEdit: !!(qeSeq && qeSeq.addEdit),
      qeSequenceRazor: !!(qeSeq && qeSeq.razor),
      qeGetVideoTrackAt: !!(qeSeq && qeSeq.getVideoTrackAt),
      qeGetAudioTrackAt: !!(qeSeq && qeSeq.getAudioTrackAt),
      qeTrackRazor: !!(
        (firstVideoTrack && firstVideoTrack.razor) || (firstAudioTrack && firstAudioTrack.razor)
      ),
      qeTrackAddEdit: !!(
        (firstVideoTrack && firstVideoTrack.addEdit) || (firstAudioTrack && firstAudioTrack.addEdit)
      ),
      appExecuteCommand: !!(app && app.executeCommand)
    };

    var cutUnit = payload.unit ? String(payload.unit).toLowerCase() : "ticks";
    function unitArgument(unit) {
      if (unit === "playhead") {
        return { unit: "playhead", value: null };
      }
      if (unit === "seconds") {
        return { unit: "seconds", value: secondsValue };
      }
      if (unit === "timecode") {
        if (!normalizedTimecode) {
          return null;
        }
        return { unit: "timecode", value: normalizedTimecode };
      }
      if (unit === "ticks-number") {
        return { unit: "ticks-number", value: ticksValue };
      }
      return { unit: "ticks", value: ticksString };
    }

    var unitArg = unitArgument(cutUnit);
    if (!unitArg) {
      return PremiereBridge._err("Timecode unit requested but no timecode available", {
        ticks: ticksString,
        unit: cutUnit,
        available: availability
      });
    }

    var cutMethod = null;
    var cutDetails = {
      unit: unitArg.unit
    };

    function callCut(target, methodName, label) {
      if (!target || !target[methodName]) {
        return { ok: false, error: label + " unavailable" };
      }
      try {
        if (unitArg.value === null) {
          target[methodName]();
        } else {
          target[methodName](unitArg.value);
        }
        return { ok: true, method: label + "(" + unitArg.unit + ")" };
      } catch (errCall) {
        return { ok: false, error: label + ": " + String(errCall) };
      }
    }

    function beforeEntry(diag, index) {
      if (!diag || !diag.tracks || !diag.tracks.length) {
        return null;
      }
      for (var i = 0; i < diag.tracks.length; i++) {
        if (diag.tracks[i] && diag.tracks[i].index === index) {
          return diag.tracks[i];
        }
      }
      return null;
    }

    function razorTracks(kind, count, getterName, diagBefore) {
      var result = {
        kind: kind,
        count: count,
        attempted: 0,
        called: 0,
        detected: 0,
        spanningCount: diagBefore ? diagBefore.spanningCount : 0,
        methods: [],
        errors: [],
        tracks: []
      };

      if (!qeSeq || !qeSeq[getterName] || count <= 0) {
        return result;
      }

      for (var i = 0; i < count; i++) {
        var track = null;
        try {
          track = qeSeq[getterName](i);
        } catch (errTrack) {
          result.errors.push(kind + "[" + i + "] get: " + String(errTrack));
        }
        if (!track) {
          result.tracks.push({ index: i, missing: true });
          continue;
        }

        result.attempted++;

        var domCollection = kind === "video" ? sequence.videoTracks : sequence.audioTracks;
        var domTrack = getDomTrack(domCollection, i);
        var diagEntry = beforeEntry(diagBefore, i);
        var beforeCount = diagEntry && diagEntry.clips !== undefined ? Number(diagEntry.clips) : getClipCount(domTrack || track);
        if (isNaN(beforeCount)) {
          beforeCount = getClipCount(domTrack || track);
        }
        var spansCut = diagEntry && diagEntry.spansCut !== undefined ? !!diagEntry.spansCut : trackSpansCut(domTrack || track, ticksValue);

        var cutCall = callCut(track, "razor", kind + "[" + i + "].razor");
        if (!cutCall.ok) {
          cutCall = callCut(track, "addEdit", kind + "[" + i + "].addEdit");
        }
        if (cutCall.ok) {
          result.called++;
          result.methods.push(cutCall.method);
        } else if (cutCall.error) {
          result.errors.push(cutCall.error);
        }

        var afterDomTrack = getDomTrack(domCollection, i);
        var afterCount = getClipCount(afterDomTrack || track);
        var detected = afterCount > beforeCount;
        if (detected) {
          result.detected++;
        }

        result.tracks.push({
          index: i,
          beforeClips: beforeCount,
          afterClips: afterCount,
          spansCut: spansCut,
          cutDetected: detected
        });
      }

      return result;
    }

    var videoResult = razorTracks("video", videoCount, "getVideoTrackAt", beforeDiag.video);
    var audioResult = razorTracks("audio", audioCount, "getAudioTrackAt", beforeDiag.audio);
    var trackCalls = videoResult.called + audioResult.called;
    var trackDetections = videoResult.detected + audioResult.detected;
    var spansEligible = beforeDiag.video.spanningCount + beforeDiag.audio.spanningCount;

    if (trackCalls > 0) {
      cutMethod = "qe.track.razor/addEdit";
      cutDetails.video = videoResult;
      cutDetails.audio = audioResult;
    }

    if (!cutMethod && qeSeq && qeSeq.addEdit) {
      var seqAddEdit = callCut(qeSeq, "addEdit", "qe.addEdit");
      if (seqAddEdit.ok) {
        cutMethod = "qe.addEdit";
        cutDetails.sequence = seqAddEdit.method;
      } else if (seqAddEdit.error) {
        errors.push(seqAddEdit.error);
      }
    }

    if (!cutMethod && qeSeq && qeSeq.razor) {
      var seqRazor = callCut(qeSeq, "razor", "qe.razor");
      if (seqRazor.ok) {
        cutMethod = "qe.razor";
        cutDetails.sequence = seqRazor.method;
      } else if (seqRazor.error) {
        errors.push(seqRazor.error);
      }
    }

    if (!cutMethod && payload.commandId !== undefined && payload.commandId !== null && app.executeCommand) {
      var commandId = Number(payload.commandId);
      if (!isNaN(commandId)) {
        try {
          app.executeCommand(commandId);
          cutMethod = "app.executeCommand(" + commandId + ")";
          cutDetails.sequence = "app.executeCommand(" + commandId + ")";
        } catch (errExec) {
          errors.push("app.executeCommand: " + String(errExec));
        }
      }
    }

    var afterDiag = {
      video: trackDiagnostics("video", sequence.videoTracks, videoCount, "getVideoTrackAt"),
      audio: trackDiagnostics("audio", sequence.audioTracks, audioCount, "getAudioTrackAt")
    };
    var afterTotalClips = totalClips(afterDiag.video) + totalClips(afterDiag.audio);
    var clipDelta = afterTotalClips - beforeTotalClips;

    var evidenceOfCut = clipDelta > 0 || trackDetections > 0;

    if (!cutMethod) {
      return PremiereBridge._err("Unable to razor at timecode", {
        ticks: ticksString,
        timecode: resolvedTimecode,
        source: source,
        unit: unitArg.unit,
        playheadMethod: playheadMethod,
        available: availability,
        diagnostics: {
          before: beforeDiag,
          after: afterDiag,
          clipDelta: clipDelta,
          spansEligible: spansEligible,
          trackCalls: trackCalls,
          trackDetections: trackDetections
        },
        errors: errors
      });
    }

    var partial = spansEligible > 0 && trackDetections > 0 && trackDetections < spansEligible;
    var detectionConfidence = "none";
    if (trackDetections > 0 && spansEligible > 0) {
      detectionConfidence = "medium";
    } else if (trackDetections > 0 || spansEligible > 0 || beforeTotalClips > 0) {
      detectionConfidence = "low";
    }

    return PremiereBridge._ok({
      ticks: ticksString,
      timecode: resolvedTimecode,
      source: source,
      unit: unitArg.unit,
      playheadMethod: playheadMethod,
      cutMethod: cutMethod,
      cutDetails: cutDetails,
      partial: partial,
      detectionConfidence: detectionConfidence,
      detectionEvidence: evidenceOfCut,
      trackCounts: {
        video: videoCount,
        audio: audioCount
      },
      diagnostics: {
        before: beforeDiag,
        after: afterDiag,
        clipDelta: clipDelta,
        spansEligible: spansEligible,
        trackCalls: trackCalls,
        trackDetections: trackDetections
      },
      available: availability,
      errors: errors
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

PremiereBridge._sequenceList = function () {
  var list = [];
  try {
    if (!app || !app.project || !app.project.sequences) {
      return list;
    }
    var activeSeq = app.project.activeSequence;
    var activeId = null;
    var activeName = activeSeq && activeSeq.name ? String(activeSeq.name) : null;
    try {
      if (activeSeq && activeSeq.sequenceID !== undefined && activeSeq.sequenceID !== null) {
        activeId = String(activeSeq.sequenceID);
      } else if (activeSeq && activeSeq.id !== undefined && activeSeq.id !== null) {
        activeId = String(activeSeq.id);
      }
    } catch (errActiveId) {
    }
    var sequences = app.project.sequences;
    var count = 0;
    if (sequences.numSequences !== undefined && sequences.numSequences !== null) {
      count = Number(sequences.numSequences);
    } else if (sequences.numItems !== undefined && sequences.numItems !== null) {
      count = Number(sequences.numItems);
    } else if (sequences.length !== undefined && sequences.length !== null) {
      count = Number(sequences.length);
    }
    if (isNaN(count) || count < 0) {
      count = 0;
    }
    for (var i = 0; i < count; i++) {
      var seq = sequences[i];
      if (!seq) {
        continue;
      }
      var seqId = null;
      try {
        if (seq.sequenceID !== undefined && seq.sequenceID !== null) {
          seqId = String(seq.sequenceID);
        } else if (seq.id !== undefined && seq.id !== null) {
          seqId = String(seq.id);
        }
      } catch (errId) {
      }
      var projectItemRef = null;
      try {
        if (seq.projectItem) {
          projectItemRef = seq.projectItem;
        }
      } catch (errProjectItem) {
      }
      var isActive = false;
      try {
        if (activeSeq && seq === activeSeq) {
          isActive = true;
        } else if (activeId && seqId && String(seqId) === String(activeId)) {
          isActive = true;
        } else if (activeName && seq.name && String(seq.name) === String(activeName)) {
          isActive = true;
        }
      } catch (errActive) {
      }
      list.push({
        index: i,
        name: seq.name ? String(seq.name) : null,
        id: seqId,
        active: isActive,
        projectItemRef: projectItemRef,
        ref: seq
      });
    }
  } catch (err) {
  }
  return list;
};

PremiereBridge._collectSequenceBinPaths = function (seqInfos) {
  try {
    if (!seqInfos || !seqInfos.length || !app || !app.project || !app.project.rootItem) {
      return;
    }

    function visitItem(item, pathParts) {
      if (!item) {
        return;
      }
      for (var s = 0; s < seqInfos.length; s++) {
        var seqInfo = seqInfos[s];
        if (!seqInfo || !seqInfo.projectItemRef || seqInfo.binPath) {
          continue;
        }
        if (seqInfo.projectItemRef === item) {
          seqInfo.binPath = pathParts.length ? pathParts.join("/") : "";
        }
      }
    }

    function walk(container, pathParts) {
      if (!container || !container.children) {
        return;
      }
      var children = container.children;
      var numChildren = 0;
      if (children.numItems !== undefined && children.numItems !== null) {
        numChildren = Number(children.numItems);
      } else if (children.length !== undefined && children.length !== null) {
        numChildren = Number(children.length);
      }
      if (isNaN(numChildren) || numChildren <= 0) {
        return;
      }
      for (var i = 0; i < numChildren; i++) {
        var child = children[i];
        if (!child) {
          continue;
        }

        visitItem(child, pathParts);

        var nextPathParts = pathParts;
        try {
          if (child.children && child.children.numItems && Number(child.children.numItems) > 0) {
            var childName = child.name ? String(child.name) : null;
            if (childName) {
              nextPathParts = pathParts.concat([childName]);
            }
            walk(child, nextPathParts);
          }
        } catch (errChildWalk) {
        }
      }
    }

    walk(app.project.rootItem, []);
  } catch (err) {
  }
};

PremiereBridge._sequenceKey = function (seqInfo) {
  if (!seqInfo) {
    return null;
  }
  if (seqInfo.id) {
    return "id:" + String(seqInfo.id);
  }
  if (seqInfo.name) {
    return "name:" + String(seqInfo.name);
  }
  return null;
};

PremiereBridge.listSequences = function (jsonStr) {
  try {
    var project = app.project;
    if (!project) {
      return PremiereBridge._err("No project loaded");
    }

    var seqInfos = PremiereBridge._sequenceList();
    PremiereBridge._collectSequenceBinPaths(seqInfos);

    var active = project.activeSequence;
    var activeName = active && active.name ? String(active.name) : null;
    var activeId = null;
    try {
      if (active && active.sequenceID !== undefined && active.sequenceID !== null) {
        activeId = String(active.sequenceID);
      }
    } catch (errActiveId) {
    }

    var sequences = [];
    for (var i = 0; i < seqInfos.length; i++) {
      var seqInfo = seqInfos[i];
      sequences.push({
        index: seqInfo.index,
        name: seqInfo.name,
        id: seqInfo.id,
        active: !!seqInfo.active,
        binPath: seqInfo.binPath || ""
      });
    }

    return PremiereBridge._ok({
      active: {
        name: activeName,
        id: activeId
      },
      sequences: sequences
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge._uniqueSequenceName = function (baseName, existingNames) {
  var base = String(baseName || "Sequence Copy");
  var taken = {};
  for (var i = 0; existingNames && i < existingNames.length; i++) {
    if (existingNames[i]) {
      taken[String(existingNames[i])] = true;
    }
  }
  if (!taken[base]) {
    return base;
  }
  for (var n = 2; n < 500; n++) {
    var candidate = base + " " + n;
    if (!taken[candidate]) {
      return candidate;
    }
  }
  return base + " Copy";
};

PremiereBridge._diffNewSequences = function (beforeList, afterList) {
  var beforeKeys = {};
  var beforeNameCounts = {};
  for (var i = 0; beforeList && i < beforeList.length; i++) {
    var beforeKey = PremiereBridge._sequenceKey(beforeList[i]);
    if (beforeKey) {
      beforeKeys[beforeKey] = true;
    }
    if (beforeList[i] && beforeList[i].name) {
      var bn = String(beforeList[i].name);
      beforeNameCounts[bn] = (beforeNameCounts[bn] || 0) + 1;
    }
  }

  var newItems = [];
  for (var j = 0; afterList && j < afterList.length; j++) {
    var afterKey = PremiereBridge._sequenceKey(afterList[j]);
    if (afterKey && !beforeKeys[afterKey]) {
      newItems.push(afterList[j]);
      continue;
    }
    if (afterList[j] && afterList[j].name) {
      var an = String(afterList[j].name);
      var beforeCount = beforeNameCounts[an] || 0;
      if (beforeCount <= 0) {
        newItems.push(afterList[j]);
      } else {
        beforeNameCounts[an] = beforeCount - 1;
      }
    }
  }
  return newItems;
};

PremiereBridge._findQeSequenceByName = function (name) {
  try {
    if (!app || !app.enableQE) {
      return null;
    }
    app.enableQE();
    if (!qe || !qe.project || !qe.project.getSequenceAt) {
      return null;
    }
    var total = 0;
    if (qe.project.numSequences !== undefined && qe.project.numSequences !== null) {
      total = Number(qe.project.numSequences);
    }
    if (isNaN(total) || total <= 0) {
      return null;
    }
    for (var i = 0; i < total; i++) {
      var qeSeq = qe.project.getSequenceAt(i);
      if (!qeSeq) {
        continue;
      }
      if (qeSeq.name && String(qeSeq.name) === String(name)) {
        return qeSeq;
      }
    }
  } catch (err) {
  }
  return null;
};

PremiereBridge._findQeSequenceById = function (id) {
  try {
    if (!id || !app || !app.enableQE) {
      return null;
    }
    app.enableQE();
    if (!qe || !qe.project || !qe.project.getSequenceAt) {
      return null;
    }
    var total = 0;
    if (qe.project.numSequences !== undefined && qe.project.numSequences !== null) {
      total = Number(qe.project.numSequences);
    }
    if (isNaN(total) || total <= 0) {
      return null;
    }
    var targetId = String(id);
    for (var i = 0; i < total; i++) {
      var qeSeq = qe.project.getSequenceAt(i);
      if (!qeSeq) {
        continue;
      }
      try {
        if (qeSeq.sequenceID !== undefined && qeSeq.sequenceID !== null && String(qeSeq.sequenceID) === targetId) {
          return qeSeq;
        }
      } catch (errSeqId) {
      }
      try {
        if (qeSeq.id !== undefined && qeSeq.id !== null && String(qeSeq.id) === targetId) {
          return qeSeq;
        }
      } catch (errId) {
      }
    }
  } catch (err) {
  }
  return null;
};

PremiereBridge._activateSequence = function (seq, qeSeq, project, errors) {
  var proj = project || (app && app.project ? app.project : null);
  try {
    if (proj && proj.openSequence && seq) {
      if (seq.sequenceID !== undefined && seq.sequenceID !== null) {
        proj.openSequence(String(seq.sequenceID));
        return "project.openSequence(sequenceID)";
      }
      if (seq.id !== undefined && seq.id !== null) {
        proj.openSequence(String(seq.id));
        return "project.openSequence(id)";
      }
    }
  } catch (errProjectOpen) {
    if (errors) {
      errors.push("project.openSequence: " + String(errProjectOpen));
    }
  }
  try {
    if (seq && seq.projectItem && seq.projectItem.openInTimeline) {
      seq.projectItem.openInTimeline();
      return "projectItem.openInTimeline";
    }
  } catch (errDomOpen) {
    if (errors) {
      errors.push("projectItem.openInTimeline: " + String(errDomOpen));
    }
  }
  try {
    if (seq && seq.projectItem && seq.projectItem.setSelected) {
      seq.projectItem.setSelected(1, 1);
    }
  } catch (errSelect) {
    if (errors) {
      errors.push("projectItem.setSelected: " + String(errSelect));
    }
  }
  try {
    if (!qeSeq && seq && seq.name) {
      qeSeq = PremiereBridge._findQeSequenceByName(seq.name);
    }
    if (qeSeq && qeSeq.openInTimeline) {
      qeSeq.openInTimeline();
      return "qe.openInTimeline";
    }
  } catch (errQeOpen) {
    if (errors) {
      errors.push("qe.openInTimeline: " + String(errQeOpen));
    }
  }
  try {
    if (qeSeq && qeSeq.setActive) {
      qeSeq.setActive();
      return "qe.setActive";
    }
  } catch (errQeActive) {
    if (errors) {
      errors.push("qe.setActive: " + String(errQeActive));
    }
  }
  try {
    if (proj && seq) {
      proj.activeSequence = seq;
      return "project.activeSequence=seq";
    }
  } catch (errAssign) {
    if (errors) {
      errors.push("project.activeSequence assignment: " + String(errAssign));
    }
  }
  return null;
};

PremiereBridge.openSequence = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var targetName = payload.name ? String(payload.name) : null;
    var targetId = payload.id ? String(payload.id) : null;
    if (!targetName && !targetId) {
      return PremiereBridge._err("Provide name or id");
    }

    var project = app.project;
    if (!project) {
      return PremiereBridge._err("No project loaded");
    }

    var seqInfos = PremiereBridge._sequenceList();
    PremiereBridge._collectSequenceBinPaths(seqInfos);

    function summarize(seqInfo) {
      return {
        index: seqInfo.index,
        name: seqInfo.name,
        id: seqInfo.id,
        binPath: seqInfo.binPath || ""
      };
    }

    var idMatches = [];
    var nameMatches = [];
    for (var i = 0; i < seqInfos.length; i++) {
      var info = seqInfos[i];
      if (!info) {
        continue;
      }
      if (targetId && info.id && String(info.id) === targetId) {
        idMatches.push(info);
      }
      if (targetName && info.name && String(info.name) === targetName) {
        nameMatches.push(info);
      }
    }

    var matches = targetId ? idMatches : nameMatches;
    if (targetId && matches.length === 0 && nameMatches.length > 0) {
      return PremiereBridge._err("Sequence id not found; name matches exist", {
        id: targetId,
        name: targetName,
        nameMatches: nameMatches.map(summarize)
      });
    }

    if (matches.length === 0) {
      return PremiereBridge._err("Sequence not found", {
        id: targetId,
        name: targetName,
        availableCount: seqInfos.length,
        availableSample: seqInfos.slice(0, 10).map(summarize)
      });
    }

    if (!targetId && matches.length > 1) {
      return PremiereBridge._err("Sequence name is ambiguous; provide id", {
        name: targetName,
        matches: matches.map(summarize)
      });
    }

    var chosen = matches[0];
    var seqRef = chosen.ref;
    if (!seqRef) {
      return PremiereBridge._err("Matched sequence has no reference", summarize(chosen));
    }

    function snapshotActive(seq) {
      if (!seq) {
        return { name: null, id: null };
      }
      var seqName = seq.name ? String(seq.name) : null;
      var seqId = null;
      try {
        if (seq.sequenceID !== undefined && seq.sequenceID !== null) {
          seqId = String(seq.sequenceID);
        } else if (seq.id !== undefined && seq.id !== null) {
          seqId = String(seq.id);
        }
      } catch (errSeqId) {
      }
      return { name: seqName, id: seqId };
    }

    var activeBefore = snapshotActive(project.activeSequence);
    var errors = [];

    var qeSeq = null;
    if (chosen.id) {
      qeSeq = PremiereBridge._findQeSequenceById(chosen.id);
    }
    if (!qeSeq && chosen.name) {
      qeSeq = PremiereBridge._findQeSequenceByName(chosen.name);
    }

    var availability = {
      projectOpenSequence: !!(project && project.openSequence),
      projectItemOpenInTimeline: !!(seqRef && seqRef.projectItem && seqRef.projectItem.openInTimeline),
      projectItemSetSelected: !!(seqRef && seqRef.projectItem && seqRef.projectItem.setSelected),
      qeOpenInTimeline: !!(qeSeq && qeSeq.openInTimeline),
      qeSetActive: !!(qeSeq && qeSeq.setActive)
    };

    var activateMethod = PremiereBridge._activateSequence(seqRef, qeSeq, project, errors);
    var activeAfter = snapshotActive(project.activeSequence);

    var activated = false;
    if (chosen.id && activeAfter.id && String(chosen.id) === String(activeAfter.id)) {
      activated = true;
    } else if (chosen.name && activeAfter.name && String(chosen.name) === String(activeAfter.name)) {
      activated = true;
    } else if (activateMethod) {
      activated = true;
    }

    return PremiereBridge._ok({
      sequence: summarize(chosen),
      activated: activated,
      methods: {
        activate: activateMethod
      },
      available: availability,
      errors: errors,
      activeBefore: activeBefore,
      activeAfter: activeAfter
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.duplicateSequence = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var project = app.project;
    if (!project) {
      return PremiereBridge._err("No project loaded");
    }

    var active = project.activeSequence;
    if (!active) {
      return PremiereBridge._err("No active sequence");
    }

    var beforeList = PremiereBridge._sequenceList();
    var existingNames = [];
    for (var i = 0; i < beforeList.length; i++) {
      if (beforeList[i] && beforeList[i].name) {
        existingNames.push(String(beforeList[i].name));
      }
    }

    var baseName = payload.name ? String(payload.name) : (String(active.name || "Sequence") + " Rough Cut");
    var desiredName = PremiereBridge._uniqueSequenceName(baseName, existingNames);

    var method = null;
    var errors = [];

    var qeSeq = PremiereBridge._getQeSequence();
    var duplicated = false;
    var explicitNewRef = null;

    var availability = {
      domClone: !!(active && active.clone),
      domDuplicate: !!(active && active.duplicate),
      projectItemDuplicate: !!(active && active.projectItem && active.projectItem.duplicate),
      projectItemClone: !!(active && active.projectItem && active.projectItem.clone),
      qeDuplicate: !!(qeSeq && qeSeq.duplicate),
      qeClone: !!(qeSeq && qeSeq.clone)
    };

    if (availability.domClone && !duplicated) {
      try {
        explicitNewRef = active.clone(desiredName);
        duplicated = true;
        method = "dom.clone(name)";
      } catch (errDomCloneNamed) {
        errors.push(String(errDomCloneNamed));
        try {
          explicitNewRef = active.clone();
          duplicated = true;
          method = "dom.clone()";
        } catch (errDomClonePlain) {
          errors.push(String(errDomClonePlain));
        }
      }
    }

    if (availability.domDuplicate && !duplicated) {
      try {
        explicitNewRef = active.duplicate(desiredName);
        duplicated = true;
        method = "dom.duplicate(name)";
      } catch (errDomDupNamed) {
        errors.push(String(errDomDupNamed));
        try {
          explicitNewRef = active.duplicate();
          duplicated = true;
          method = "dom.duplicate()";
        } catch (errDomDupPlain) {
          errors.push(String(errDomDupPlain));
        }
      }
    }

    if (availability.projectItemDuplicate && !duplicated) {
      try {
        explicitNewRef = active.projectItem.duplicate(desiredName);
        duplicated = true;
        method = "projectItem.duplicate(name)";
      } catch (errPiDupNamed) {
        errors.push(String(errPiDupNamed));
        try {
          explicitNewRef = active.projectItem.duplicate();
          duplicated = true;
          method = "projectItem.duplicate()";
        } catch (errPiDupPlain) {
          errors.push(String(errPiDupPlain));
        }
      }
    }

    if (availability.projectItemClone && !duplicated) {
      try {
        explicitNewRef = active.projectItem.clone(desiredName);
        duplicated = true;
        method = "projectItem.clone(name)";
      } catch (errPiCloneNamed) {
        errors.push(String(errPiCloneNamed));
        try {
          explicitNewRef = active.projectItem.clone();
          duplicated = true;
          method = "projectItem.clone()";
        } catch (errPiClonePlain) {
          errors.push(String(errPiClonePlain));
        }
      }
    }

    if (availability.qeDuplicate && !duplicated) {
      try {
        qeSeq.duplicate(desiredName);
        duplicated = true;
        method = "qe.duplicate(name)";
      } catch (errQeNamed) {
        errors.push(String(errQeNamed));
        try {
          qeSeq.duplicate();
          duplicated = true;
          method = "qe.duplicate()";
        } catch (errQePlain) {
          errors.push(String(errQePlain));
        }
      }
    }

    if (availability.qeClone && !duplicated) {
      try {
        qeSeq.clone(desiredName);
        duplicated = true;
        method = "qe.clone(name)";
      } catch (errQeCloneNamed) {
        errors.push(String(errQeCloneNamed));
        try {
          qeSeq.clone();
          duplicated = true;
          method = "qe.clone()";
        } catch (errQeClonePlain) {
          errors.push(String(errQeClonePlain));
        }
      }
    }

    if (!duplicated) {
      return PremiereBridge._err("Unable to duplicate active sequence", {
        errors: errors,
        available: availability
      });
    }

    var afterList = PremiereBridge._sequenceList();
    var newSeqInfo = null;

    if (explicitNewRef && afterList && afterList.length) {
      for (var k = 0; k < afterList.length; k++) {
        if (!afterList[k]) {
          continue;
        }
        if (afterList[k].ref === explicitNewRef) {
          newSeqInfo = afterList[k];
          break;
        }
        if (!newSeqInfo && explicitNewRef.name && afterList[k].name === String(explicitNewRef.name)) {
          newSeqInfo = afterList[k];
        }
      }
    }

    if (!newSeqInfo) {
      var newSequences = PremiereBridge._diffNewSequences(beforeList, afterList);
      newSeqInfo = newSequences.length ? newSequences[newSequences.length - 1] : null;
    }
    if (!newSeqInfo && afterList.length) {
      newSeqInfo = afterList[afterList.length - 1];
    }
    if (!newSeqInfo || !newSeqInfo.ref) {
      return PremiereBridge._err("Sequence duplicated but could not be located", {
        method: method,
        desiredName: desiredName,
        errors: errors,
        available: availability
      });
    }

    var seqRef = newSeqInfo.ref;
    var renamed = false;
    if (seqRef.name && String(seqRef.name) !== desiredName) {
      try {
        seqRef.name = desiredName;
        renamed = true;
      } catch (errRename) {
        errors.push(String(errRename));
      }
    }

    var qeNewSeq = PremiereBridge._findQeSequenceByName(seqRef.name || desiredName);
    var activateMethod = PremiereBridge._activateSequence(seqRef, qeNewSeq, project, errors);
    var activated = activateMethod ? true : false;

    var seqId = null;
    try {
      if (seqRef.sequenceID !== undefined && seqRef.sequenceID !== null) {
        seqId = String(seqRef.sequenceID);
      }
    } catch (errSeqId) {
    }

    return PremiereBridge._ok({
      name: seqRef.name ? String(seqRef.name) : desiredName,
      id: seqId,
      activated: activated,
      methods: {
        duplicate: method,
        activate: activateMethod
      },
      renamed: renamed,
      errors: errors
    });
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
