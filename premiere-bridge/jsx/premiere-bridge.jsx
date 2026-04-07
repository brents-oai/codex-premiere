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
  // Manual fallback when QE timecode conversion is unavailable.
  try {
    var seq = app.project.activeSequence;
    var timebase = PremiereBridge._getSequenceTimebase(seq);
    var nominalFps = PremiereBridge._getNominalFps(seq, timebase);
    var settings = null;
    try {
      if (seq && seq.getSettings) {
        settings = seq.getSettings();
      }
    } catch (errSettings) {
    }
    var tb = Number(timebase);
    var fps = Math.max(1, Math.round(Number(nominalFps)));
    if (!tb || !fps || isNaN(tb) || isNaN(fps) || tb <= 0 || fps <= 0) {
      return null;
    }
    var totalFrames = Math.max(0, Math.round(Number(ticks) / tb));
    var dropFrame = false;
    try {
      if (settings && settings.videoDisplayFormat !== undefined && settings.videoDisplayFormat !== null) {
        var format = Number(settings.videoDisplayFormat);
        dropFrame = format === 102 || format === 106 || format === 110;
      }
    } catch (errDropFrame) {
    }
    if (dropFrame) {
      var dropFrames = Math.round(fps * 0.066666);
      var framesPerHourDf = fps * 3600;
      var framesPer24Hours = framesPerHourDf * 24;
      var framesPer10Minutes = (fps * 600) - (dropFrames * 9);
      var framesPerMinute = (fps * 60) - dropFrames;
      totalFrames = totalFrames % framesPer24Hours;
      var d = Math.floor(totalFrames / framesPer10Minutes);
      var m = totalFrames % framesPer10Minutes;
      var extraMinutes = Math.floor(Math.max(0, m - dropFrames) / framesPerMinute);
      if (extraMinutes > 9) {
        extraMinutes = 9;
      }
      var totalMinutesDf = (d * 10) + extraMinutes;
      var droppedFrames = dropFrames * (totalMinutesDf - Math.floor(totalMinutesDf / 10));
      totalFrames += droppedFrames;
    }
    var framesPerHour = fps * 3600;
    var framesPerMinute = fps * 60;
    var hours = Math.floor(totalFrames / framesPerHour);
    totalFrames = totalFrames % framesPerHour;
    var minutes = Math.floor(totalFrames / framesPerMinute);
    totalFrames = totalFrames % framesPerMinute;
    var seconds = Math.floor(totalFrames / fps);
    var frames = totalFrames % fps;
    function pad2(n) {
      var v = Math.max(0, Math.floor(Number(n)));
      return (v < 10 ? "0" : "") + String(v);
    }
    var separator = dropFrame ? ";" : ":";
    return pad2(hours) + ":" + pad2(minutes) + ":" + pad2(seconds) + separator + pad2(frames);
  } catch (errFallback) {
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

PremiereBridge._frameToTicks = function (frameValue, sequence, qeSeq) {
  var frame = Number(frameValue);
  if (isNaN(frame)) {
    return null;
  }
  var timebase = PremiereBridge._getSequenceTimebase(sequence);
  if (!timebase) {
    return null;
  }
  var startTicks = PremiereBridge._sequenceStartTicks(sequence, qeSeq);
  return Math.round(Number(startTicks) + (Math.round(frame) * Number(timebase)));
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

PremiereBridge._readSequenceBoundaryTicks = function (sequence, qeSeq, prefix) {
  var cap = prefix === "out" ? "Out" : "In";
  var getterAsTime = "get" + cap + "PointAsTime";
  var getter = "get" + cap + "Point";
  var qeProperty = prefix + "Point";
  var methods = [];
  var errors = [];
  var ticks = null;

  try {
    if (sequence && sequence[getterAsTime]) {
      var timeValue = sequence[getterAsTime]();
      var ticksFromTime = PremiereBridge._timeToTicks(timeValue);
      if (ticksFromTime !== null && ticksFromTime !== undefined && !isNaN(Number(ticksFromTime))) {
        ticks = Number(ticksFromTime);
        methods.push("dom." + getterAsTime);
      }
    }
  } catch (errGetAsTime) {
    errors.push("dom." + getterAsTime + ": " + String(errGetAsTime));
  }

  try {
    if ((ticks === null || ticks === undefined || isNaN(Number(ticks))) && sequence && sequence[getter]) {
      var rawValue = sequence[getter]();
      var ticksFromRaw = PremiereBridge._timeToTicks(rawValue);
      if (ticksFromRaw !== null && ticksFromRaw !== undefined && !isNaN(Number(ticksFromRaw))) {
        ticks = Number(ticksFromRaw);
        methods.push("dom." + getter + "(time)");
      } else {
        var secondsValue = Number(rawValue);
        if (!isNaN(secondsValue)) {
          ticks = Number(PremiereBridge._secondsToTicks(secondsValue));
          methods.push("dom." + getter + "(seconds)");
        }
      }
    }
  } catch (errGet) {
    errors.push("dom." + getter + ": " + String(errGet));
  }

  try {
    if ((ticks === null || ticks === undefined || isNaN(Number(ticks))) && qeSeq && qeSeq[qeProperty] !== undefined && qeSeq[qeProperty] !== null) {
      var qeValue = qeSeq[qeProperty];
      if (typeof qeValue === "function") {
        qeValue = qeValue();
      }
      var ticksFromQe = PremiereBridge._timeToTicks(qeValue);
      if (ticksFromQe !== null && ticksFromQe !== undefined && !isNaN(Number(ticksFromQe))) {
        ticks = Number(ticksFromQe);
        methods.push("qe." + qeProperty);
      }
    }
  } catch (errQePoint) {
    errors.push("qe." + qeProperty + ": " + String(errQePoint));
  }

  if (ticks === null || ticks === undefined || isNaN(Number(ticks))) {
    return {
      ok: false,
      error: "Unable to read current " + prefix + " point",
      methods: methods,
      errors: errors,
      available: {
        domGetAsTime: !!(sequence && sequence[getterAsTime]),
        domGet: !!(sequence && sequence[getter]),
        qePoint: !!(qeSeq && qeSeq[qeProperty] !== undefined && qeSeq[qeProperty] !== null)
      }
    };
  }

  ticks = Math.round(Number(ticks));
  return {
    ok: true,
    ticks: ticks,
    timecode: PremiereBridge._ticksToTimecode(ticks),
    methods: methods,
    errors: errors,
    available: {
      domGetAsTime: !!(sequence && sequence[getterAsTime]),
      domGet: !!(sequence && sequence[getter]),
      qePoint: !!(qeSeq && qeSeq[qeProperty] !== undefined && qeSeq[qeProperty] !== null)
    }
  };
};

PremiereBridge._readSequenceInOutTicks = function (sequence, qeSeq) {
  var inResult = PremiereBridge._readSequenceBoundaryTicks(sequence, qeSeq, "in");
  var outResult = PremiereBridge._readSequenceBoundaryTicks(sequence, qeSeq, "out");
  if (!inResult.ok || !outResult.ok) {
    return {
      ok: false,
      error: "Failed to read current in/out points",
      inPoint: inResult,
      outPoint: outResult
    };
  }
  if (outResult.ticks < inResult.ticks) {
    return {
      ok: false,
      error: "Current out point is before current in point",
      inPoint: inResult,
      outPoint: outResult
    };
  }
  return {
    ok: true,
    inTicks: inResult.ticks,
    outTicks: outResult.ticks,
    inTimecode: inResult.timecode,
    outTimecode: outResult.timecode,
    inPoint: inResult,
    outPoint: outResult
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

  function setQePoint(target, setterName, ticksValue, timecodeValue, label) {
    if (!target || !target[setterName]) {
      return false;
    }
    var applied = false;
    var secondsValue = Number(ticksValue) / PremiereBridge.TICKS_PER_SECOND;
    var candidates = [];
    if (timecodeValue) {
      candidates.push({ value: String(timecodeValue), tag: "timecode" });
    }
    if (!isNaN(secondsValue)) {
      candidates.push({ value: secondsValue, tag: "seconds" });
    }
    // Avoid passing raw ticks to QE setInPoint/setOutPoint; units vary.
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      try {
        target[setterName](candidate.value);
        methods.push("qe." + setterName + "(" + candidate.tag + ")");
        applied = true;
        break;
      } catch (errCandidate) {
        errors.push(label + " (" + candidate.tag + "): " + String(errCandidate));
      }
    }
    return applied;
  }

  // Keep DOM and QE in/out points in sync; extract operations may consult QE.
  var domInApplied = setPoint(sequence, "setInPoint", inTicks, "DOM in", "dom.");
  var domOutApplied = setPoint(sequence, "setOutPoint", outTicks, "DOM out", "dom.");
  var qeInApplied = false;
  var qeOutApplied = false;
  var inTimecode = PremiereBridge._ticksToTimecode(inTicks);
  var outTimecode = PremiereBridge._ticksToTimecode(outTicks);
  if (qeSeq) {
    qeInApplied = setQePoint(qeSeq, "setInPoint", inTicks, inTimecode, "QE in");
    qeOutApplied = setQePoint(qeSeq, "setOutPoint", outTicks, outTimecode, "QE out");
  }

  var inApplied = domInApplied || qeInApplied;
  var outApplied = domOutApplied || qeOutApplied;

  return {
    ok: inApplied && outApplied,
    inApplied: inApplied,
    outApplied: outApplied,
    domInApplied: domInApplied,
    domOutApplied: domOutApplied,
    qeInApplied: qeInApplied,
    qeOutApplied: qeOutApplied,
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

PremiereBridge._toTime = function (marker, sequence, qeSeq) {
  if (!marker) {
    return null;
  }

  var t = new Time();
  function applyTicks(ticksValue) {
    if (ticksValue === null || ticksValue === undefined || isNaN(Number(ticksValue))) {
      return false;
    }
    var rounded = Math.round(Number(ticksValue));
    t.ticks = String(rounded);
    t.seconds = rounded / PremiereBridge.TICKS_PER_SECOND;
    return true;
  }

  function tryFrameKeys(keys) {
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (marker[key] === undefined || marker[key] === null) {
        continue;
      }
      var ticksFromFrame = PremiereBridge._frameToTicks(marker[key], sequence, qeSeq);
      if (applyTicks(ticksFromFrame)) {
        return true;
      }
    }
    return false;
  }

  if (marker.timecode !== undefined && marker.timecode !== null) {
    var ticksFromTimecode = PremiereBridge._timecodeToTicks(String(marker.timecode));
    if (applyTicks(ticksFromTimecode)) {
      return t;
    }
  }

  if (tryFrameKeys(["frame", "frameNumber", "frameIndex"])) {
    return t;
  }

  if (marker.timeSeconds !== undefined && marker.timeSeconds !== null) {
    var secondsValue = Number(marker.timeSeconds);
    if (!isNaN(secondsValue)) {
      applyTicks(PremiereBridge._secondsToTicks(secondsValue));
      return t;
    }
  }

  if (marker.time !== undefined && marker.time !== null) {
    var timeValue = Number(marker.time);
    if (!isNaN(timeValue)) {
      applyTicks(PremiereBridge._secondsToTicks(timeValue));
      return t;
    }
  }

  if (marker.timeTicks !== undefined && marker.timeTicks !== null) {
    var tickValue = Number(marker.timeTicks);
    if (applyTicks(tickValue)) {
      return t;
    }
  }

  return null;
};

PremiereBridge._markerPayloadToTicks = function (marker, sequence, qeSeq) {
  if (!marker) {
    return null;
  }

  if (marker.timeTicks !== undefined && marker.timeTicks !== null) {
    var tickValue = Number(marker.timeTicks);
    if (!isNaN(tickValue)) {
      return Math.round(tickValue);
    }
  }

  if (marker.timecode !== undefined && marker.timecode !== null) {
    var ticksFromTimecode = PremiereBridge._timecodeToTicks(String(marker.timecode));
    if (ticksFromTimecode !== null && ticksFromTimecode !== undefined && !isNaN(Number(ticksFromTimecode))) {
      return Math.round(Number(ticksFromTimecode));
    }
  }

  function tryFrameKeys(keys) {
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (marker[key] === undefined || marker[key] === null) {
        continue;
      }
      var ticksFromFrame = PremiereBridge._frameToTicks(marker[key], sequence, qeSeq);
      if (ticksFromFrame !== null && ticksFromFrame !== undefined && !isNaN(Number(ticksFromFrame))) {
        return Math.round(Number(ticksFromFrame));
      }
    }
    return null;
  }

  var frameTicks = tryFrameKeys(["frame", "frameNumber", "frameIndex"]);
  if (frameTicks !== null) {
    return frameTicks;
  }

  if (marker.timeSeconds !== undefined && marker.timeSeconds !== null) {
    var secondsValue = Number(marker.timeSeconds);
    if (!isNaN(secondsValue)) {
      return Math.round(PremiereBridge._secondsToTicks(secondsValue));
    }
  }

  if (marker.time !== undefined && marker.time !== null) {
    var timeValue = Number(marker.time);
    if (!isNaN(timeValue)) {
      return Math.round(PremiereBridge._secondsToTicks(timeValue));
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
  if (colorValue === null || colorValue === undefined) {
    return null;
  }
  var raw = colorValue;
  if (typeof raw === "string") {
    var trimmed = raw.replace(/^\s+|\s+$/g, "");
    var parsed = Number(trimmed);
    if (isNaN(parsed)) {
      return PremiereBridge._colorIndex(trimmed);
    }
    raw = parsed;
  }
  var value = Number(raw);
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
  if (map.hasOwnProperty(value)) {
    return map[value];
  }
  if (value >= 0 && value <= 7) {
    return Math.max(0, Math.min(7, Math.round(value)));
  }
  return null;
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

PremiereBridge._clampColorIndex = function (value) {
  var n = Number(value);
  if (isNaN(n)) {
    return null;
  }
  if (n < 0 || n > 7) {
    return null;
  }
  return Math.max(0, Math.min(7, Math.round(n)));
};

PremiereBridge._resolveColorIndex = function (markerData) {
  if (!markerData) {
    return { index: null, source: null };
  }

  if (markerData.colorIndex !== undefined && markerData.colorIndex !== null) {
    return {
      index: PremiereBridge._clampColorIndex(markerData.colorIndex),
      source: "colorIndex"
    };
  }

  if (markerData.colorValue !== undefined && markerData.colorValue !== null) {
    return {
      index: PremiereBridge._colorIndexFromValue(markerData.colorValue),
      source: "colorValue"
    };
  }

  if (markerData.color !== undefined && markerData.color !== null) {
    if (typeof markerData.color === "string") {
      var numeric = Number(markerData.color);
      if (!isNaN(numeric)) {
        return { index: PremiereBridge._clampColorIndex(numeric), source: "color" };
      }
      return { index: PremiereBridge._colorIndex(markerData.color), source: "color" };
    }
    return { index: PremiereBridge._clampColorIndex(markerData.color), source: "color" };
  }

  return { index: null, source: null };
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

PremiereBridge._markerName = function (marker) {
  if (!marker) {
    return "";
  }
  try {
    if (marker.name !== undefined && marker.name !== null) {
      return String(marker.name);
    }
  } catch (errName) {
  }
  return "";
};

PremiereBridge._markerComment = function (marker) {
  if (!marker) {
    return "";
  }
  try {
    if (marker.comments !== undefined && marker.comments !== null) {
      return String(marker.comments);
    }
  } catch (errComments) {
  }
  try {
    if (marker.comment !== undefined && marker.comment !== null) {
      return String(marker.comment);
    }
  } catch (errComment) {
  }
  return "";
};

PremiereBridge._markerStartTicks = function (marker) {
  if (!marker) {
    return null;
  }
  try {
    return PremiereBridge._timeToTicks(marker.start);
  } catch (errStart) {
  }
  return null;
};

PremiereBridge._markerEndTicks = function (marker, startTicks) {
  var fallback = startTicks !== null && startTicks !== undefined ? Number(startTicks) : null;
  if (!marker) {
    return fallback;
  }
  var endTicks = null;
  try {
    endTicks = PremiereBridge._timeToTicks(marker.end);
  } catch (errEnd) {
  }
  if (endTicks === null || endTicks === undefined || isNaN(Number(endTicks))) {
    return fallback;
  }
  endTicks = Number(endTicks);
  if (fallback !== null && !isNaN(fallback) && endTicks < fallback) {
    return fallback;
  }
  return endTicks;
};

PremiereBridge._markerSummary = function (marker) {
  var startTicks = PremiereBridge._markerStartTicks(marker);
  var endTicks = PremiereBridge._markerEndTicks(marker, startTicks);
  var durationTicks = null;
  if (startTicks !== null && endTicks !== null) {
    durationTicks = Math.max(0, Math.round(Number(endTicks) - Number(startTicks)));
  }
  return {
    guid: marker && marker.guid ? String(marker.guid) : null,
    type: marker && marker.type ? String(marker.type) : null,
    name: PremiereBridge._markerName(marker),
    comment: PremiereBridge._markerComment(marker),
    startTicks: startTicks !== null ? String(Math.round(Number(startTicks))) : null,
    startTimecode: startTicks !== null ? PremiereBridge._ticksToTimecode(startTicks) : null,
    endTicks: endTicks !== null ? String(Math.round(Number(endTicks))) : null,
    durationTicks: durationTicks !== null ? String(durationTicks) : null,
    durationSeconds: durationTicks !== null ? (durationTicks / PremiereBridge.TICKS_PER_SECOND) : null
  };
};

PremiereBridge._setMarkerName = function (marker, name) {
  var value = String(name);
  try {
    marker.name = value;
  } catch (errName) {
  }
  return PremiereBridge._markerName(marker) === value;
};

PremiereBridge._setMarkerComment = function (marker, comment) {
  var value = comment === undefined || comment === null ? "" : String(comment);
  try {
    if (marker.comments !== undefined) {
      marker.comments = value;
    } else if (marker.comment !== undefined) {
      marker.comment = value;
    }
  } catch (errComment) {
  }
  return PremiereBridge._markerComment(marker) === value;
};

PremiereBridge._setMarkerStart = function (marker, timeValue) {
  var targetTicks = PremiereBridge._timeToTicks(timeValue);
  if (targetTicks === null || targetTicks === undefined || isNaN(Number(targetTicks))) {
    return false;
  }
  var roundedTicks = Math.round(Number(targetTicks));
  var secondsValue = roundedTicks / PremiereBridge.TICKS_PER_SECOND;

  try {
    if (marker.start && marker.start.ticks !== undefined) {
      marker.start.ticks = String(roundedTicks);
    }
  } catch (errTicks) {
  }
  var actualStart = PremiereBridge._markerStartTicks(marker);
  if (actualStart !== null && !isNaN(Number(actualStart)) && Math.round(Number(actualStart)) === roundedTicks) {
    return true;
  }

  try {
    if (marker.start && marker.start.seconds !== undefined) {
      marker.start.seconds = secondsValue;
    }
  } catch (errSeconds) {
  }
  actualStart = PremiereBridge._markerStartTicks(marker);
  if (actualStart !== null && !isNaN(Number(actualStart)) && Math.round(Number(actualStart)) === roundedTicks) {
    return true;
  }

  try {
    marker.start = timeValue;
  } catch (errTime) {
  }
  actualStart = PremiereBridge._markerStartTicks(marker);
  if (actualStart !== null && !isNaN(Number(actualStart)) && Math.round(Number(actualStart)) === roundedTicks) {
    return true;
  }

  try {
    marker.start = secondsValue;
  } catch (errAssignSeconds) {
  }
  actualStart = PremiereBridge._markerStartTicks(marker);
  if (actualStart !== null && !isNaN(Number(actualStart)) && Math.round(Number(actualStart)) === roundedTicks) {
    return true;
  }

  try {
    marker.start = String(roundedTicks);
  } catch (errAssignTicks) {
  }
  actualStart = PremiereBridge._markerStartTicks(marker);
  return actualStart !== null && !isNaN(Number(actualStart)) && Math.round(Number(actualStart)) === roundedTicks;
};

PremiereBridge._setMarkerEndTicks = function (marker, endTicks) {
  if (!marker || endTicks === null || endTicks === undefined || isNaN(Number(endTicks))) {
    return false;
  }
  var roundedTicks = Math.round(Number(endTicks));
  var secondsValue = roundedTicks / PremiereBridge.TICKS_PER_SECOND;

  try {
    marker.end = secondsValue;
  } catch (errSeconds) {
  }
  var actualEnd = PremiereBridge._markerEndTicks(marker, null);
  if (actualEnd !== null && !isNaN(Number(actualEnd)) && Math.round(Number(actualEnd)) === roundedTicks) {
    return true;
  }

  try {
    if (marker.end && marker.end.seconds !== undefined) {
      marker.end.seconds = secondsValue;
    }
  } catch (errEndSeconds) {
  }
  actualEnd = PremiereBridge._markerEndTicks(marker, null);
  if (actualEnd !== null && !isNaN(Number(actualEnd)) && Math.round(Number(actualEnd)) === roundedTicks) {
    return true;
  }

  try {
    if (marker.end && marker.end.ticks !== undefined) {
      marker.end.ticks = String(roundedTicks);
    }
  } catch (errEndTicks) {
  }
  actualEnd = PremiereBridge._markerEndTicks(marker, null);
  return actualEnd !== null && !isNaN(Number(actualEnd)) && Math.round(Number(actualEnd)) === roundedTicks;
};

PremiereBridge._collectMarkerMatches = function (markerCollection, criteria) {
  var matches = [];
  if (!markerCollection) {
    return matches;
  }

  try {
    var current = markerCollection.getFirstMarker();
    while (current) {
      var ok = true;
      if (criteria.name !== null && criteria.name !== undefined) {
        ok = PremiereBridge._markerName(current) === criteria.name;
      }
      if (ok && criteria.timeTicks !== null && criteria.timeTicks !== undefined) {
        var currentTicks = PremiereBridge._markerStartTicks(current);
        ok = currentTicks !== null && Math.round(Number(currentTicks)) === Math.round(Number(criteria.timeTicks));
      }
      if (ok) {
        matches.push(current);
      }
      current = markerCollection.getNextMarker(current);
    }
  } catch (err) {
  }

  return matches;
};

PremiereBridge._collectMarkerRangeMatches = function (markerCollection, criteria) {
  var matches = [];
  if (!markerCollection) {
    return matches;
  }

  try {
    var current = markerCollection.getFirstMarker();
    while (current) {
      var ok = true;
      if (criteria.name !== null && criteria.name !== undefined) {
        ok = PremiereBridge._markerName(current) === criteria.name;
      }
      if (ok) {
        var currentTicks = PremiereBridge._markerStartTicks(current);
        if (currentTicks === null || isNaN(Number(currentTicks))) {
          ok = false;
        } else {
          currentTicks = Math.round(Number(currentTicks));
          ok = currentTicks >= criteria.inTicks && currentTicks <= criteria.outTicks;
        }
      }
      if (ok) {
        matches.push(current);
      }
      current = markerCollection.getNextMarker(current);
    }
  } catch (err) {
  }

  return matches;
};

PremiereBridge._deleteMarkerReference = function (markerCollection, marker) {
  if (!markerCollection || !marker) {
    return false;
  }
  try {
    var deleted = markerCollection.deleteMarker(marker);
    if (deleted === true || deleted === 1) {
      return true;
    }
  } catch (errDelete1) {
  }
  try {
    markerCollection.deleteMarker(marker);
    return true;
  } catch (errDelete2) {
  }
  return false;
};

PremiereBridge._collectAllMarkers = function (markerCollection) {
  var matches = [];
  if (!markerCollection) {
    return matches;
  }

  try {
    var current = markerCollection.getFirstMarker();
    while (current) {
      matches.push(current);
      current = markerCollection.getNextMarker(current);
    }
  } catch (err) {
  }

  return matches;
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

PremiereBridge.getPlayheadPosition = function () {
  try {
    var sequence = app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }

    var qeSeq = PremiereBridge._getQeSequence();
    var startTicks = PremiereBridge._sequenceStartTicks(sequence, qeSeq);
    var inPointTicks = null;
    var qeCtiTimecode = null;
    var errors = [];

    try {
      if (sequence.getInPointAsTime) {
        inPointTicks = PremiereBridge._timeToTicks(sequence.getInPointAsTime());
      } else if (sequence.getInPoint) {
        var inPointSeconds = Number(sequence.getInPoint());
        if (!isNaN(inPointSeconds)) {
          inPointTicks = Number(PremiereBridge._secondsToTicks(inPointSeconds));
        }
      }
    } catch (errInPoint) {
      errors.push("sequence.getInPoint: " + String(errInPoint));
    }

    try {
      if (qeSeq && qeSeq.CTI && qeSeq.CTI.timecode) {
        qeCtiTimecode = String(qeSeq.CTI.timecode);
      }
    } catch (errQeCtiTimecode) {
      errors.push("qe.CTI.timecode: " + String(errQeCtiTimecode));
    }

    function finalize(method, rawValue) {
      var rawTicksFromTicks = null;
      var rawTicksFromSeconds = null;
      var rawTicks = PremiereBridge._timeToTicks(rawValue);
      if (rawTicks === null || rawTicks === undefined || isNaN(Number(rawTicks))) {
        errors.push(method + " returned an unreadable position");
        return null;
      }
      try {
        if (rawValue && rawValue.ticks !== undefined && rawValue.ticks !== null) {
          rawTicksFromTicks = Number(rawValue.ticks);
        }
      } catch (errTicksField) {
      }
      try {
        if (rawValue && rawValue.seconds !== undefined && rawValue.seconds !== null) {
          var rawSeconds = Number(rawValue.seconds);
          if (!isNaN(rawSeconds)) {
            rawTicksFromSeconds = Number(PremiereBridge._secondsToTicks(rawSeconds));
          }
        }
      } catch (errSecondsField) {
      }
      var roundedTicks = Math.round(Number(rawTicks));
      var normalizedTicks = roundedTicks;
      var normalizedWithZeroPoint = false;
      var rawTimecode = null;
      var rawTimecodeTicks = null;
      try {
        if (rawValue && rawValue.timecode) {
          rawTimecode = String(rawValue.timecode);
          rawTimecodeTicks = PremiereBridge._timecodeToTicks(rawTimecode);
        }
      } catch (errRawTimecode) {
      }
      if (startTicks > 0 && roundedTicks >= 0 && roundedTicks < startTicks) {
        normalizedTicks = startTicks + roundedTicks;
        normalizedWithZeroPoint = true;
      }
      return {
        ticks: String(normalizedTicks),
        seconds: normalizedTicks / PremiereBridge.TICKS_PER_SECOND,
        timecode: PremiereBridge._ticksToTimecode(normalizedTicks),
        method: method,
        source: "cep",
        rawPlayerPositionTicks: String(roundedTicks),
        rawPlayerPositionTicksField:
          rawTicksFromTicks !== null && rawTicksFromTicks !== undefined && !isNaN(Number(rawTicksFromTicks))
            ? String(Math.round(Number(rawTicksFromTicks)))
            : null,
        rawPlayerPositionSecondsTicks:
          rawTicksFromSeconds !== null && rawTicksFromSeconds !== undefined && !isNaN(Number(rawTicksFromSeconds))
            ? String(Math.round(Number(rawTicksFromSeconds)))
            : null,
        rawPlayerPositionTimecode: rawTimecode,
        rawPlayerPositionTimecodeTicks:
          rawTimecodeTicks !== null && rawTimecodeTicks !== undefined && !isNaN(Number(rawTimecodeTicks))
            ? String(Math.round(Number(rawTimecodeTicks)))
            : null,
        sequenceInPointTicks:
          inPointTicks !== null && inPointTicks !== undefined && !isNaN(Number(inPointTicks))
            ? String(Math.round(Number(inPointTicks)))
            : null,
        sequenceStartTicks: String(startTicks),
        qeCtiTimecode: qeCtiTimecode,
        qeCtiTimecodeTicks:
          qeCtiTimecode !== null && qeCtiTimecode !== undefined
            ? String(Math.round(Number(PremiereBridge._timecodeToTicks(qeCtiTimecode))))
            : null,
        normalizedWithZeroPoint: normalizedWithZeroPoint
      };
    }

    if (sequence.getPlayerPosition) {
      try {
        var domResult = finalize("sequence.getPlayerPosition", sequence.getPlayerPosition());
        if (domResult) {
          return PremiereBridge._ok(domResult);
        }
      } catch (errDom) {
        errors.push("sequence.getPlayerPosition: " + String(errDom));
      }
    }

    if (qeSeq && qeSeq.getPlayerPosition) {
      try {
        var qeMethodResult = finalize("qe.getPlayerPosition", qeSeq.getPlayerPosition());
        if (qeMethodResult) {
          return PremiereBridge._ok(qeMethodResult);
        }
      } catch (errQeMethod) {
        errors.push("qe.getPlayerPosition: " + String(errQeMethod));
      }
    }

    if (qeSeq && qeSeq.CTI !== undefined && qeSeq.CTI !== null) {
      try {
        var qeCtiResult = finalize("qe.CTI", qeSeq.CTI);
        if (qeCtiResult) {
          return PremiereBridge._ok(qeCtiResult);
        }
      } catch (errQeCti) {
        errors.push("qe.CTI: " + String(errQeCti));
      }
    }

    return PremiereBridge._err("Unable to read playhead position", {
      errors: errors,
      available: {
        sequenceGetPlayerPosition: !!(sequence && sequence.getPlayerPosition),
        qeGetPlayerPosition: !!(qeSeq && qeSeq.getPlayerPosition),
        qeCti: !!(qeSeq && qeSeq.CTI !== undefined && qeSeq.CTI !== null)
      }
    });
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

PremiereBridge.setInPoint = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var sequence = app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }
    var qeSeq = PremiereBridge._getQeSequence();
    var current = PremiereBridge._readSequenceInOutTicks(sequence, qeSeq);
    if (!current.ok) {
      return PremiereBridge._err(current.error, current);
    }

    var inTicks = PremiereBridge._ticksFromPayload(payload, "in");
    if (inTicks === null || inTicks === undefined) {
      return PremiereBridge._err("Missing or invalid in value", { received: payload });
    }
    inTicks = Math.round(Number(inTicks));
    if (isNaN(inTicks)) {
      return PremiereBridge._err("Failed to compute in point ticks", { received: payload });
    }
    if (current.outTicks < inTicks) {
      return PremiereBridge._err("In point must be before or equal to the current out point", {
        inTicks: String(inTicks),
        currentOutTicks: String(current.outTicks),
        currentOutTimecode: current.outTimecode
      });
    }

    if (payload.dryRun === true) {
      return PremiereBridge._ok({
        dryRun: true,
        skipped: true,
        inTicks: String(inTicks),
        outTicks: String(current.outTicks),
        inTimecode: PremiereBridge._ticksToTimecode(inTicks),
        outTimecode: current.outTimecode,
        preserved: {
          outTicks: String(current.outTicks),
          outTimecode: current.outTimecode
        },
        current: current
      });
    }

    var applied = PremiereBridge._setInOutTicks(sequence, qeSeq, inTicks, current.outTicks);
    if (!applied.ok) {
      return PremiereBridge._err("Failed to set in point", {
        inApplied: applied.inApplied,
        outApplied: applied.outApplied,
        inTicks: String(inTicks),
        outTicks: String(current.outTicks),
        inTimecode: PremiereBridge._ticksToTimecode(inTicks),
        outTimecode: current.outTimecode,
        methods: applied.methods,
        errors: applied.errors,
        available: applied.available,
        preserved: {
          outTicks: String(current.outTicks),
          outTimecode: current.outTimecode
        },
        current: current
      });
    }

    return PremiereBridge._ok({
      inTicks: String(inTicks),
      outTicks: String(current.outTicks),
      inTimecode: PremiereBridge._ticksToTimecode(inTicks),
      outTimecode: current.outTimecode,
      preserved: {
        outTicks: String(current.outTicks),
        outTimecode: current.outTimecode
      },
      current: current,
      methods: applied.methods
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.setOutPoint = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var sequence = app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }
    var qeSeq = PremiereBridge._getQeSequence();
    var current = PremiereBridge._readSequenceInOutTicks(sequence, qeSeq);
    if (!current.ok) {
      return PremiereBridge._err(current.error, current);
    }

    var outTicks = PremiereBridge._ticksFromPayload(payload, "out");
    if (outTicks === null || outTicks === undefined) {
      return PremiereBridge._err("Missing or invalid out value", { received: payload });
    }
    outTicks = Math.round(Number(outTicks));
    if (isNaN(outTicks)) {
      return PremiereBridge._err("Failed to compute out point ticks", { received: payload });
    }
    if (outTicks < current.inTicks) {
      return PremiereBridge._err("Out point must be after or equal to the current in point", {
        outTicks: String(outTicks),
        currentInTicks: String(current.inTicks),
        currentInTimecode: current.inTimecode
      });
    }

    if (payload.dryRun === true) {
      return PremiereBridge._ok({
        dryRun: true,
        skipped: true,
        inTicks: String(current.inTicks),
        outTicks: String(outTicks),
        inTimecode: current.inTimecode,
        outTimecode: PremiereBridge._ticksToTimecode(outTicks),
        preserved: {
          inTicks: String(current.inTicks),
          inTimecode: current.inTimecode
        },
        current: current
      });
    }

    var applied = PremiereBridge._setInOutTicks(sequence, qeSeq, current.inTicks, outTicks);
    if (!applied.ok) {
      return PremiereBridge._err("Failed to set out point", {
        inApplied: applied.inApplied,
        outApplied: applied.outApplied,
        inTicks: String(current.inTicks),
        outTicks: String(outTicks),
        inTimecode: current.inTimecode,
        outTimecode: PremiereBridge._ticksToTimecode(outTicks),
        methods: applied.methods,
        errors: applied.errors,
        available: applied.available,
        preserved: {
          inTicks: String(current.inTicks),
          inTimecode: current.inTimecode
        },
        current: current
      });
    }

    return PremiereBridge._ok({
      inTicks: String(current.inTicks),
      outTicks: String(outTicks),
      inTimecode: current.inTimecode,
      outTimecode: PremiereBridge._ticksToTimecode(outTicks),
      preserved: {
        inTicks: String(current.inTicks),
        inTimecode: current.inTimecode
      },
      current: current,
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
    var qeSeq = PremiereBridge._getQeSequence();
    var added = 0;
    var errors = [];

    for (var i = 0; i < data.markers.length; i++) {
      var markerData = data.markers[i];
      var startTime = PremiereBridge._toTime(markerData, sequence, qeSeq);
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
      var colorResolved = PremiereBridge._resolveColorIndex(markerData);
      var colorIndex = colorResolved.index;

      if (colorIndex !== null && !isNaN(colorIndex)) {
        colorSet = PremiereBridge._applyColorIndex(markerCollection, marker, colorIndex);
        var colorNameFallback = null;
        if (typeof markerData.color === "string" && isNaN(Number(markerData.color))) {
          colorNameFallback = markerData.color;
        } else if (typeof markerData.colorValue === "string" && isNaN(Number(markerData.colorValue))) {
          colorNameFallback = markerData.colorValue;
        }
        if (!colorSet && marker.setColorByName && colorNameFallback) {
          try {
            marker.setColorByName(colorNameFallback);
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

PremiereBridge.updateMarker = function (jsonStr) {
  try {
    var data = PremiereBridge._parse(jsonStr) || {};
    var sequence = app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }

    var criteria = {
      name: null,
      timeTicks: null
    };
    if (data.matchName !== undefined && data.matchName !== null) {
      criteria.name = String(data.matchName);
      if (!criteria.name.replace(/^\s+|\s+$/g, "")) {
        return PremiereBridge._err("matchName must be a non-empty string");
      }
    }

    var hasTimeSelector =
      data.matchTimecode !== undefined ||
      data.matchFrame !== undefined ||
      data.matchSeconds !== undefined ||
      data.matchTicks !== undefined;
    if (hasTimeSelector) {
      criteria.timeTicks = PremiereBridge._markerPayloadToTicks({
        timecode: data.matchTimecode,
        frame: data.matchFrame,
        timeSeconds: data.matchSeconds,
        timeTicks: data.matchTicks
      }, sequence, PremiereBridge._getQeSequence());
      if (criteria.timeTicks === null || isNaN(Number(criteria.timeTicks))) {
        return PremiereBridge._err("Invalid match time");
      }
      criteria.timeTicks = Math.round(Number(criteria.timeTicks));
    }

    if (criteria.name === null && criteria.timeTicks === null) {
      return PremiereBridge._err("Provide matchName or one of matchTimecode/matchFrame/matchSeconds/matchTicks");
    }

    var hasPositionUpdate =
      data.timecode !== undefined ||
      data.frame !== undefined ||
      data.timeSeconds !== undefined ||
      data.timeTicks !== undefined;
    var hasDurationUpdate = data.durationSeconds !== undefined || data.durationTicks !== undefined;
    var hasColorUpdate =
      data.color !== undefined ||
      data.colorIndex !== undefined ||
      data.colorValue !== undefined;
    var hasNameUpdate = data.name !== undefined;
    var hasCommentUpdate = data.comment !== undefined;
    if (!hasPositionUpdate && !hasDurationUpdate && !hasColorUpdate && !hasNameUpdate && !hasCommentUpdate) {
      return PremiereBridge._err("No marker updates provided");
    }

    if (hasNameUpdate) {
      var nextName = String(data.name);
      if (!nextName.replace(/^\s+|\s+$/g, "")) {
        return PremiereBridge._err("name must be a non-empty string");
      }
    }

    var markerCollection = sequence.markers;
    var matches = PremiereBridge._collectMarkerMatches(markerCollection, criteria);
    if (!matches.length) {
      return PremiereBridge._err("No marker matched the requested selector", {
        criteria: {
          name: criteria.name,
          timeTicks: criteria.timeTicks !== null ? String(criteria.timeTicks) : null,
          timecode: criteria.timeTicks !== null ? PremiereBridge._ticksToTimecode(criteria.timeTicks) : null
        }
      });
    }
    if (matches.length > 1) {
      var ambiguous = [];
      var limit = Math.min(matches.length, 5);
      var i = 0;
      for (i = 0; i < limit; i++) {
        ambiguous.push(PremiereBridge._markerSummary(matches[i]));
      }
      return PremiereBridge._err("Multiple markers matched the requested selector. Narrow the match with both name and time.", {
        criteria: {
          name: criteria.name,
          timeTicks: criteria.timeTicks !== null ? String(criteria.timeTicks) : null,
          timecode: criteria.timeTicks !== null ? PremiereBridge._ticksToTimecode(criteria.timeTicks) : null
        },
        matchCount: matches.length,
        matches: ambiguous
      });
    }

    var marker = matches[0];
    var before = PremiereBridge._markerSummary(marker);
    var currentStartTicks = before.startTicks !== null ? Number(before.startTicks) : null;
    var currentDurationTicks = before.durationTicks !== null ? Number(before.durationTicks) : 0;
    if (currentStartTicks === null || isNaN(currentStartTicks)) {
      return PremiereBridge._err("Unable to read marker start time", { before: before });
    }
    if (isNaN(currentDurationTicks) || currentDurationTicks < 0) {
      currentDurationTicks = 0;
    }

    var finalStartTicks = currentStartTicks;
    var finalStartTime = null;
    if (hasPositionUpdate) {
      finalStartTicks = PremiereBridge._markerPayloadToTicks({
        timecode: data.timecode,
        frame: data.frame,
        timeSeconds: data.timeSeconds,
        timeTicks: data.timeTicks
      }, sequence, PremiereBridge._getQeSequence());
      if (finalStartTicks === null || isNaN(Number(finalStartTicks))) {
        return PremiereBridge._err("Invalid target time for marker update", { before: before });
      }
      finalStartTicks = Math.round(Number(finalStartTicks));
      finalStartTime = new Time();
      finalStartTime.ticks = String(finalStartTicks);
      finalStartTime.seconds = finalStartTicks / PremiereBridge.TICKS_PER_SECOND;
    }

    var finalDurationTicks = currentDurationTicks;
    if (data.durationSeconds !== undefined) {
      finalDurationTicks = Math.max(0, Math.round(Number(data.durationSeconds) * PremiereBridge.TICKS_PER_SECOND));
    } else if (data.durationTicks !== undefined) {
      finalDurationTicks = Math.max(0, Math.round(Number(data.durationTicks)));
    }

    if (hasPositionUpdate) {
      if (!finalStartTime) {
        finalStartTime = new Time();
        finalStartTime.ticks = String(finalStartTicks);
        finalStartTime.seconds = finalStartTicks / PremiereBridge.TICKS_PER_SECOND;
      }
      if (!PremiereBridge._setMarkerStart(marker, finalStartTime)) {
        return PremiereBridge._err("Failed to update marker start time", {
          before: before,
          requestedStartTicks: String(finalStartTicks),
          requestedStartTimecode: PremiereBridge._ticksToTimecode(finalStartTicks)
        });
      }
    }

    if (hasPositionUpdate || hasDurationUpdate || currentDurationTicks > 0) {
      var finalEndTicks = finalStartTicks + finalDurationTicks;
      if (finalEndTicks > finalStartTicks || hasDurationUpdate || currentDurationTicks > 0) {
        if (!PremiereBridge._setMarkerEndTicks(marker, finalEndTicks)) {
          return PremiereBridge._err("Failed to update marker duration/end time", {
            before: before,
            requestedEndTicks: String(finalEndTicks)
          });
        }
      }
    }

    if (hasNameUpdate && !PremiereBridge._setMarkerName(marker, data.name)) {
      return PremiereBridge._err("Failed to update marker name", { before: before });
    }

    if (hasCommentUpdate && !PremiereBridge._setMarkerComment(marker, data.comment)) {
      return PremiereBridge._err("Failed to update marker comment", { before: before });
    }

    if (hasColorUpdate) {
      var resolvedColor = PremiereBridge._resolveColorIndex(data);
      var colorSet = false;
      if (resolvedColor.index !== null && !isNaN(resolvedColor.index)) {
        colorSet = PremiereBridge._applyColorIndex(markerCollection, marker, resolvedColor.index);
      }
      if (!colorSet && data.color !== undefined && typeof data.color === "string" && marker.setColorByName) {
        try {
          marker.setColorByName(String(data.color));
          colorSet = true;
        } catch (errColor) {
        }
      }
      if (!colorSet) {
        return PremiereBridge._err("Failed to update marker color", { before: before });
      }
    }

    var after = PremiereBridge._markerSummary(marker);
    if (hasPositionUpdate) {
      if (after.startTicks === null || Number(after.startTicks) !== finalStartTicks) {
        return PremiereBridge._err("Marker update drifted from the requested frame", {
          before: before,
          after: after,
          requestedStartTicks: String(finalStartTicks),
          requestedStartTimecode: PremiereBridge._ticksToTimecode(finalStartTicks)
        });
      }
    }
    if (hasDurationUpdate) {
      if (after.durationTicks === null || Number(after.durationTicks) !== finalDurationTicks) {
        return PremiereBridge._err("Marker duration did not match the requested value", {
          before: before,
          after: after,
          requestedDurationTicks: String(finalDurationTicks)
        });
      }
    }

    return PremiereBridge._ok({
      criteria: {
        name: criteria.name,
        timeTicks: criteria.timeTicks !== null ? String(criteria.timeTicks) : null,
        timecode: criteria.timeTicks !== null ? PremiereBridge._ticksToTimecode(criteria.timeTicks) : null
      },
      before: before,
      after: after
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.deleteMarkers = function (jsonStr) {
  try {
    var data = PremiereBridge._parse(jsonStr) || {};
    var sequence = app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }

    var markerCollection = sequence.markers;
    var criteria = {
      mode: null,
      name: null,
      timeTicks: null,
      inTicks: null,
      outTicks: null
    };

    if (data.matchName !== undefined && data.matchName !== null) {
      criteria.name = String(data.matchName);
      if (!criteria.name.replace(/^\s+|\s+$/g, "")) {
        return PremiereBridge._err("matchName must be a non-empty string");
      }
    }

    var hasExactTimeSelector =
      data.matchTimecode !== undefined ||
      data.matchFrame !== undefined ||
      data.matchSeconds !== undefined ||
      data.matchTicks !== undefined;
    var hasRangeSelector =
      data.inTimecode !== undefined ||
      data.inFrame !== undefined ||
      data.inSeconds !== undefined ||
      data.inTicks !== undefined ||
      data.outTimecode !== undefined ||
      data.outFrame !== undefined ||
      data.outSeconds !== undefined ||
      data.outTicks !== undefined;

    if (hasExactTimeSelector && hasRangeSelector) {
      return PremiereBridge._err("Use either an exact marker time selector or an in/out range, not both");
    }

    if (hasRangeSelector) {
      criteria.inTicks = PremiereBridge._markerPayloadToTicks({
        timecode: data.inTimecode,
        frame: data.inFrame,
        timeSeconds: data.inSeconds,
        timeTicks: data.inTicks
      }, sequence, PremiereBridge._getQeSequence());
      criteria.outTicks = PremiereBridge._markerPayloadToTicks({
        timecode: data.outTimecode,
        frame: data.outFrame,
        timeSeconds: data.outSeconds,
        timeTicks: data.outTicks
      }, sequence, PremiereBridge._getQeSequence());
      if (criteria.inTicks === null || isNaN(Number(criteria.inTicks)) || criteria.outTicks === null || isNaN(Number(criteria.outTicks))) {
        return PremiereBridge._err("Invalid marker range");
      }
      criteria.inTicks = Math.round(Number(criteria.inTicks));
      criteria.outTicks = Math.round(Number(criteria.outTicks));
      if (criteria.outTicks < criteria.inTicks) {
        return PremiereBridge._err("delete-markers range end must be at or after the range start");
      }
      criteria.mode = "range";
    } else if (hasExactTimeSelector) {
      criteria.timeTicks = PremiereBridge._markerPayloadToTicks({
        timecode: data.matchTimecode,
        frame: data.matchFrame,
        timeSeconds: data.matchSeconds,
        timeTicks: data.matchTicks
      }, sequence, PremiereBridge._getQeSequence());
      if (criteria.timeTicks === null || isNaN(Number(criteria.timeTicks))) {
        return PremiereBridge._err("Invalid match time");
      }
      criteria.timeTicks = Math.round(Number(criteria.timeTicks));
      criteria.mode = "exact";
    } else if (criteria.name !== null) {
      criteria.mode = "name";
    } else {
      return PremiereBridge._err("Provide matchName, an exact match time, or an in/out range");
    }

    var matches = criteria.mode === "range"
      ? PremiereBridge._collectMarkerRangeMatches(markerCollection, criteria)
      : PremiereBridge._collectMarkerMatches(markerCollection, criteria);

    if (!matches.length) {
      return PremiereBridge._err("No markers matched the requested selector", {
        criteria: {
          mode: criteria.mode,
          name: criteria.name,
          timeTicks: criteria.timeTicks !== null ? String(criteria.timeTicks) : null,
          timecode: criteria.timeTicks !== null ? PremiereBridge._ticksToTimecode(criteria.timeTicks) : null,
          inTicks: criteria.inTicks !== null ? String(criteria.inTicks) : null,
          inTimecode: criteria.inTicks !== null ? PremiereBridge._ticksToTimecode(criteria.inTicks) : null,
          outTicks: criteria.outTicks !== null ? String(criteria.outTicks) : null,
          outTimecode: criteria.outTicks !== null ? PremiereBridge._ticksToTimecode(criteria.outTicks) : null
        }
      });
    }

    var deleteAllMatches = criteria.mode === "range" || data.allMatches === true;
    if (!deleteAllMatches && matches.length > 1) {
      var ambiguous = [];
      var limit = Math.min(matches.length, 5);
      var j = 0;
      for (j = 0; j < limit; j++) {
        ambiguous.push(PremiereBridge._markerSummary(matches[j]));
      }
      return PremiereBridge._err("Multiple markers matched the requested selector. Add --all-matches or narrow the selector.", {
        criteria: {
          mode: criteria.mode,
          name: criteria.name,
          timeTicks: criteria.timeTicks !== null ? String(criteria.timeTicks) : null,
          timecode: criteria.timeTicks !== null ? PremiereBridge._ticksToTimecode(criteria.timeTicks) : null
        },
        matchCount: matches.length,
        matches: ambiguous
      });
    }

    var targets = deleteAllMatches ? matches : [matches[0]];
    var deleted = [];
    var deleteErrors = [];
    var i = 0;
    for (i = targets.length - 1; i >= 0; i--) {
      var marker = targets[i];
      var summary = PremiereBridge._markerSummary(marker);
      if (PremiereBridge._deleteMarkerReference(markerCollection, marker)) {
        deleted.unshift(summary);
      } else {
        deleteErrors.push({
          index: i,
          marker: summary,
          error: "Failed to delete marker"
        });
      }
    }

    var remainingMatches = criteria.mode === "range"
      ? PremiereBridge._collectMarkerRangeMatches(markerCollection, criteria)
      : PremiereBridge._collectMarkerMatches(markerCollection, criteria);

    var expectZeroRemaining = deleteAllMatches || matches.length === 1;
    if (deleteErrors.length || (expectZeroRemaining && remainingMatches.length)) {
      var remaining = [];
      var remainingLimit = Math.min(remainingMatches.length, 5);
      var r = 0;
      for (r = 0; r < remainingLimit; r++) {
        remaining.push(PremiereBridge._markerSummary(remainingMatches[r]));
      }
      return PremiereBridge._err("Marker deletion did not complete cleanly", {
        criteria: {
          mode: criteria.mode,
          name: criteria.name,
          timeTicks: criteria.timeTicks !== null ? String(criteria.timeTicks) : null,
          timecode: criteria.timeTicks !== null ? PremiereBridge._ticksToTimecode(criteria.timeTicks) : null,
          inTicks: criteria.inTicks !== null ? String(criteria.inTicks) : null,
          inTimecode: criteria.inTicks !== null ? PremiereBridge._ticksToTimecode(criteria.inTicks) : null,
          outTicks: criteria.outTicks !== null ? String(criteria.outTicks) : null,
          outTimecode: criteria.outTicks !== null ? PremiereBridge._ticksToTimecode(criteria.outTicks) : null
        },
        deletedCount: deleted.length,
        deleted: deleted,
        remainingCount: remainingMatches.length,
        remaining: remaining,
        errors: deleteErrors
      });
    }

    return PremiereBridge._ok({
      criteria: {
        mode: criteria.mode,
        name: criteria.name,
        timeTicks: criteria.timeTicks !== null ? String(criteria.timeTicks) : null,
        timecode: criteria.timeTicks !== null ? PremiereBridge._ticksToTimecode(criteria.timeTicks) : null,
        inTicks: criteria.inTicks !== null ? String(criteria.inTicks) : null,
        inTimecode: criteria.inTicks !== null ? PremiereBridge._ticksToTimecode(criteria.inTicks) : null,
        outTicks: criteria.outTicks !== null ? String(criteria.outTicks) : null,
        outTimecode: criteria.outTicks !== null ? PremiereBridge._ticksToTimecode(criteria.outTicks) : null,
        allMatches: deleteAllMatches
      },
      deletedCount: deleted.length,
      deleted: deleted
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.clearMarkers = function (jsonStr) {
  try {
    var sequence = app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }

    var markerCollection = sequence.markers;
    var matches = PremiereBridge._collectAllMarkers(markerCollection);
    var before = [];
    var i = 0;
    for (i = 0; i < matches.length; i++) {
      before.push(PremiereBridge._markerSummary(matches[i]));
    }

    if (!matches.length) {
      return PremiereBridge._ok({
        deletedCount: 0,
        deleted: []
      });
    }

    var deleted = [];
    var deleteErrors = [];
    for (i = matches.length - 1; i >= 0; i--) {
      var marker = matches[i];
      var summary = PremiereBridge._markerSummary(marker);
      if (PremiereBridge._deleteMarkerReference(markerCollection, marker)) {
        deleted.unshift(summary);
      } else {
        deleteErrors.push({
          index: i,
          marker: summary,
          error: "Failed to delete marker"
        });
      }
    }

    var remainingMatches = PremiereBridge._collectAllMarkers(markerCollection);
    if (deleteErrors.length || remainingMatches.length) {
      var remaining = [];
      var r = 0;
      for (r = 0; r < Math.min(remainingMatches.length, 5); r++) {
        remaining.push(PremiereBridge._markerSummary(remainingMatches[r]));
      }
      return PremiereBridge._err("Clear markers did not complete cleanly", {
        beforeCount: before.length,
        deletedCount: deleted.length,
        deleted: deleted,
        remainingCount: remainingMatches.length,
        remaining: remaining,
        errors: deleteErrors
      });
    }

    return PremiereBridge._ok({
      deletedCount: deleted.length,
      deleted: deleted
    });
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

PremiereBridge.exportMarkers = function (jsonStr) {
  try {
    var sequence = app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }

    var markerCollection = sequence.markers;
    var matches = PremiereBridge._collectAllMarkers(markerCollection);
    var markers = [];
    var i = 0;
    for (i = 0; i < matches.length; i++) {
      markers.push(PremiereBridge._markerSummary(matches[i]));
    }

    return PremiereBridge._ok({
      sequence: {
        name: sequence.name ? String(sequence.name) : null,
        id: sequence.sequenceID ? String(sequence.sequenceID) : null
      },
      markers: markers
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge._exportSequenceWithPreset = function (payload, options) {
  try {
    var cleanPayload = payload || {};
    var cleanOptions = options || {};
    var project = app.project;
    if (!project) {
      return PremiereBridge._err("No project loaded");
    }
    var sequence = project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }

    var outputPath = cleanPayload.outputPath ? String(cleanPayload.outputPath) : null;
    if (!outputPath) {
      return PremiereBridge._err("Missing outputPath");
    }
    var presetPath = cleanPayload.presetPath ? String(cleanPayload.presetPath) : null;
    if (!presetPath) {
      return PremiereBridge._err("Missing presetPath");
    }

    var workAreaType = cleanPayload.workAreaType !== undefined ? Number(cleanPayload.workAreaType) : 0;
    if (isNaN(workAreaType) || workAreaType < 0) {
      workAreaType = 0;
    }

    var outputFile = new File(outputPath);
    var outputDir = outputFile.parent;
    if (!outputDir || (!outputDir.exists && !outputDir.create())) {
      return PremiereBridge._err("Failed to create output directory", {
        outputPath: outputPath,
        outputDirectory: outputDir ? outputDir.fsName : null,
        outputFilename: outputFile ? outputFile.name : null,
        outputPathSource: cleanPayload.outputPathSource ? String(cleanPayload.outputPathSource) : null
      });
    }

    var presetFile = new File(presetPath);
    if (!presetFile.exists) {
      return PremiereBridge._err("Preset file not found", {
        presetPath: presetPath
      });
    }

    if (!sequence.exportAsMediaDirect) {
      return PremiereBridge._err("sequence.exportAsMediaDirect is unavailable in this CEP runtime");
    }

    var methodsTried = [];
    var method = null;
    var rawResult = null;
    var errors = [];

    try {
      rawResult = sequence.exportAsMediaDirect(outputFile.fsName, presetFile.fsName, workAreaType);
      methodsTried.push("sequence.exportAsMediaDirect(fsName, fsName, workAreaType)");
      method = "sequence.exportAsMediaDirect(fsName, fsName, workAreaType)";
    } catch (errFsName) {
      errors.push(String(errFsName));
    }

    if (!method) {
      try {
        rawResult = sequence.exportAsMediaDirect(outputPath, presetPath, workAreaType);
        methodsTried.push("sequence.exportAsMediaDirect(outputPath, presetPath, workAreaType)");
        method = "sequence.exportAsMediaDirect(outputPath, presetPath, workAreaType)";
      } catch (errRawPath) {
        errors.push(String(errRawPath));
      }
    }

    if (!method) {
      return PremiereBridge._err(
        cleanOptions.failureLabel ? String(cleanOptions.failureLabel) : "Failed to export active sequence",
        {
        outputPath: outputFile.fsName,
        outputDirectory: outputDir ? outputDir.fsName : null,
        outputFilename: outputFile ? outputFile.name : null,
        presetPath: presetFile.fsName,
        outputPathSource: cleanPayload.outputPathSource ? String(cleanPayload.outputPathSource) : null,
        workAreaType: workAreaType,
        methodsTried: methodsTried,
        errors: errors
        }
      );
    }

    var exists = false;
    var bytes = null;
    try {
      exists = outputFile.exists;
      if (exists && outputFile.length !== undefined && outputFile.length !== null) {
        bytes = Number(outputFile.length);
      }
    } catch (errStat) {
    }

    return PremiereBridge._ok({
      transport: "cep",
      sequence: {
        name: sequence.name ? String(sequence.name) : null
      },
      outputPath: outputFile.fsName,
      outputDirectory: outputDir ? outputDir.fsName : null,
      outputFilename: outputFile ? outputFile.name : null,
      presetPath: presetFile.fsName,
      outputPathSource: cleanPayload.outputPathSource ? String(cleanPayload.outputPathSource) : null,
      method: method,
      workAreaType: workAreaType,
      rawResult: rawResult,
      methodsTried: methodsTried,
      file: {
        exists: exists,
        bytes: bytes
      },
      durationSeconds: null
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.exportSequenceDirect = function (jsonStr) {
  try {
    return PremiereBridge._exportSequenceWithPreset(PremiereBridge._parse(jsonStr) || {}, {
      failureLabel: "Failed to export active sequence"
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.exportSequenceAudio = function (jsonStr) {
  try {
    return PremiereBridge._exportSequenceWithPreset(PremiereBridge._parse(jsonStr) || {}, {
      failureLabel: "Failed to export active sequence audio"
    });
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

PremiereBridge.findProjectItem = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var project = app.project;
    if (!project || !project.rootItem) {
      return PremiereBridge._err("No project root item available");
    }

    var nameNeedleRaw = payload.name !== undefined && payload.name !== null ? String(payload.name) : null;
    var pathNeedleRaw = payload.path !== undefined && payload.path !== null ? String(payload.path) : null;
    if (!nameNeedleRaw && !pathNeedleRaw) {
      return PremiereBridge._err("Provide --name or --path");
    }

    var contains = payload.contains === true;
    var caseSensitive = payload.caseSensitive === true;
    var limit = payload.limit !== undefined && payload.limit !== null ? Math.round(Number(payload.limit)) : 25;
    if (isNaN(limit) || limit <= 0) {
      limit = 25;
    }
    if (limit > 500) {
      limit = 500;
    }

    function normalizeValue(value) {
      if (value === undefined || value === null) {
        return null;
      }
      var str = String(value);
      return caseSensitive ? str : str.toLowerCase();
    }

    function normalizePathParts(value) {
      if (!value) {
        return [];
      }
      var raw = String(value).replace(/\\/g, "/");
      var parts = raw.split("/");
      var clean = [];
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (!part) {
          continue;
        }
        clean.push(String(part));
      }
      return clean;
    }

    var nameNeedle = normalizeValue(nameNeedleRaw);
    var pathNeedleParts = normalizePathParts(pathNeedleRaw);
    var pathNeedle = normalizeValue(pathNeedleParts.join("/"));

    function matchesName(name) {
      if (!nameNeedle) {
        return true;
      }
      var normalized = normalizeValue(name);
      if (!normalized) {
        return false;
      }
      if (contains) {
        return normalized.indexOf(nameNeedle) !== -1;
      }
      return normalized === nameNeedle;
    }

    function matchesPath(fullPath) {
      if (!pathNeedle) {
        return true;
      }
      var normalized = normalizeValue(fullPath);
      if (!normalized) {
        return false;
      }
      if (contains) {
        return normalized.indexOf(pathNeedle) !== -1;
      }
      return normalized === pathNeedle;
    }

    function getChildCount(item) {
      if (!item || !item.children) {
        return 0;
      }
      return PremiereBridge._collectionCount(item.children, 4096);
    }

    function readSequenceInfo(item) {
      if (!item || !item.getSequence) {
        return null;
      }
      try {
        var seq = item.getSequence();
        if (!seq) {
          return null;
        }
        var seqId = null;
        try {
          if (seq.sequenceID !== undefined && seq.sequenceID !== null) {
            seqId = String(seq.sequenceID);
          } else if (seq.id !== undefined && seq.id !== null) {
            seqId = String(seq.id);
          }
        } catch (errSeqId) {
        }
        return {
          name: seq.name ? String(seq.name) : null,
          id: seqId
        };
      } catch (errSeq) {
      }
      return null;
    }

    var matches = [];
    var truncated = false;
    var stop = false;
    var scannedItems = 0;
    var scannedBins = 0;

    function recordMatch(item, binParts, childCount, isBin, matchName, matchPath) {
      var itemName = item && item.name ? String(item.name) : null;
      var binPath = binParts.length ? binParts.join("/") : "";
      var fullPathParts = binParts.slice(0);
      if (itemName) {
        fullPathParts.push(itemName);
      }
      var fullPath = fullPathParts.join("/");

      var nodeId = null;
      try {
        if (item && item.nodeId !== undefined && item.nodeId !== null) {
          nodeId = String(item.nodeId);
        } else if (item && item.id !== undefined && item.id !== null) {
          nodeId = String(item.id);
        }
      } catch (errNodeId) {
      }

      var typeValue = null;
      try {
        if (item && item.type !== undefined && item.type !== null) {
          typeValue = String(item.type);
        }
      } catch (errType) {
      }

      var mediaPath = null;
      try {
        if (item && item.getMediaPath) {
          mediaPath = item.getMediaPath();
          if (mediaPath !== undefined && mediaPath !== null) {
            mediaPath = String(mediaPath);
          } else {
            mediaPath = null;
          }
        }
      } catch (errMediaPath) {
      }

      matches.push({
        name: itemName,
        nodeId: nodeId,
        type: typeValue,
        isBin: !!isBin,
        childrenCount: childCount,
        binPath: binPath,
        fullPath: fullPath,
        mediaPath: mediaPath,
        sequence: readSequenceInfo(item),
        match: {
          name: !!matchName,
          path: !!matchPath
        }
      });

      if (matches.length >= limit) {
        truncated = true;
        stop = true;
      }
    }

    function walk(container, binParts) {
      if (stop || !container || !container.children) {
        return;
      }
      var children = container.children;
      var count = PremiereBridge._collectionCount(children, 4096);
      for (var i = 0; i < count; i++) {
        if (stop) {
          return;
        }
        var child = null;
        try {
          child = children[i];
        } catch (errChild) {
        }
        if (!child) {
          continue;
        }

        scannedItems++;
        var childName = child.name ? String(child.name) : null;
        var childCount = getChildCount(child);
        var hasChildren = child && child.children ? true : false;
        var isBin = hasChildren;
        if (isBin) {
          scannedBins++;
        }

        var fullPathParts = binParts.slice(0);
        if (childName) {
          fullPathParts.push(childName);
        }
        var fullPath = fullPathParts.join("/");

        var matchName = matchesName(childName);
        var matchPath = matchesPath(fullPath);
        var matchesQuery = (nameNeedle ? matchName : true) && (pathNeedle ? matchPath : true);
        if (matchesQuery) {
          recordMatch(child, binParts, childCount, isBin, matchName, matchPath);
        }

        if (hasChildren && childName) {
          walk(child, binParts.concat([childName]));
        } else if (hasChildren) {
          walk(child, binParts);
        }
      }
    }

    walk(project.rootItem, []);

    return PremiereBridge._ok({
      query: {
        name: nameNeedleRaw,
        path: pathNeedleRaw,
        contains: contains,
        caseSensitive: caseSensitive,
        limit: limit
      },
      matches: matches,
      truncated: truncated,
      scanned: {
        items: scannedItems,
        bins: scannedBins
      }
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.insertClip = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var project = app.project;
    var sequence = project && project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }
    if (!project || !project.rootItem) {
      return PremiereBridge._err("No project root item available");
    }

    var itemId = payload.itemId !== undefined && payload.itemId !== null ? String(payload.itemId) : null;
    if (!itemId) {
      return PremiereBridge._err("Provide itemId");
    }

    var videoTrackIndex =
      payload.videoTrackIndex !== undefined && payload.videoTrackIndex !== null
        ? Number(payload.videoTrackIndex)
        : null;
    var audioTrackIndex =
      payload.audioTrackIndex !== undefined && payload.audioTrackIndex !== null
        ? Number(payload.audioTrackIndex)
        : null;
    if (videoTrackIndex === null || isNaN(videoTrackIndex) || videoTrackIndex < 0 || Math.round(videoTrackIndex) !== videoTrackIndex) {
      return PremiereBridge._err("Invalid videoTrackIndex");
    }
    if (audioTrackIndex === null || isNaN(audioTrackIndex) || audioTrackIndex < 0 || Math.round(audioTrackIndex) !== audioTrackIndex) {
      return PremiereBridge._err("Invalid audioTrackIndex");
    }
    videoTrackIndex = Math.round(videoTrackIndex);
    audioTrackIndex = Math.round(audioTrackIndex);

    function getTrack(collection, index) {
      if (!collection || index < 0) {
        return null;
      }
      try {
        if (collection[index]) {
          return collection[index];
        }
      } catch (errCollectionIndex) {
      }
      return null;
    }

    function getClipCount(track) {
      if (!track || !track.clips) {
        return 0;
      }
      return PremiereBridge._collectionCount(track.clips, 4096);
    }

    function timeToTicksSafe(value) {
      try {
        return PremiereBridge._timeToTicks(value);
      } catch (errTimeToTicks) {
      }
      return null;
    }

    function snapshotTrack(track) {
      var snapshot = [];
      if (!track || !track.clips) {
        return snapshot;
      }
      var clipCount = PremiereBridge._collectionCount(track.clips, 4096);
      for (var clipIndex = 0; clipIndex < clipCount; clipIndex++) {
        var clip = null;
        try {
          clip = track.clips[clipIndex];
        } catch (errClip) {
        }
        if (!clip) {
          continue;
        }
        var clipName = null;
        try {
          if (clip.name) {
            clipName = String(clip.name);
          }
        } catch (errClipName) {
        }
        if (!clipName) {
          try {
            if (clip.projectItem && clip.projectItem.name) {
              clipName = String(clip.projectItem.name);
            }
          } catch (errProjectItemName) {
          }
        }
        var startTicks = timeToTicksSafe(clip.start);
        var endTicks = timeToTicksSafe(clip.end);
        snapshot.push({
          clipIndex: clipIndex,
          name: clipName,
          startTicks:
            startTicks !== null && startTicks !== undefined && !isNaN(Number(startTicks))
              ? String(Math.round(Number(startTicks)))
              : null,
          endTicks:
            endTicks !== null && endTicks !== undefined && !isNaN(Number(endTicks))
              ? String(Math.round(Number(endTicks)))
              : null
        });
      }
      return snapshot;
    }

    function itemTypeValue(item) {
      try {
        if (item && item.type !== undefined && item.type !== null) {
          return String(item.type);
        }
      } catch (errType) {
      }
      return null;
    }

    function itemMediaPath(item) {
      try {
        if (item && item.getMediaPath) {
          var raw = item.getMediaPath();
          if (raw !== undefined && raw !== null) {
            return String(raw);
          }
        }
      } catch (errMediaPath) {
      }
      return null;
    }

    function matchesItemId(item, requestedId) {
      if (!item || requestedId === null || requestedId === undefined) {
        return false;
      }
      var requested = String(requestedId);
      try {
        if (item.nodeId !== undefined && item.nodeId !== null && String(item.nodeId) === requested) {
          return true;
        }
      } catch (errNodeId) {
      }
      try {
        if (item.id !== undefined && item.id !== null && String(item.id) === requested) {
          return true;
        }
      } catch (errId) {
      }
      return false;
    }

    var found = null;
    function walk(container, binParts) {
      if (found || !container || !container.children) {
        return;
      }
      var children = container.children;
      var count = PremiereBridge._collectionCount(children, 4096);
      for (var i = 0; i < count; i++) {
        if (found) {
          return;
        }
        var child = null;
        try {
          child = children[i];
        } catch (errChild) {
        }
        if (!child) {
          continue;
        }
        var childName = child.name ? String(child.name) : null;
        var fullPathParts = binParts.slice(0);
        if (childName) {
          fullPathParts.push(childName);
        }
        if (matchesItemId(child, itemId)) {
          var foundNodeId = null;
          var foundLegacyId = null;
          try {
            if (child.nodeId !== undefined && child.nodeId !== null) {
              foundNodeId = String(child.nodeId);
            }
          } catch (errFoundNodeId) {
          }
          try {
            if (child.id !== undefined && child.id !== null) {
              foundLegacyId = String(child.id);
            }
          } catch (errFoundId) {
          }
          found = {
            item: child,
            binPath: binParts.length ? binParts.join("/") : "",
            fullPath: fullPathParts.join("/"),
            nodeId: foundNodeId,
            id: foundLegacyId
          };
          return;
        }
        if (child.children) {
          if (childName) {
            walk(child, binParts.concat([childName]));
          } else {
            walk(child, binParts);
          }
        }
      }
    }

    walk(project.rootItem, []);
    if (!found || !found.item) {
      return PremiereBridge._err("Project item not found", { itemId: itemId });
    }

    var placement = {
      mode: null,
      input: null,
      source: "explicit",
      method: null
    };
    var targetTicks = null;

    if (payload.at !== undefined && payload.at !== null) {
      if (String(payload.at).toLowerCase() !== "playhead") {
        return PremiereBridge._err("Unsupported insert location", { at: payload.at });
      }
      if (payload.ticks !== undefined && payload.ticks !== null) {
        targetTicks = Number(payload.ticks);
        placement.mode = "playhead";
        placement.input = "playhead";
        placement.source = payload.playheadSource ? String(payload.playheadSource) : "cli";
        placement.method = payload.playheadMethod ? String(payload.playheadMethod) : null;
      } else {
        var playheadRaw = PremiereBridge.getPlayheadPosition();
        var playheadParsed = PremiereBridge._parse(playheadRaw);
        if (!playheadParsed || !playheadParsed.ok || !playheadParsed.data) {
          return PremiereBridge._err("Unable to resolve playhead position", {
            itemId: itemId,
            at: payload.at,
            playhead: playheadParsed
          });
        }
        targetTicks = Number(playheadParsed.data.ticks);
        placement.mode = "playhead";
        placement.input = "playhead";
        placement.source = playheadParsed.data.source ? String(playheadParsed.data.source) : "cep";
        placement.method = playheadParsed.data.method ? String(playheadParsed.data.method) : null;
      }
    } else if (payload.timecode !== undefined && payload.timecode !== null) {
      targetTicks = PremiereBridge._timecodeToTicks(String(payload.timecode));
      placement.mode = "timecode";
      placement.input = String(payload.timecode);
    } else if (payload.seconds !== undefined && payload.seconds !== null) {
      targetTicks = PremiereBridge._secondsToTicks(Number(payload.seconds));
      placement.mode = "seconds";
      placement.input = Number(payload.seconds);
    } else if (payload.ticks !== undefined && payload.ticks !== null) {
      targetTicks = Number(payload.ticks);
      placement.mode = "ticks";
      placement.input = String(payload.ticks);
    } else {
      return PremiereBridge._err("Provide insert location via at, timecode, seconds, or ticks");
    }

    targetTicks = Math.round(Number(targetTicks));
    if (isNaN(targetTicks) || targetTicks < 0) {
      return PremiereBridge._err("Failed to resolve insert position", {
        itemId: itemId,
        placement: placement
      });
    }

    var videoTrack = getTrack(sequence.videoTracks, videoTrackIndex);
    var audioTrack = getTrack(sequence.audioTracks, audioTrackIndex);
    if (!videoTrack) {
      return PremiereBridge._err("Video track not found", { videoTrackIndex: videoTrackIndex });
    }
    if (!audioTrack) {
      return PremiereBridge._err("Audio track not found", { audioTrackIndex: audioTrackIndex });
    }

    var beforeVideoClipCount = getClipCount(videoTrack);
    var beforeAudioClipCount = getClipCount(audioTrack);
    var ticksString = String(targetTicks);
    var availableInsertMethods = {
      videoTrackInsertClip: !!(videoTrack && videoTrack.insertClip),
      audioTrackInsertClip: !!(audioTrack && audioTrack.insertClip)
    };
    if (!availableInsertMethods.videoTrackInsertClip && !availableInsertMethods.audioTrackInsertClip) {
      return PremiereBridge._err("No supported insertClip method is available for the requested tracks", {
        itemId: itemId,
        videoTrackIndex: videoTrackIndex,
        audioTrackIndex: audioTrackIndex,
        available: availableInsertMethods
      });
    }

    if (payload.dryRun === true) {
      return PremiereBridge._ok({
        dryRun: true,
        skipped: true,
        item: {
          requestedId: itemId,
          nodeId: found.nodeId,
          id: found.id,
          name: found.item && found.item.name ? String(found.item.name) : null,
          type: itemTypeValue(found.item),
          mediaPath: itemMediaPath(found.item),
          binPath: found.binPath,
          fullPath: found.fullPath
        },
        placement: {
          mode: placement.mode,
          input: placement.input,
          source: placement.source,
          method: placement.method,
          ticks: ticksString,
          seconds: targetTicks / PremiereBridge.TICKS_PER_SECOND,
          timecode: PremiereBridge._ticksToTimecode(targetTicks)
        },
        tracks: {
          videoTrackIndex: videoTrackIndex,
          audioTrackIndex: audioTrackIndex,
          before: {
            videoClipCount: beforeVideoClipCount,
            audioClipCount: beforeAudioClipCount
          },
          available: availableInsertMethods
        }
      });
    }

    var insertMethod = null;
    var insertErrors = [];

    try {
      if (videoTrack.insertClip) {
        videoTrack.insertClip(found.item, ticksString, videoTrackIndex, audioTrackIndex);
        insertMethod = "videoTrack.insertClip";
      }
    } catch (errVideoInsert) {
      insertErrors.push("videoTrack.insertClip: " + String(errVideoInsert));
    }

    if (!insertMethod) {
      try {
        if (audioTrack.insertClip) {
          audioTrack.insertClip(found.item, ticksString, videoTrackIndex, audioTrackIndex);
          insertMethod = "audioTrack.insertClip";
        } else {
          insertErrors.push("audioTrack.insertClip unavailable");
        }
      } catch (errAudioInsert) {
        insertErrors.push("audioTrack.insertClip: " + String(errAudioInsert));
      }
    }

    if (!insertMethod) {
      return PremiereBridge._err("Unable to insert clip", {
        itemId: itemId,
        targetTicks: ticksString,
        videoTrackIndex: videoTrackIndex,
        audioTrackIndex: audioTrackIndex,
        errors: insertErrors,
        available: availableInsertMethods
      });
    }

    var afterVideoClipCount = getClipCount(videoTrack);
    var afterAudioClipCount = getClipCount(audioTrack);
    var observedChange = afterVideoClipCount > beforeVideoClipCount || afterAudioClipCount > beforeAudioClipCount;
    if (!observedChange) {
      return PremiereBridge._err("Insert call completed but no clip-count change was observed", {
        itemId: itemId,
        method: insertMethod,
        placement: {
          mode: placement.mode,
          input: placement.input,
          source: placement.source,
          method: placement.method,
          ticks: ticksString,
          seconds: targetTicks / PremiereBridge.TICKS_PER_SECOND,
          timecode: PremiereBridge._ticksToTimecode(targetTicks)
        },
        tracks: {
          videoTrackIndex: videoTrackIndex,
          audioTrackIndex: audioTrackIndex,
          before: {
            videoClipCount: beforeVideoClipCount,
            audioClipCount: beforeAudioClipCount
          },
          after: {
            videoClipCount: afterVideoClipCount,
            audioClipCount: afterAudioClipCount
          }
        },
        errors: insertErrors
      });
    }

    return PremiereBridge._ok({
      item: {
        requestedId: itemId,
        nodeId: found.nodeId,
        id: found.id,
        name: found.item && found.item.name ? String(found.item.name) : null,
        type: itemTypeValue(found.item),
        mediaPath: itemMediaPath(found.item),
        binPath: found.binPath,
        fullPath: found.fullPath
      },
      placement: {
        mode: placement.mode,
        input: placement.input,
        source: placement.source,
        method: placement.method,
        ticks: ticksString,
        seconds: targetTicks / PremiereBridge.TICKS_PER_SECOND,
        timecode: PremiereBridge._ticksToTimecode(targetTicks)
      },
      tracks: {
        videoTrackIndex: videoTrackIndex,
        audioTrackIndex: audioTrackIndex,
        before: {
          videoClipCount: beforeVideoClipCount,
          audioClipCount: beforeAudioClipCount
        },
        after: {
          videoClipCount: afterVideoClipCount,
          audioClipCount: afterAudioClipCount
        }
      },
      insert: {
        method: insertMethod,
        observedChange: observedChange,
        errors: insertErrors
      }
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.overwriteClip = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var project = app.project;
    var sequence = project && project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }
    if (!project || !project.rootItem) {
      return PremiereBridge._err("No project root item available");
    }

    var itemId = payload.itemId !== undefined && payload.itemId !== null ? String(payload.itemId) : null;
    if (!itemId) {
      return PremiereBridge._err("Provide itemId");
    }

    var videoTrackIndex =
      payload.videoTrackIndex !== undefined && payload.videoTrackIndex !== null
        ? Number(payload.videoTrackIndex)
        : null;
    var audioTrackIndex =
      payload.audioTrackIndex !== undefined && payload.audioTrackIndex !== null
        ? Number(payload.audioTrackIndex)
        : null;
    if (videoTrackIndex === null || isNaN(videoTrackIndex) || videoTrackIndex < 0 || Math.round(videoTrackIndex) !== videoTrackIndex) {
      return PremiereBridge._err("Invalid videoTrackIndex");
    }
    if (audioTrackIndex === null || isNaN(audioTrackIndex) || audioTrackIndex < 0 || Math.round(audioTrackIndex) !== audioTrackIndex) {
      return PremiereBridge._err("Invalid audioTrackIndex");
    }
    videoTrackIndex = Math.round(videoTrackIndex);
    audioTrackIndex = Math.round(audioTrackIndex);

    function getTrack(collection, index) {
      if (!collection || index < 0) {
        return null;
      }
      try {
        if (collection[index]) {
          return collection[index];
        }
      } catch (errCollectionIndex) {
      }
      return null;
    }

    function getClipCount(track) {
      if (!track || !track.clips) {
        return 0;
      }
      return PremiereBridge._collectionCount(track.clips, 4096);
    }

    function timeToTicksSafe(value) {
      try {
        return PremiereBridge._timeToTicks(value);
      } catch (errTimeToTicks) {
      }
      return null;
    }

    function snapshotTrack(track) {
      var snapshot = [];
      if (!track || !track.clips) {
        return snapshot;
      }
      var clipCount = PremiereBridge._collectionCount(track.clips, 4096);
      for (var clipIndex = 0; clipIndex < clipCount; clipIndex++) {
        var clip = null;
        try {
          clip = track.clips[clipIndex];
        } catch (errClip) {
        }
        if (!clip) {
          continue;
        }
        var clipName = null;
        try {
          if (clip.name) {
            clipName = String(clip.name);
          }
        } catch (errClipName) {
        }
        if (!clipName) {
          try {
            if (clip.projectItem && clip.projectItem.name) {
              clipName = String(clip.projectItem.name);
            }
          } catch (errProjectItemName) {
          }
        }
        var startTicks = timeToTicksSafe(clip.start);
        var endTicks = timeToTicksSafe(clip.end);
        snapshot.push({
          clipIndex: clipIndex,
          name: clipName,
          startTicks:
            startTicks !== null && startTicks !== undefined && !isNaN(Number(startTicks))
              ? String(Math.round(Number(startTicks)))
              : null,
          endTicks:
            endTicks !== null && endTicks !== undefined && !isNaN(Number(endTicks))
              ? String(Math.round(Number(endTicks)))
              : null
        });
      }
      return snapshot;
    }

    function itemTypeValue(item) {
      try {
        if (item && item.type !== undefined && item.type !== null) {
          return String(item.type);
        }
      } catch (errType) {
      }
      return null;
    }

    function itemMediaPath(item) {
      try {
        if (item && item.getMediaPath) {
          var raw = item.getMediaPath();
          if (raw !== undefined && raw !== null) {
            return String(raw);
          }
        }
      } catch (errMediaPath) {
      }
      return null;
    }

    function matchesItemId(item, requestedId) {
      if (!item || requestedId === null || requestedId === undefined) {
        return false;
      }
      var requested = String(requestedId);
      try {
        if (item.nodeId !== undefined && item.nodeId !== null && String(item.nodeId) === requested) {
          return true;
        }
      } catch (errNodeId) {
      }
      try {
        if (item.id !== undefined && item.id !== null && String(item.id) === requested) {
          return true;
        }
      } catch (errId) {
      }
      return false;
    }

    var found = null;
    function walk(container, binParts) {
      if (found || !container || !container.children) {
        return;
      }
      var children = container.children;
      var count = PremiereBridge._collectionCount(children, 4096);
      for (var i = 0; i < count; i++) {
        if (found) {
          return;
        }
        var child = null;
        try {
          child = children[i];
        } catch (errChild) {
        }
        if (!child) {
          continue;
        }
        var childName = child.name ? String(child.name) : null;
        var fullPathParts = binParts.slice(0);
        if (childName) {
          fullPathParts.push(childName);
        }
        if (matchesItemId(child, itemId)) {
          var foundNodeId = null;
          var foundLegacyId = null;
          try {
            if (child.nodeId !== undefined && child.nodeId !== null) {
              foundNodeId = String(child.nodeId);
            }
          } catch (errFoundNodeId) {
          }
          try {
            if (child.id !== undefined && child.id !== null) {
              foundLegacyId = String(child.id);
            }
          } catch (errFoundId) {
          }
          found = {
            item: child,
            binPath: binParts.length ? binParts.join("/") : "",
            fullPath: fullPathParts.join("/"),
            nodeId: foundNodeId,
            id: foundLegacyId
          };
          return;
        }
        if (child.children) {
          if (childName) {
            walk(child, binParts.concat([childName]));
          } else {
            walk(child, binParts);
          }
        }
      }
    }

    walk(project.rootItem, []);
    if (!found || !found.item) {
      return PremiereBridge._err("Project item not found", { itemId: itemId });
    }

    var placement = {
      mode: null,
      input: null,
      source: "explicit",
      method: null
    };
    var targetTicks = null;

    if (payload.at !== undefined && payload.at !== null) {
      if (String(payload.at).toLowerCase() !== "playhead") {
        return PremiereBridge._err("Unsupported overwrite location", { at: payload.at });
      }
      if (payload.ticks !== undefined && payload.ticks !== null) {
        targetTicks = Number(payload.ticks);
        placement.mode = "playhead";
        placement.input = "playhead";
        placement.source = payload.playheadSource ? String(payload.playheadSource) : "cli";
        placement.method = payload.playheadMethod ? String(payload.playheadMethod) : null;
      } else {
        var playheadRaw = PremiereBridge.getPlayheadPosition();
        var playheadParsed = PremiereBridge._parse(playheadRaw);
        if (!playheadParsed || !playheadParsed.ok || !playheadParsed.data) {
          return PremiereBridge._err("Unable to resolve playhead position", {
            itemId: itemId,
            at: payload.at,
            playhead: playheadParsed
          });
        }
        targetTicks = Number(playheadParsed.data.ticks);
        placement.mode = "playhead";
        placement.input = "playhead";
        placement.source = playheadParsed.data.source ? String(playheadParsed.data.source) : "cep";
        placement.method = playheadParsed.data.method ? String(playheadParsed.data.method) : null;
      }
    } else if (payload.timecode !== undefined && payload.timecode !== null) {
      targetTicks = PremiereBridge._timecodeToTicks(String(payload.timecode));
      placement.mode = "timecode";
      placement.input = String(payload.timecode);
    } else if (payload.seconds !== undefined && payload.seconds !== null) {
      targetTicks = PremiereBridge._secondsToTicks(Number(payload.seconds));
      placement.mode = "seconds";
      placement.input = Number(payload.seconds);
    } else if (payload.ticks !== undefined && payload.ticks !== null) {
      targetTicks = Number(payload.ticks);
      placement.mode = "ticks";
      placement.input = String(payload.ticks);
    } else {
      return PremiereBridge._err("Provide overwrite location via at, timecode, seconds, or ticks");
    }

    targetTicks = Math.round(Number(targetTicks));
    if (isNaN(targetTicks) || targetTicks < 0) {
      return PremiereBridge._err("Failed to resolve overwrite position", {
        itemId: itemId,
        placement: placement
      });
    }

    var targetSeconds = targetTicks / PremiereBridge.TICKS_PER_SECOND;
    var videoTrack = getTrack(sequence.videoTracks, videoTrackIndex);
    var audioTrack = getTrack(sequence.audioTracks, audioTrackIndex);
    if (!videoTrack) {
      return PremiereBridge._err("Video track not found", { videoTrackIndex: videoTrackIndex });
    }
    if (!audioTrack) {
      return PremiereBridge._err("Audio track not found", { audioTrackIndex: audioTrackIndex });
    }

    var beforeVideoClipCount = getClipCount(videoTrack);
    var beforeAudioClipCount = getClipCount(audioTrack);
    var beforeVideoSnapshot = snapshotTrack(videoTrack);
    var beforeAudioSnapshot = snapshotTrack(audioTrack);
    var ticksString = String(targetTicks);
    var availableOverwriteMethods = {
      sequenceOverwriteClip: !!(sequence && sequence.overwriteClip),
      videoTrackOverwriteClip: !!(videoTrack && videoTrack.overwriteClip),
      audioTrackOverwriteClip: !!(audioTrack && audioTrack.overwriteClip)
    };
    if (
      !availableOverwriteMethods.sequenceOverwriteClip &&
      !availableOverwriteMethods.videoTrackOverwriteClip &&
      !availableOverwriteMethods.audioTrackOverwriteClip
    ) {
      return PremiereBridge._err("No supported overwriteClip method is available for the requested tracks", {
        itemId: itemId,
        videoTrackIndex: videoTrackIndex,
        audioTrackIndex: audioTrackIndex,
        available: availableOverwriteMethods
      });
    }

    if (payload.dryRun === true) {
      return PremiereBridge._ok({
        dryRun: true,
        skipped: true,
        item: {
          requestedId: itemId,
          nodeId: found.nodeId,
          id: found.id,
          name: found.item && found.item.name ? String(found.item.name) : null,
          type: itemTypeValue(found.item),
          mediaPath: itemMediaPath(found.item),
          binPath: found.binPath,
          fullPath: found.fullPath
        },
        placement: {
          mode: placement.mode,
          input: placement.input,
          source: placement.source,
          method: placement.method,
          ticks: ticksString,
          seconds: targetSeconds,
          timecode: PremiereBridge._ticksToTimecode(targetTicks)
        },
        tracks: {
          videoTrackIndex: videoTrackIndex,
          audioTrackIndex: audioTrackIndex,
          before: {
            videoClipCount: beforeVideoClipCount,
            audioClipCount: beforeAudioClipCount
          },
          snapshot: {
            video: beforeVideoSnapshot,
            audio: beforeAudioSnapshot
          },
          available: availableOverwriteMethods
        }
      });
    }

    var overwriteMethod = null;
    var overwriteErrors = [];
    var overwriteTrackResults = {
      video: false,
      audio: false
    };

    try {
      if (sequence.overwriteClip) {
        sequence.overwriteClip(found.item, targetSeconds, videoTrackIndex, audioTrackIndex);
        overwriteMethod = "sequence.overwriteClip";
        overwriteTrackResults.video = true;
        overwriteTrackResults.audio = true;
      }
    } catch (errSequenceOverwrite) {
      overwriteErrors.push("sequence.overwriteClip: " + String(errSequenceOverwrite));
    }

    if (!overwriteMethod) {
      try {
        if (videoTrack.overwriteClip) {
          videoTrack.overwriteClip(found.item, ticksString);
          overwriteTrackResults.video = true;
        } else {
          overwriteErrors.push("videoTrack.overwriteClip unavailable");
        }
      } catch (errVideoOverwrite) {
        overwriteErrors.push("videoTrack.overwriteClip: " + String(errVideoOverwrite));
      }
    }

    if (!overwriteMethod) {
      try {
        if (audioTrack.overwriteClip) {
          audioTrack.overwriteClip(found.item, ticksString);
          overwriteTrackResults.audio = true;
        } else {
          overwriteErrors.push("audioTrack.overwriteClip unavailable");
        }
      } catch (errAudioOverwrite) {
        overwriteErrors.push("audioTrack.overwriteClip: " + String(errAudioOverwrite));
      }
    }

    if (!overwriteMethod && (overwriteTrackResults.video || overwriteTrackResults.audio)) {
      if (overwriteTrackResults.video && overwriteTrackResults.audio) {
        overwriteMethod = "videoTrack.overwriteClip+audioTrack.overwriteClip";
      } else if (overwriteTrackResults.video) {
        overwriteMethod = "videoTrack.overwriteClip";
      } else if (overwriteTrackResults.audio) {
        overwriteMethod = "audioTrack.overwriteClip";
      }
    }

    if (!overwriteMethod) {
      return PremiereBridge._err("Unable to overwrite clip", {
        itemId: itemId,
        targetTicks: ticksString,
        targetSeconds: targetSeconds,
        videoTrackIndex: videoTrackIndex,
        audioTrackIndex: audioTrackIndex,
        errors: overwriteErrors,
        available: availableOverwriteMethods
      });
    }

    var afterVideoClipCount = getClipCount(videoTrack);
    var afterAudioClipCount = getClipCount(audioTrack);
    var afterVideoSnapshot = snapshotTrack(videoTrack);
    var afterAudioSnapshot = snapshotTrack(audioTrack);
    var beforeVideoSnapshotJson = JSON.stringify(beforeVideoSnapshot);
    var beforeAudioSnapshotJson = JSON.stringify(beforeAudioSnapshot);
    var afterVideoSnapshotJson = JSON.stringify(afterVideoSnapshot);
    var afterAudioSnapshotJson = JSON.stringify(afterAudioSnapshot);
    var observedChange =
      beforeVideoSnapshotJson !== afterVideoSnapshotJson || beforeAudioSnapshotJson !== afterAudioSnapshotJson;
    if (!observedChange) {
      return PremiereBridge._err("Overwrite call completed but no track-level change was observed", {
        itemId: itemId,
        method: overwriteMethod,
        placement: {
          mode: placement.mode,
          input: placement.input,
          source: placement.source,
          method: placement.method,
          ticks: ticksString,
          seconds: targetSeconds,
          timecode: PremiereBridge._ticksToTimecode(targetTicks)
        },
        tracks: {
          videoTrackIndex: videoTrackIndex,
          audioTrackIndex: audioTrackIndex,
          before: {
            videoClipCount: beforeVideoClipCount,
            audioClipCount: beforeAudioClipCount
          },
          after: {
            videoClipCount: afterVideoClipCount,
            audioClipCount: afterAudioClipCount
          },
          snapshot: {
            before: {
              video: beforeVideoSnapshot,
              audio: beforeAudioSnapshot
            },
            after: {
              video: afterVideoSnapshot,
              audio: afterAudioSnapshot
            }
          }
        },
        trackResults: overwriteTrackResults,
        errors: overwriteErrors
      });
    }

    return PremiereBridge._ok({
      item: {
        requestedId: itemId,
        nodeId: found.nodeId,
        id: found.id,
        name: found.item && found.item.name ? String(found.item.name) : null,
        type: itemTypeValue(found.item),
        mediaPath: itemMediaPath(found.item),
        binPath: found.binPath,
        fullPath: found.fullPath
      },
      placement: {
        mode: placement.mode,
        input: placement.input,
        source: placement.source,
        method: placement.method,
        ticks: ticksString,
        seconds: targetSeconds,
        timecode: PremiereBridge._ticksToTimecode(targetTicks)
      },
      tracks: {
        videoTrackIndex: videoTrackIndex,
        audioTrackIndex: audioTrackIndex,
        before: {
          videoClipCount: beforeVideoClipCount,
          audioClipCount: beforeAudioClipCount
        },
        after: {
          videoClipCount: afterVideoClipCount,
          audioClipCount: afterAudioClipCount
        },
        snapshot: {
          before: {
            video: beforeVideoSnapshot,
            audio: beforeAudioSnapshot
          },
          after: {
            video: afterVideoSnapshot,
            audio: afterAudioSnapshot
          }
        }
      },
      overwrite: {
        method: overwriteMethod,
        observedChange: observedChange,
        trackResults: overwriteTrackResults,
        errors: overwriteErrors
      }
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.replaceClipSource = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var project = app.project;
    var sequence = project && project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }
    if (!project || !project.rootItem) {
      return PremiereBridge._err("No project root item available");
    }

    var itemId = payload.itemId !== undefined && payload.itemId !== null ? String(payload.itemId) : null;
    if (!itemId) {
      return PremiereBridge._err("Provide itemId");
    }

    function projectItemNodeId(item) {
      if (!item) {
        return null;
      }
      try {
        if (item.nodeId !== undefined && item.nodeId !== null) {
          return String(item.nodeId);
        }
      } catch (errNodeId) {
      }
      try {
        if (item.id !== undefined && item.id !== null) {
          return String(item.id);
        }
      } catch (errLegacyId) {
      }
      return null;
    }

    function projectItemMediaPath(item) {
      try {
        if (item && item.getMediaPath) {
          var raw = item.getMediaPath();
          if (raw !== undefined && raw !== null) {
            return String(raw);
          }
        }
      } catch (errMediaPath) {
      }
      return null;
    }

    function itemSummary(foundItem) {
      return {
        requestedId: itemId,
        nodeId: foundItem ? foundItem.nodeId : null,
        id: foundItem ? foundItem.id : null,
        name: foundItem && foundItem.item && foundItem.item.name ? String(foundItem.item.name) : null,
        type: foundItem ? foundItem.type : null,
        mediaPath: foundItem ? foundItem.mediaPath : null,
        binPath: foundItem ? foundItem.binPath : "",
        fullPath: foundItem ? foundItem.fullPath : null
      };
    }

    function matchesItemId(item, requestedId) {
      var foundId = projectItemNodeId(item);
      return foundId !== null && String(foundId) === String(requestedId);
    }

    var found = null;
    function walkProjectItems(container, binParts) {
      if (found || !container || !container.children) {
        return;
      }
      var children = container.children;
      var count = PremiereBridge._collectionCount(children, 4096);
      for (var i = 0; i < count; i++) {
        if (found) {
          return;
        }
        var child = null;
        try {
          child = children[i];
        } catch (errChild) {
        }
        if (!child) {
          continue;
        }
        var childName = child.name ? String(child.name) : null;
        var fullPathParts = binParts.slice(0);
        if (childName) {
          fullPathParts.push(childName);
        }
        if (matchesItemId(child, itemId)) {
          var childType = null;
          try {
            if (child.type !== undefined && child.type !== null) {
              childType = String(child.type);
            }
          } catch (errChildType) {
          }
          found = {
            item: child,
            nodeId: projectItemNodeId(child),
            id: null,
            type: childType,
            mediaPath: projectItemMediaPath(child),
            binPath: binParts.length ? binParts.join("/") : "",
            fullPath: fullPathParts.join("/")
          };
          try {
            if (child.id !== undefined && child.id !== null) {
              found.id = String(child.id);
            }
          } catch (errFoundLegacyId) {
          }
          return;
        }
        if (child.children) {
          if (childName) {
            walkProjectItems(child, binParts.concat([childName]));
          } else {
            walkProjectItems(child, binParts);
          }
        }
      }
    }

    walkProjectItems(project.rootItem, []);
    if (!found || !found.item) {
      return PremiereBridge._err("Project item not found", { itemId: itemId });
    }

    var selectedOnly = payload.selected === true;
    var matchName = null;
    if (payload.matchName !== undefined && payload.matchName !== null) {
      matchName = String(payload.matchName);
      if (!matchName.replace(/^\s+|\s+$/g, "")) {
        return PremiereBridge._err("matchName must be a non-empty string");
      }
    }

    var trackIndex = null;
    var kind = payload.kind ? String(payload.kind).toLowerCase() : null;
    if (payload.track !== undefined && payload.track !== null) {
      var trackStr = String(payload.track).toUpperCase();
      if (trackStr.indexOf("V") === 0) {
        trackIndex = Number(trackStr.slice(1)) - 1;
        if (!kind) {
          kind = "video";
        }
      } else if (trackStr.indexOf("A") === 0) {
        trackIndex = Number(trackStr.slice(1)) - 1;
        if (!kind) {
          kind = "audio";
        }
      } else {
        trackIndex = Number(trackStr) - 1;
      }
    } else if (payload.trackNumber !== undefined && payload.trackNumber !== null) {
      trackIndex = Number(payload.trackNumber) - 1;
    } else if (payload.trackIndex !== undefined && payload.trackIndex !== null) {
      trackIndex = Number(payload.trackIndex);
    }

    if (trackIndex !== null) {
      if (isNaN(trackIndex) || trackIndex < 0 || Math.round(trackIndex) !== trackIndex) {
        return PremiereBridge._err("Invalid track identifier");
      }
      if (!kind) {
        return PremiereBridge._err("Track selector requires kind. Use --track V1|A1 or provide --kind video|audio.");
      }
      trackIndex = Math.round(trackIndex);
    }
    if (kind && kind !== "video" && kind !== "audio") {
      return PremiereBridge._err("Invalid track kind; use video or audio");
    }

    var hasTimeSelector =
      payload.timecode !== undefined ||
      payload.frame !== undefined ||
      payload.seconds !== undefined ||
      payload.ticks !== undefined;
    var qeSeq = PremiereBridge._getQeSequence();
    var targetTicks = null;
    if (hasTimeSelector) {
      targetTicks = PremiereBridge._markerPayloadToTicks({
        timecode: payload.timecode,
        frame: payload.frame,
        timeSeconds: payload.seconds,
        timeTicks: payload.ticks
      }, sequence, qeSeq);
      if (targetTicks === null || isNaN(Number(targetTicks))) {
        return PremiereBridge._err("Invalid clip time selector");
      }
      targetTicks = Math.round(Number(targetTicks));
    }

    if (!selectedOnly && matchName === null && targetTicks === null) {
      return PremiereBridge._err("Provide selected, matchName, or one of timecode/frame/seconds/ticks");
    }

    function getTrack(collection, index) {
      if (!collection || index < 0) {
        return null;
      }
      try {
        if (collection[index]) {
          return collection[index];
        }
      } catch (errGetTrack) {
      }
      return null;
    }

    function trackLabel(clipKind, clipTrackIndex) {
      return (clipKind === "audio" ? "A" : "V") + String(Number(clipTrackIndex) + 1);
    }

    function clipName(clip) {
      if (!clip) {
        return null;
      }
      try {
        if (clip.name !== undefined && clip.name !== null) {
          return String(clip.name);
        }
      } catch (errClipName) {
      }
      try {
        if (clip.projectItem && clip.projectItem.name !== undefined && clip.projectItem.name !== null) {
          return String(clip.projectItem.name);
        }
      } catch (errProjectItemName) {
      }
      return null;
    }

    function clipProjectItem(clip) {
      try {
        if (clip && clip.projectItem) {
          return clip.projectItem;
        }
      } catch (errClipProjectItem) {
      }
      return null;
    }

    function clipNodeId(clip) {
      if (!clip) {
        return null;
      }
      try {
        if (clip.nodeId !== undefined && clip.nodeId !== null) {
          return String(clip.nodeId);
        }
      } catch (errClipNodeId) {
      }
      try {
        if (clip.id !== undefined && clip.id !== null) {
          return String(clip.id);
        }
      } catch (errClipLegacyId) {
      }
      return null;
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

    function summarizeClip(clip, clipKind, clipTrackIndex, clipIndex) {
      var projectItemRef = clipProjectItem(clip);
      var sourceName = null;
      try {
        if (projectItemRef && projectItemRef.name !== undefined && projectItemRef.name !== null) {
          sourceName = String(projectItemRef.name);
        }
      } catch (errSourceName) {
      }
      var startTicks = PremiereBridge._timeToTicks(clip && clip.start !== undefined ? clip.start : null);
      var endTicks = PremiereBridge._timeToTicks(clip && clip.end !== undefined ? clip.end : null);
      var inTicks = PremiereBridge._timeToTicks(clip && clip.inPoint !== undefined ? clip.inPoint : null);
      var outTicks = PremiereBridge._timeToTicks(clip && clip.outPoint !== undefined ? clip.outPoint : null);
      var durationTicks = null;
      if (startTicks !== null && endTicks !== null) {
        durationTicks = Math.max(0, Math.round(Number(endTicks) - Number(startTicks)));
      }
      return {
        kind: clipKind,
        trackIndex: clipTrackIndex,
        track: trackLabel(clipKind, clipTrackIndex),
        clipIndex: clipIndex,
        nodeId: clipNodeId(clip),
        name: clipName(clip),
        sourceName: sourceName,
        sourceNodeId: projectItemNodeId(projectItemRef),
        sourceMediaPath: projectItemMediaPath(projectItemRef),
        selected: PremiereBridge._clipSelectionState(clip),
        start: summarizeTicks(startTicks),
        end: summarizeTicks(endTicks),
        duration: summarizeTicks(durationTicks),
        source: {
          inPoint: summarizeTicks(inTicks),
          outPoint: summarizeTicks(outTicks)
        }
      };
    }

    function criteriaSummary() {
      return {
        replacementItemId: itemId,
        selected: selectedOnly,
        matchName: matchName,
        kind: kind,
        trackIndex: trackIndex,
        track: trackIndex !== null && kind ? trackLabel(kind, trackIndex) : null,
        timeTicks: targetTicks !== null ? String(targetTicks) : null,
        timecode: targetTicks !== null ? PremiereBridge._ticksToTimecode(targetTicks) : null
      };
    }

    function sourceMatchesReplacement(summary) {
      if (!summary) {
        return false;
      }
      if (found.nodeId && summary.sourceNodeId) {
        return String(summary.sourceNodeId) === String(found.nodeId);
      }
      if (found.id && summary.sourceNodeId) {
        return String(summary.sourceNodeId) === String(found.id);
      }
      if (found.item && found.item.name && summary.sourceName) {
        return String(summary.sourceName) === String(found.item.name);
      }
      return false;
    }

    function startAndDurationMatch(before, after) {
      if (!before || !after || before.start.ticks === null || after.start.ticks === null) {
        return false;
      }
      if (Number(before.start.ticks) !== Number(after.start.ticks)) {
        return false;
      }
      if (before.duration.ticks === null || after.duration.ticks === null) {
        return true;
      }
      return Math.abs(Number(before.duration.ticks) - Number(after.duration.ticks)) <= 2;
    }

    var matched = [];
    var requestedTrackFound = trackIndex === null;

    function collect(kindName, trackCollection) {
      if (!trackCollection) {
        return;
      }
      if (kind && kind !== kindName) {
        return;
      }
      var trackCount = PremiereBridge._collectionCount(trackCollection, 64);
      for (var t = 0; t < trackCount; t++) {
        if (trackIndex !== null && t !== trackIndex) {
          continue;
        }
        var track = null;
        try {
          track = trackCollection[t];
        } catch (errTrackGet) {
        }
        if (!track) {
          continue;
        }
        requestedTrackFound = true;
        if (!track.clips) {
          continue;
        }
        var clipCount = PremiereBridge._collectionCount(track.clips, 512);
        for (var c = 0; c < clipCount; c++) {
          var clip = null;
          try {
            clip = track.clips[c];
          } catch (errClipGet) {
          }
          if (!clip) {
            continue;
          }
          var summary = summarizeClip(clip, kindName, t, c);
          if (selectedOnly && !summary.selected) {
            continue;
          }
          if (matchName !== null && summary.name !== matchName && summary.sourceName !== matchName) {
            continue;
          }
          if (targetTicks !== null) {
            var startTicks = summary.start.ticks !== null ? Number(summary.start.ticks) : null;
            var endTicks = summary.end.ticks !== null ? Number(summary.end.ticks) : null;
            if (startTicks === null || endTicks === null) {
              continue;
            }
            if (!(targetTicks >= startTicks && targetTicks < endTicks)) {
              continue;
            }
          }
          matched.push({
            clip: clip,
            kind: kindName,
            trackIndex: t,
            clipIndex: c,
            before: summary
          });
        }
      }
    }

    collect("video", sequence.videoTracks);
    collect("audio", sequence.audioTracks);

    if (!requestedTrackFound) {
      return PremiereBridge._err(kind === "audio" ? "Audio track not found" : "Video track not found", {
        criteria: criteriaSummary()
      });
    }

    if (!matched.length) {
      return PremiereBridge._err("No clip instances matched the requested selector", {
        criteria: criteriaSummary(),
        replacementItem: itemSummary(found)
      });
    }

    if (matched.length > 1) {
      var ambiguous = [];
      var ambiguousLimit = Math.min(matched.length, 5);
      for (var a = 0; a < ambiguousLimit; a++) {
        ambiguous.push(matched[a].before);
      }
      return PremiereBridge._err("Multiple clip instances matched the requested selector. Narrow the selector.", {
        criteria: criteriaSummary(),
        replacementItem: itemSummary(found),
        matchCount: matched.length,
        matches: ambiguous
      });
    }

    var target = matched[0];
    if (payload.dryRun === true) {
      return PremiereBridge._ok({
        dryRun: true,
        skipped: true,
        criteria: criteriaSummary(),
        replacementItem: itemSummary(found),
        matchedCount: matched.length,
        target: target.before,
        available: {
          directReplaceWithClip: !!(target.clip && target.clip.replaceWithClip),
          directReplaceProjectItem: !!(target.clip && target.clip.replaceProjectItem),
          assignProjectItem: !!(target.clip && target.clip.projectItem !== undefined),
          trackOverwriteClip: !!(getTrack(target.kind === "audio" ? sequence.audioTracks : sequence.videoTracks, target.trackIndex) || {}).overwriteClip
        }
      });
    }

    if (sourceMatchesReplacement(target.before)) {
      return PremiereBridge._ok({
        criteria: criteriaSummary(),
        replacementItem: itemSummary(found),
        matchedCount: matched.length,
        unchangedCount: 1,
        changedCount: 0,
        target: {
          before: target.before,
          after: target.before
        },
        replace: {
          method: "noop",
          verified: true,
          reason: "Matched clip already uses the requested replacement item"
        }
      });
    }

    if (target.before.start.ticks === null || target.before.duration.ticks === null) {
      return PremiereBridge._err("Matched clip has no readable timeline start or duration", {
        criteria: criteriaSummary(),
        replacementItem: itemSummary(found),
        target: target.before
      });
    }

    function preserveInstanceName(clip, desiredName) {
      var result = { requestedName: desiredName || null, applied: false, method: null, error: null };
      if (!clip || !desiredName) {
        return result;
      }
      try {
        if (clip.name !== undefined && clip.name !== null && String(clip.name) === String(desiredName)) {
          result.applied = true;
          result.method = "noop";
          return result;
        }
      } catch (errNameRead) {
      }
      try {
        clip.name = String(desiredName);
        result.applied = true;
        result.method = "clip.name";
      } catch (errNameWrite) {
        result.error = String(errNameWrite);
      }
      return result;
    }

    var methodsTried = [];
    var fallbackErrors = [];
    var method = null;
    var replacementClip = target.clip;
    var after = null;

    function tryDirect(label, fn) {
      if (method) {
        return;
      }
      try {
        fn();
        methodsTried.push(label);
        var candidate = summarizeClip(target.clip, target.kind, target.trackIndex, target.clipIndex);
        if (sourceMatchesReplacement(candidate) && startAndDurationMatch(target.before, candidate)) {
          method = label;
          after = candidate;
          replacementClip = target.clip;
        } else {
          fallbackErrors.push(label + ": method returned but source replacement did not verify");
        }
      } catch (errDirect) {
        fallbackErrors.push(label + ": " + String(errDirect));
      }
    }

    if (target.clip && target.clip.replaceWithClip) {
      tryDirect("clip.replaceWithClip(projectItem)", function () {
        target.clip.replaceWithClip(found.item);
      });
    }
    if (target.clip && target.clip.replaceProjectItem) {
      tryDirect("clip.replaceProjectItem(projectItem)", function () {
        target.clip.replaceProjectItem(found.item);
      });
    }
    if (target.clip && target.clip.projectItem !== undefined) {
      tryDirect("clip.projectItem=", function () {
        target.clip.projectItem = found.item;
      });
    }

    function setReplacementProjectItemInOut(sourceInTicks, sourceOutTicks, mediaType) {
      var result = { ok: false, methods: [], errors: [], inTicks: String(sourceInTicks), outTicks: String(sourceOutTicks), mediaType: mediaType };
      if (!found.item) {
        result.errors.push("replacement projectItem unavailable");
        return result;
      }
      if (!found.item.setInPoint || !found.item.setOutPoint) {
        result.errors.push("replacement projectItem setInPoint/setOutPoint unavailable");
        return result;
      }
      try {
        found.item.setInPoint(String(sourceInTicks), mediaType);
        result.methods.push("projectItem.setInPoint(ticks," + String(mediaType) + ")");
      } catch (errSetIn) {
        result.errors.push("projectItem.setInPoint: " + String(errSetIn));
      }
      try {
        found.item.setOutPoint(String(sourceOutTicks), mediaType);
        result.methods.push("projectItem.setOutPoint(ticks," + String(mediaType) + ")");
      } catch (errSetOut) {
        result.errors.push("projectItem.setOutPoint: " + String(errSetOut));
      }
      result.ok = result.methods.length === 2;
      return result;
    }

    function findClipOnTargetTrack() {
      var track = getTrack(target.kind === "audio" ? sequence.audioTracks : sequence.videoTracks, target.trackIndex);
      if (!track || !track.clips) {
        return null;
      }
      var count = PremiereBridge._collectionCount(track.clips, 512);
      var fallback = null;
      for (var i = 0; i < count; i++) {
        var clip = null;
        try {
          clip = track.clips[i];
        } catch (errFindClip) {
        }
        if (!clip) {
          continue;
        }
        var summary = summarizeClip(clip, target.kind, target.trackIndex, i);
        if (!startAndDurationMatch(target.before, summary)) {
          continue;
        }
        var candidate = { clip: clip, summary: summary, clipIndex: i };
        if (sourceMatchesReplacement(summary)) {
          return candidate;
        }
        if (!fallback) {
          fallback = candidate;
        }
      }
      return fallback;
    }

    var sourceInTicks = 0;
    if (target.before.source && target.before.source.inPoint && target.before.source.inPoint.ticks !== null) {
      sourceInTicks = Math.max(0, Math.round(Number(target.before.source.inPoint.ticks)));
    }
    var durationTicks = target.before.duration && target.before.duration.ticks !== null
      ? Math.round(Number(target.before.duration.ticks))
      : 0;
    var sourceOutTicks = Math.max(sourceInTicks, sourceInTicks + Math.max(0, durationTicks));
    var mediaType = target.kind === "audio" ? 2 : 1;
    var projectItemInOut = null;

    if (!method) {
      var targetTrack = getTrack(target.kind === "audio" ? sequence.audioTracks : sequence.videoTracks, target.trackIndex);
      if (!targetTrack || !targetTrack.overwriteClip) {
        fallbackErrors.push("targetTrack.overwriteClip unavailable");
      } else {
        projectItemInOut = setReplacementProjectItemInOut(sourceInTicks, sourceOutTicks, mediaType);
        for (var pe = 0; projectItemInOut && pe < projectItemInOut.errors.length; pe++) {
          fallbackErrors.push(projectItemInOut.errors[pe]);
        }
        try {
          methodsTried.push((target.kind === "audio" ? "audioTrack" : "videoTrack") + ".overwriteClip(projectItem,ticks)");
          targetTrack.overwriteClip(found.item, String(target.before.start.ticks));
          var foundReplacement = findClipOnTargetTrack();
          if (foundReplacement && foundReplacement.summary && sourceMatchesReplacement(foundReplacement.summary) && startAndDurationMatch(target.before, foundReplacement.summary)) {
            method = (target.kind === "audio" ? "audioTrack" : "videoTrack") + ".overwriteClip(projectItem,ticks)";
            replacementClip = foundReplacement.clip;
            after = foundReplacement.summary;
          } else if (foundReplacement && foundReplacement.summary) {
            after = foundReplacement.summary;
            fallbackErrors.push("track overwrite returned but source/start/duration verification failed");
          } else {
            fallbackErrors.push("track overwrite returned but no candidate clip was found on the target track");
          }
        } catch (errOverwrite) {
          fallbackErrors.push("targetTrack.overwriteClip: " + String(errOverwrite));
        }
      }
    }

    var namePreservation = { requestedName: target.before.name, applied: false, method: null, error: null };
    if (method) {
      namePreservation = preserveInstanceName(replacementClip, target.before.name);
      after = summarizeClip(replacementClip, target.kind, target.trackIndex, after ? after.clipIndex : target.clipIndex);
    }

    if (!method || !after || !sourceMatchesReplacement(after) || !startAndDurationMatch(target.before, after)) {
      return PremiereBridge._err("Failed to replace clip source", {
        criteria: criteriaSummary(),
        replacementItem: itemSummary(found),
        matchedCount: matched.length,
        target: {
          before: target.before,
          after: after
        },
        replace: {
          method: method,
          methodsTried: methodsTried,
          verified: false,
          projectItemInOut: projectItemInOut,
          sourceInOut: {
            inPoint: summarizeTicks(sourceInTicks),
            outPoint: summarizeTicks(sourceOutTicks),
            mediaType: mediaType
          },
          namePreservation: namePreservation,
          errors: fallbackErrors
        }
      });
    }

    return PremiereBridge._ok({
      criteria: criteriaSummary(),
      replacementItem: itemSummary(found),
      matchedCount: matched.length,
      unchangedCount: 0,
      changedCount: 1,
      target: {
        before: target.before,
        after: after
      },
      replace: {
        method: method,
        methodsTried: methodsTried,
        verified: true,
        projectItemInOut: projectItemInOut,
        sourceInOut: {
          inPoint: summarizeTicks(sourceInTicks),
          outPoint: summarizeTicks(sourceOutTicks),
          mediaType: mediaType
        },
        namePreservation: namePreservation,
        fallbackErrors: fallbackErrors
      }
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

PremiereBridge.reloadProject = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var project = app.project;
    if (!project) {
      return PremiereBridge._err("No project loaded");
    }

    var projectPath = project.path;
    if (!projectPath) {
      return PremiereBridge._err("Project has no file path");
    }

    var activeBefore = null;
    try {
      var activeSeq = project.activeSequence;
      if (activeSeq) {
        activeBefore = {
          name: activeSeq.name ? String(activeSeq.name) : null,
          id: activeSeq.sequenceID ? String(activeSeq.sequenceID) : null
        };
      }
    } catch (errActiveBefore) {
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

    var openMethod = null;
    if (app.openDocument) {
      try {
        app.openDocument(file);
        openMethod = "app.openDocument(file)";
      } catch (openErr1) {
        try {
          app.openDocument(filePath);
          openMethod = "app.openDocument(path)";
        } catch (openErr2) {
        }
      }
    }

    if (!openMethod && app.openDocument2) {
      try {
        app.openDocument2(filePath);
        openMethod = "app.openDocument2";
      } catch (openErr3) {
      }
    }

    if (!openMethod) {
      return PremiereBridge._err("Reload is not supported by the current scripting API");
    }

    if ($ && $.sleep) {
      try {
        $.sleep(200);
      } catch (errSleep) {
      }
    }

    var restored = null;
    if (!payload.skipRestoreActiveSequence && activeBefore && (activeBefore.id || activeBefore.name)) {
      try {
        var restorePayload = activeBefore.id ? { id: activeBefore.id } : { name: activeBefore.name };
        var restoreRaw = PremiereBridge.openSequence(JSON.stringify(restorePayload));
        var restoreParsed = PremiereBridge._parse(restoreRaw);
        if (restoreParsed && restoreParsed.ok) {
          restored = {
            ok: true,
            sequence: restoreParsed.data && restoreParsed.data.sequence ? restoreParsed.data.sequence : restorePayload,
            method: restoreParsed.data && restoreParsed.data.methods ? restoreParsed.data.methods : null
          };
        } else {
          restored = {
            ok: false,
            error: restoreParsed && restoreParsed.error ? restoreParsed.error : "restore failed"
          };
        }
      } catch (errRestore) {
        restored = { ok: false, error: String(errRestore) };
      }
    }

    return PremiereBridge._ok({
      method: openMethod,
      restoredActiveSequence: restored,
      activeBefore: activeBefore
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.renameClipInstances = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var sequence = app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }

    var desiredName = payload.name !== undefined && payload.name !== null ? String(payload.name) : "";
    if (!desiredName.replace(/^\s+|\s+$/g, "")) {
      return PremiereBridge._err("name must be a non-empty string");
    }

    var renameAllMatches = payload.allMatches === true;
    var selectedOnly = payload.selected === true;
    var matchName = null;
    if (payload.matchName !== undefined && payload.matchName !== null) {
      matchName = String(payload.matchName);
      if (!matchName.replace(/^\s+|\s+$/g, "")) {
        return PremiereBridge._err("matchName must be a non-empty string");
      }
    }

    var trackIndex = null;
    var kind = payload.kind ? String(payload.kind).toLowerCase() : null;
    if (payload.track !== undefined && payload.track !== null) {
      var trackStr = String(payload.track).toUpperCase();
      if (trackStr.indexOf("V") === 0) {
        trackIndex = Number(trackStr.slice(1)) - 1;
        if (!kind) {
          kind = "video";
        }
      } else if (trackStr.indexOf("A") === 0) {
        trackIndex = Number(trackStr.slice(1)) - 1;
        if (!kind) {
          kind = "audio";
        }
      } else {
        trackIndex = Number(trackStr) - 1;
      }
    } else if (payload.trackNumber !== undefined && payload.trackNumber !== null) {
      trackIndex = Number(payload.trackNumber) - 1;
    } else if (payload.trackIndex !== undefined && payload.trackIndex !== null) {
      trackIndex = Number(payload.trackIndex);
    }

    if (trackIndex !== null) {
      if (isNaN(trackIndex) || trackIndex < 0 || Math.round(trackIndex) !== trackIndex) {
        return PremiereBridge._err("Invalid track identifier");
      }
      if (!kind) {
        return PremiereBridge._err("Track selector requires kind. Use --track V1|A1 or provide --kind video|audio.");
      }
    }
    if (kind && kind !== "video" && kind !== "audio") {
      return PremiereBridge._err("Invalid track kind; use video or audio");
    }

    var hasTimeSelector =
      payload.timecode !== undefined ||
      payload.frame !== undefined ||
      payload.seconds !== undefined ||
      payload.ticks !== undefined;
    var qeSeq = PremiereBridge._getQeSequence();
    var targetTicks = null;
    if (hasTimeSelector) {
      targetTicks = PremiereBridge._markerPayloadToTicks({
        timecode: payload.timecode,
        frame: payload.frame,
        timeSeconds: payload.seconds,
        timeTicks: payload.ticks
      }, sequence, qeSeq);
      if (targetTicks === null || isNaN(Number(targetTicks))) {
        return PremiereBridge._err("Invalid clip time selector");
      }
      targetTicks = Math.round(Number(targetTicks));
    }

    if (!selectedOnly && matchName === null && targetTicks === null) {
      return PremiereBridge._err("Provide selected, matchName, or one of timecode/frame/seconds/ticks");
    }

    function trackLabel(clipKind, clipTrackIndex) {
      return (clipKind === "audio" ? "A" : "V") + String(Number(clipTrackIndex) + 1);
    }

    function clipName(clip) {
      if (!clip) {
        return null;
      }
      try {
        if (clip.name !== undefined && clip.name !== null) {
          return String(clip.name);
        }
      } catch (errClipName) {
      }
      try {
        if (clip.projectItem && clip.projectItem.name !== undefined && clip.projectItem.name !== null) {
          return String(clip.projectItem.name);
        }
      } catch (errProjectItemName) {
      }
      return null;
    }

    function clipSourceName(clip) {
      if (!clip) {
        return null;
      }
      try {
        if (clip.projectItem && clip.projectItem.name !== undefined && clip.projectItem.name !== null) {
          return String(clip.projectItem.name);
        }
      } catch (errProjectItemName2) {
      }
      return null;
    }

    function clipNodeId(clip) {
      if (!clip) {
        return null;
      }
      try {
        if (clip.nodeId !== undefined && clip.nodeId !== null) {
          return String(clip.nodeId);
        }
      } catch (errNodeId) {
      }
      try {
        if (clip.id !== undefined && clip.id !== null) {
          return String(clip.id);
        }
      } catch (errLegacyId) {
      }
      return null;
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

    function summarizeClip(clip, clipKind, clipTrackIndex, clipIndex) {
      var startTicks = PremiereBridge._timeToTicks(clip && clip.start !== undefined ? clip.start : null);
      var endTicks = PremiereBridge._timeToTicks(clip && clip.end !== undefined ? clip.end : null);
      return {
        kind: clipKind,
        trackIndex: clipTrackIndex,
        track: trackLabel(clipKind, clipTrackIndex),
        clipIndex: clipIndex,
        nodeId: clipNodeId(clip),
        name: clipName(clip),
        sourceName: clipSourceName(clip),
        selected: PremiereBridge._clipSelectionState(clip),
        start: summarizeTicks(startTicks),
        end: summarizeTicks(endTicks)
      };
    }

    function criteriaSummary() {
      return {
        requestedName: desiredName,
        selected: selectedOnly,
        matchName: matchName,
        kind: kind,
        trackIndex: trackIndex,
        track: trackIndex !== null && kind ? trackLabel(kind, trackIndex) : null,
        timeTicks: targetTicks !== null ? String(targetTicks) : null,
        timecode: targetTicks !== null ? PremiereBridge._ticksToTimecode(targetTicks) : null,
        allMatches: renameAllMatches
      };
    }

    var matched = [];
    var requestedTrackFound = trackIndex === null;

    function collect(kindName, trackCollection) {
      if (!trackCollection) {
        return;
      }
      if (kind && kind !== kindName) {
        return;
      }
      var trackCount = PremiereBridge._collectionCount(trackCollection, 64);
      for (var t = 0; t < trackCount; t++) {
        if (trackIndex !== null && t !== trackIndex) {
          continue;
        }
        var track = null;
        try {
          track = trackCollection[t];
        } catch (errTrackGet) {
        }
        if (!track) {
          continue;
        }
        requestedTrackFound = true;
        if (!track.clips) {
          continue;
        }
        var clipCount = PremiereBridge._collectionCount(track.clips, 512);
        for (var c = 0; c < clipCount; c++) {
          var clip = null;
          try {
            clip = track.clips[c];
          } catch (errClipGet) {
          }
          if (!clip) {
            continue;
          }
          var summary = summarizeClip(clip, kindName, t, c);
          if (selectedOnly && !summary.selected) {
            continue;
          }
          if (matchName !== null && summary.name !== matchName) {
            continue;
          }
          if (targetTicks !== null) {
            var startTicks = summary.start.ticks !== null ? Number(summary.start.ticks) : null;
            var endTicks = summary.end.ticks !== null ? Number(summary.end.ticks) : null;
            if (startTicks === null || endTicks === null) {
              continue;
            }
            if (!(targetTicks >= startTicks && targetTicks < endTicks)) {
              continue;
            }
          }
          matched.push({
            clip: clip,
            kind: kindName,
            trackIndex: t,
            clipIndex: c,
            before: summary
          });
        }
      }
    }

    collect("video", sequence.videoTracks);
    collect("audio", sequence.audioTracks);

    if (!requestedTrackFound) {
      return PremiereBridge._err(kind === "audio" ? "Audio track not found" : "Video track not found", {
        criteria: criteriaSummary()
      });
    }

    if (!matched.length) {
      return PremiereBridge._err("No clip instances matched the requested selector", {
        criteria: criteriaSummary()
      });
    }

    if (!renameAllMatches && matched.length > 1) {
      var ambiguous = [];
      var ambiguousLimit = Math.min(matched.length, 5);
      for (var a = 0; a < ambiguousLimit; a++) {
        ambiguous.push(matched[a].before);
      }
      return PremiereBridge._err("Multiple clip instances matched the requested selector. Add --all-matches or narrow the selector.", {
        criteria: criteriaSummary(),
        matchCount: matched.length,
        matches: ambiguous
      });
    }

    var targets = renameAllMatches ? matched : [matched[0]];
    if (payload.dryRun === true) {
      var dryRunMatches = [];
      for (var d = 0; d < targets.length; d++) {
        dryRunMatches.push(targets[d].before);
      }
      return PremiereBridge._ok({
        dryRun: true,
        skipped: true,
        criteria: criteriaSummary(),
        matchedCount: matched.length,
        targetCount: targets.length,
        matches: dryRunMatches
      });
    }

    var renamed = [];
    var unchanged = [];
    var errors = [];
    for (var i = 0; i < targets.length; i++) {
      var target = targets[i];
      if (target.before.name === desiredName) {
        unchanged.push({
          method: "noop",
          before: target.before,
          after: target.before
        });
        continue;
      }

      var method = null;
      var renameError = null;
      try {
        target.clip.name = desiredName;
        method = "clip.name";
      } catch (errRename) {
        renameError = String(errRename);
      }

      var after = summarizeClip(target.clip, target.kind, target.trackIndex, target.clipIndex);
      if (!renameError && after.name === desiredName) {
        renamed.push({
          method: method,
          before: target.before,
          after: after
        });
      } else {
        errors.push({
          method: method,
          before: target.before,
          after: after,
          error: renameError || "Clip instance name did not update"
        });
      }
    }

    if (errors.length) {
      return PremiereBridge._err("Failed to rename one or more clip instances", {
        criteria: criteriaSummary(),
        matchedCount: matched.length,
        targetCount: targets.length,
        renamedCount: renamed.length,
        unchangedCount: unchanged.length,
        renamed: renamed,
        unchanged: unchanged,
        errors: errors
      });
    }

    return PremiereBridge._ok({
      criteria: criteriaSummary(),
      matchedCount: matched.length,
      targetCount: targets.length,
      renamedCount: renamed.length,
      unchangedCount: unchanged.length,
      renamed: renamed,
      unchanged: unchanged
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.setClipState = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var sequence = app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }

    if (payload.enabled === undefined || payload.enabled === null) {
      return PremiereBridge._err("enabled must be provided");
    }
    var desiredEnabled = payload.enabled === true || payload.enabled === 1 || String(payload.enabled).toLowerCase() === "true";
    var stateAllMatches = payload.allMatches === true;
    var selectedOnly = payload.selected === true;
    var matchName = null;
    if (payload.matchName !== undefined && payload.matchName !== null) {
      matchName = String(payload.matchName);
      if (!matchName.replace(/^\s+|\s+$/g, "")) {
        return PremiereBridge._err("matchName must be a non-empty string");
      }
    }

    var trackIndex = null;
    var kind = payload.kind ? String(payload.kind).toLowerCase() : null;
    if (payload.track !== undefined && payload.track !== null) {
      var trackStr = String(payload.track).toUpperCase();
      if (trackStr.indexOf("V") === 0) {
        trackIndex = Number(trackStr.slice(1)) - 1;
        if (!kind) {
          kind = "video";
        }
      } else if (trackStr.indexOf("A") === 0) {
        trackIndex = Number(trackStr.slice(1)) - 1;
        if (!kind) {
          kind = "audio";
        }
      } else {
        trackIndex = Number(trackStr) - 1;
      }
    } else if (payload.trackNumber !== undefined && payload.trackNumber !== null) {
      trackIndex = Number(payload.trackNumber) - 1;
    } else if (payload.trackIndex !== undefined && payload.trackIndex !== null) {
      trackIndex = Number(payload.trackIndex);
    }

    if (trackIndex !== null) {
      if (isNaN(trackIndex) || trackIndex < 0 || Math.round(trackIndex) !== trackIndex) {
        return PremiereBridge._err("Invalid track identifier");
      }
      if (!kind) {
        return PremiereBridge._err("Track selector requires kind. Use --track V1|A1 or provide --kind video|audio.");
      }
    }
    if (kind && kind !== "video" && kind !== "audio") {
      return PremiereBridge._err("Invalid track kind; use video or audio");
    }

    var hasTimeSelector =
      payload.timecode !== undefined ||
      payload.frame !== undefined ||
      payload.seconds !== undefined ||
      payload.ticks !== undefined;
    var qeSeq = PremiereBridge._getQeSequence();
    var targetTicks = null;
    if (hasTimeSelector) {
      targetTicks = PremiereBridge._markerPayloadToTicks({
        timecode: payload.timecode,
        frame: payload.frame,
        timeSeconds: payload.seconds,
        timeTicks: payload.ticks
      }, sequence, qeSeq);
      if (targetTicks === null || isNaN(Number(targetTicks))) {
        return PremiereBridge._err("Invalid clip time selector");
      }
      targetTicks = Math.round(Number(targetTicks));
    }

    if (!selectedOnly && matchName === null && targetTicks === null) {
      return PremiereBridge._err("Provide selected, matchName, or one of timecode/frame/seconds/ticks");
    }

    function trackLabel(clipKind, clipTrackIndex) {
      return (clipKind === "audio" ? "A" : "V") + String(Number(clipTrackIndex) + 1);
    }

    function boolish(value) {
      if (value === true || value === false) {
        return value;
      }
      if (value === 1 || value === 0) {
        return value === 1;
      }
      var normalized = String(value).toLowerCase();
      if (normalized === "true" || normalized === "1" || normalized === "yes") {
        return true;
      }
      if (normalized === "false" || normalized === "0" || normalized === "no") {
        return false;
      }
      return !!value;
    }

    function clipEnabledState(clip) {
      var raw = null;
      var method = null;
      try {
        if (clip && clip.disabled !== undefined && clip.disabled !== null) {
          raw = clip.disabled;
          method = "clip.disabled";
          return { enabled: !boolish(raw), disabled: boolish(raw), method: method, raw: String(raw) };
        }
      } catch (errDisabled) {
      }
      try {
        if (clip && clip.enabled !== undefined && clip.enabled !== null) {
          raw = clip.enabled;
          method = "clip.enabled";
          return { enabled: boolish(raw), disabled: !boolish(raw), method: method, raw: String(raw) };
        }
      } catch (errEnabledProp) {
      }
      try {
        if (clip && clip.isEnabled) {
          raw = clip.isEnabled();
          method = "clip.isEnabled()";
          return { enabled: boolish(raw), disabled: !boolish(raw), method: method, raw: String(raw) };
        }
      } catch (errIsEnabled) {
      }
      try {
        if (clip && clip.isDisabled) {
          raw = clip.isDisabled();
          method = "clip.isDisabled()";
          return { enabled: !boolish(raw), disabled: boolish(raw), method: method, raw: String(raw) };
        }
      } catch (errIsDisabled) {
      }
      return { enabled: null, disabled: null, method: null, raw: null };
    }

    function clipName(clip) {
      if (!clip) {
        return null;
      }
      try {
        if (clip.name !== undefined && clip.name !== null) {
          return String(clip.name);
        }
      } catch (errClipName) {
      }
      try {
        if (clip.projectItem && clip.projectItem.name !== undefined && clip.projectItem.name !== null) {
          return String(clip.projectItem.name);
        }
      } catch (errProjectItemName) {
      }
      return null;
    }

    function clipSourceName(clip) {
      if (!clip) {
        return null;
      }
      try {
        if (clip.projectItem && clip.projectItem.name !== undefined && clip.projectItem.name !== null) {
          return String(clip.projectItem.name);
        }
      } catch (errProjectItemName2) {
      }
      return null;
    }

    function clipNodeId(clip) {
      if (!clip) {
        return null;
      }
      try {
        if (clip.nodeId !== undefined && clip.nodeId !== null) {
          return String(clip.nodeId);
        }
      } catch (errNodeId) {
      }
      try {
        if (clip.id !== undefined && clip.id !== null) {
          return String(clip.id);
        }
      } catch (errLegacyId) {
      }
      return null;
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

    function summarizeClip(clip, clipKind, clipTrackIndex, clipIndex) {
      var startTicks = PremiereBridge._timeToTicks(clip && clip.start !== undefined ? clip.start : null);
      var endTicks = PremiereBridge._timeToTicks(clip && clip.end !== undefined ? clip.end : null);
      return {
        kind: clipKind,
        trackIndex: clipTrackIndex,
        track: trackLabel(clipKind, clipTrackIndex),
        clipIndex: clipIndex,
        nodeId: clipNodeId(clip),
        name: clipName(clip),
        sourceName: clipSourceName(clip),
        selected: PremiereBridge._clipSelectionState(clip),
        state: clipEnabledState(clip),
        start: summarizeTicks(startTicks),
        end: summarizeTicks(endTicks)
      };
    }

    function criteriaSummary() {
      return {
        requestedEnabled: desiredEnabled,
        selected: selectedOnly,
        matchName: matchName,
        kind: kind,
        trackIndex: trackIndex,
        track: trackIndex !== null && kind ? trackLabel(kind, trackIndex) : null,
        timeTicks: targetTicks !== null ? String(targetTicks) : null,
        timecode: targetTicks !== null ? PremiereBridge._ticksToTimecode(targetTicks) : null,
        allMatches: stateAllMatches
      };
    }

    function setEnabledState(clip, nextEnabled) {
      var errors = [];
      try {
        if (clip && clip.disabled !== undefined) {
          clip.disabled = nextEnabled ? 0 : 1;
          return { ok: true, method: "clip.disabled", errors: errors };
        }
      } catch (errDisabledSet) {
        errors.push("clip.disabled: " + String(errDisabledSet));
      }
      try {
        if (clip && clip.enabled !== undefined) {
          clip.enabled = nextEnabled ? 1 : 0;
          return { ok: true, method: "clip.enabled", errors: errors };
        }
      } catch (errEnabledSet) {
        errors.push("clip.enabled: " + String(errEnabledSet));
      }
      try {
        if (clip && clip.setEnabled) {
          clip.setEnabled(nextEnabled ? 1 : 0);
          return { ok: true, method: "clip.setEnabled", errors: errors };
        }
      } catch (errSetEnabled) {
        errors.push("clip.setEnabled: " + String(errSetEnabled));
      }
      try {
        if (clip && clip.setDisabled) {
          clip.setDisabled(nextEnabled ? 0 : 1);
          return { ok: true, method: "clip.setDisabled", errors: errors };
        }
      } catch (errSetDisabled) {
        errors.push("clip.setDisabled: " + String(errSetDisabled));
      }
      try {
        if (clip && nextEnabled && clip.enable) {
          clip.enable();
          return { ok: true, method: "clip.enable", errors: errors };
        }
        if (clip && !nextEnabled && clip.disable) {
          clip.disable();
          return { ok: true, method: "clip.disable", errors: errors };
        }
      } catch (errEnableDisable) {
        errors.push("clip.enable/disable: " + String(errEnableDisable));
      }
      return { ok: false, method: null, errors: errors };
    }

    var matched = [];
    var requestedTrackFound = trackIndex === null;

    function collect(kindName, trackCollection) {
      if (!trackCollection) {
        return;
      }
      if (kind && kind !== kindName) {
        return;
      }
      var trackCount = PremiereBridge._collectionCount(trackCollection, 64);
      for (var t = 0; t < trackCount; t++) {
        if (trackIndex !== null && t !== trackIndex) {
          continue;
        }
        var track = null;
        try {
          track = trackCollection[t];
        } catch (errTrackGet) {
        }
        if (!track) {
          continue;
        }
        requestedTrackFound = true;
        if (!track.clips) {
          continue;
        }
        var clipCount = PremiereBridge._collectionCount(track.clips, 512);
        for (var c = 0; c < clipCount; c++) {
          var clip = null;
          try {
            clip = track.clips[c];
          } catch (errClipGet) {
          }
          if (!clip) {
            continue;
          }
          var summary = summarizeClip(clip, kindName, t, c);
          if (selectedOnly && !summary.selected) {
            continue;
          }
          if (matchName !== null && summary.name !== matchName) {
            continue;
          }
          if (targetTicks !== null) {
            var startTicks = summary.start.ticks !== null ? Number(summary.start.ticks) : null;
            var endTicks = summary.end.ticks !== null ? Number(summary.end.ticks) : null;
            if (startTicks === null || endTicks === null) {
              continue;
            }
            if (!(targetTicks >= startTicks && targetTicks < endTicks)) {
              continue;
            }
          }
          matched.push({
            clip: clip,
            kind: kindName,
            trackIndex: t,
            clipIndex: c,
            before: summary
          });
        }
      }
    }

    collect("video", sequence.videoTracks);
    collect("audio", sequence.audioTracks);

    if (!requestedTrackFound) {
      return PremiereBridge._err(kind === "audio" ? "Audio track not found" : "Video track not found", {
        criteria: criteriaSummary()
      });
    }

    if (!matched.length) {
      return PremiereBridge._err("No clip instances matched the requested selector", {
        criteria: criteriaSummary()
      });
    }

    if (!stateAllMatches && matched.length > 1) {
      var ambiguous = [];
      var ambiguousLimit = Math.min(matched.length, 5);
      for (var a = 0; a < ambiguousLimit; a++) {
        ambiguous.push(matched[a].before);
      }
      return PremiereBridge._err("Multiple clip instances matched the requested selector. Add --all-matches or narrow the selector.", {
        criteria: criteriaSummary(),
        matchCount: matched.length,
        matches: ambiguous
      });
    }

    var targets = stateAllMatches ? matched : [matched[0]];
    if (payload.dryRun === true) {
      var dryRunMatches = [];
      for (var d = 0; d < targets.length; d++) {
        dryRunMatches.push(targets[d].before);
      }
      return PremiereBridge._ok({
        dryRun: true,
        skipped: true,
        criteria: criteriaSummary(),
        matchedCount: matched.length,
        targetCount: targets.length,
        matches: dryRunMatches
      });
    }

    var changed = [];
    var unchanged = [];
    var errors = [];
    for (var i = 0; i < targets.length; i++) {
      var target = targets[i];
      if (target.before.state && target.before.state.enabled === desiredEnabled) {
        unchanged.push({
          method: "noop",
          before: target.before,
          after: target.before
        });
        continue;
      }

      var setResult = setEnabledState(target.clip, desiredEnabled);
      var after = summarizeClip(target.clip, target.kind, target.trackIndex, target.clipIndex);
      if (setResult.ok && after.state && after.state.enabled === desiredEnabled) {
        changed.push({
          method: setResult.method,
          before: target.before,
          after: after,
          fallbackErrors: setResult.errors
        });
      } else {
        errors.push({
          method: setResult.method,
          before: target.before,
          after: after,
          error: setResult.ok ? "Clip enabled state did not update" : "No supported clip state setter",
          fallbackErrors: setResult.errors
        });
      }
    }

    if (errors.length) {
      return PremiereBridge._err("Failed to set one or more clip instance states", {
        criteria: criteriaSummary(),
        matchedCount: matched.length,
        targetCount: targets.length,
        changedCount: changed.length,
        unchangedCount: unchanged.length,
        changed: changed,
        unchanged: unchanged,
        errors: errors
      });
    }

    return PremiereBridge._ok({
      criteria: criteriaSummary(),
      matchedCount: matched.length,
      targetCount: targets.length,
      changedCount: changed.length,
      unchangedCount: unchanged.length,
      changed: changed,
      unchanged: unchanged
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.setClipSpeedDuration = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var sequence = app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }

    var updateCount = 0;
    if (payload.speed !== undefined && payload.speed !== null) {
      updateCount++;
    }
    if (payload.speedPercent !== undefined && payload.speedPercent !== null) {
      updateCount++;
    }
    if (payload.durationSeconds !== undefined && payload.durationSeconds !== null) {
      updateCount++;
    }
    if (payload.durationTicks !== undefined && payload.durationTicks !== null) {
      updateCount++;
    }
    if (updateCount !== 1) {
      return PremiereBridge._err("Provide exactly one speed/duration update");
    }

    var speedAllMatches = payload.allMatches === true;
    var selectedOnly = payload.selected === true;
    var matchName = null;
    if (payload.matchName !== undefined && payload.matchName !== null) {
      matchName = String(payload.matchName);
      if (!matchName.replace(/^\s+|\s+$/g, "")) {
        return PremiereBridge._err("matchName must be a non-empty string");
      }
    }

    var trackIndex = null;
    var kind = payload.kind ? String(payload.kind).toLowerCase() : null;
    if (payload.track !== undefined && payload.track !== null) {
      var trackStr = String(payload.track).toUpperCase();
      if (trackStr.indexOf("V") === 0) {
        trackIndex = Number(trackStr.slice(1)) - 1;
        if (!kind) {
          kind = "video";
        }
      } else if (trackStr.indexOf("A") === 0) {
        trackIndex = Number(trackStr.slice(1)) - 1;
        if (!kind) {
          kind = "audio";
        }
      } else {
        trackIndex = Number(trackStr) - 1;
      }
    } else if (payload.trackNumber !== undefined && payload.trackNumber !== null) {
      trackIndex = Number(payload.trackNumber) - 1;
    } else if (payload.trackIndex !== undefined && payload.trackIndex !== null) {
      trackIndex = Number(payload.trackIndex);
    }

    if (trackIndex !== null) {
      if (isNaN(trackIndex) || trackIndex < 0 || Math.round(trackIndex) !== trackIndex) {
        return PremiereBridge._err("Invalid track identifier");
      }
      if (!kind) {
        return PremiereBridge._err("Track selector requires kind. Use --track V1|A1 or provide --kind video|audio.");
      }
    }
    if (kind && kind !== "video" && kind !== "audio") {
      return PremiereBridge._err("Invalid track kind; use video or audio");
    }

    var hasTimeSelector =
      payload.timecode !== undefined ||
      payload.frame !== undefined ||
      payload.seconds !== undefined ||
      payload.ticks !== undefined;
    var qeSeq = PremiereBridge._getQeSequence();
    var targetTicks = null;
    if (hasTimeSelector) {
      targetTicks = PremiereBridge._markerPayloadToTicks({
        timecode: payload.timecode,
        frame: payload.frame,
        timeSeconds: payload.seconds,
        timeTicks: payload.ticks
      }, sequence, qeSeq);
      if (targetTicks === null || isNaN(Number(targetTicks))) {
        return PremiereBridge._err("Invalid clip time selector");
      }
      targetTicks = Math.round(Number(targetTicks));
    }

    if (!selectedOnly && matchName === null && targetTicks === null) {
      return PremiereBridge._err("Provide selected, matchName, or one of timecode/frame/seconds/ticks");
    }

    function trackLabel(clipKind, clipTrackIndex) {
      return (clipKind === "audio" ? "A" : "V") + String(Number(clipTrackIndex) + 1);
    }

    function boolish(value) {
      if (value === true || value === false) {
        return value;
      }
      if (value === 1 || value === 0) {
        return value === 1;
      }
      var normalized = String(value).toLowerCase();
      if (normalized === "true" || normalized === "1" || normalized === "yes") {
        return true;
      }
      if (normalized === "false" || normalized === "0" || normalized === "no") {
        return false;
      }
      return !!value;
    }

    function numericOrNull(value) {
      if (value === null || value === undefined) {
        return null;
      }
      var n = Number(value);
      if (isNaN(n)) {
        return null;
      }
      return n;
    }

    function timeValueToTicks(value) {
      try {
        return PremiereBridge._timeToTicks(value);
      } catch (errTimeToTicks) {
      }
      try {
        if (value && value.ticks !== undefined && value.ticks !== null) {
          return numericOrNull(value.ticks);
        }
      } catch (errTicks) {
      }
      try {
        if (value && value.seconds !== undefined && value.seconds !== null) {
          var seconds = numericOrNull(value.seconds);
          return seconds !== null ? seconds * PremiereBridge.TICKS_PER_SECOND : null;
        }
      } catch (errSeconds) {
      }
      return numericOrNull(value);
    }

    function clipName(clip) {
      if (!clip) {
        return null;
      }
      try {
        if (clip.name !== undefined && clip.name !== null) {
          return String(clip.name);
        }
      } catch (errClipName) {
      }
      try {
        if (clip.projectItem && clip.projectItem.name !== undefined && clip.projectItem.name !== null) {
          return String(clip.projectItem.name);
        }
      } catch (errProjectItemName) {
      }
      return null;
    }

    function clipSourceName(clip) {
      if (!clip) {
        return null;
      }
      try {
        if (clip.projectItem && clip.projectItem.name !== undefined && clip.projectItem.name !== null) {
          return String(clip.projectItem.name);
        }
      } catch (errProjectItemName2) {
      }
      return null;
    }

    function clipNodeId(clip) {
      if (!clip) {
        return null;
      }
      try {
        if (clip.nodeId !== undefined && clip.nodeId !== null) {
          return String(clip.nodeId);
        }
      } catch (errNodeId) {
      }
      try {
        if (clip.id !== undefined && clip.id !== null) {
          return String(clip.id);
        }
      } catch (errLegacyId) {
      }
      return null;
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

    function speedState(clip) {
      var raw = null;
      var speed = null;
      var reversed = null;
      var errors = [];
      try {
        if (clip && clip.getSpeed) {
          raw = clip.getSpeed();
          speed = numericOrNull(raw);
        }
      } catch (errGetSpeed) {
        errors.push("clip.getSpeed(): " + String(errGetSpeed));
      }
      try {
        if (clip && clip.isSpeedReversed) {
          reversed = boolish(clip.isSpeedReversed());
        }
      } catch (errIsSpeedReversed) {
        errors.push("clip.isSpeedReversed(): " + String(errIsSpeedReversed));
      }
      return {
        speed: speed,
        speedPercent: speed !== null ? speed * 100 : null,
        reversed: reversed,
        method: clip && clip.getSpeed ? "clip.getSpeed()" : null,
        raw: raw !== null && raw !== undefined ? String(raw) : null,
        errors: errors
      };
    }

    function summarizeClip(clip, clipKind, clipTrackIndex, clipIndex) {
      var startTicks = timeValueToTicks(clip && clip.start !== undefined ? clip.start : null);
      var endTicks = timeValueToTicks(clip && clip.end !== undefined ? clip.end : null);
      var durationTicks = null;
      if (startTicks !== null && endTicks !== null) {
        durationTicks = Math.max(0, Math.round(Number(endTicks) - Number(startTicks)));
      }
      return {
        kind: clipKind,
        trackIndex: clipTrackIndex,
        track: trackLabel(clipKind, clipTrackIndex),
        clipIndex: clipIndex,
        nodeId: clipNodeId(clip),
        name: clipName(clip),
        sourceName: clipSourceName(clip),
        selected: PremiereBridge._clipSelectionState(clip),
        speed: speedState(clip),
        start: summarizeTicks(startTicks),
        end: summarizeTicks(endTicks),
        duration: summarizeTicks(durationTicks)
      };
    }

    function requestedUpdateFromSummary(summary) {
      var durationTicks = summary && summary.duration && summary.duration.ticks !== null ? Number(summary.duration.ticks) : null;
      var currentSpeed = summary && summary.speed && summary.speed.speed !== null ? Number(summary.speed.speed) : 1;
      var requestedDurationTicks = null;
      var requestedSpeed = null;
      var source = null;

      if (payload.speed !== undefined && payload.speed !== null) {
        requestedSpeed = Number(payload.speed);
        source = "speed";
      } else if (payload.speedPercent !== undefined && payload.speedPercent !== null) {
        requestedSpeed = Number(payload.speedPercent) / 100;
        source = "speedPercent";
      } else if (payload.durationSeconds !== undefined && payload.durationSeconds !== null) {
        requestedDurationTicks = Math.round(Number(payload.durationSeconds) * PremiereBridge.TICKS_PER_SECOND);
        source = "durationSeconds";
      } else if (payload.durationTicks !== undefined && payload.durationTicks !== null) {
        requestedDurationTicks = Math.round(Number(payload.durationTicks));
        source = "durationTicks";
      }

      if (requestedDurationTicks !== null) {
        if (durationTicks === null || durationTicks <= 0) {
          return { ok: false, error: "Unable to compute current clip duration for duration-based speed update" };
        }
        if (requestedDurationTicks <= 0) {
          return { ok: false, error: "Requested duration must be positive" };
        }
        requestedSpeed = currentSpeed * (durationTicks / requestedDurationTicks);
      }

      if (requestedSpeed === null || isNaN(Number(requestedSpeed)) || Number(requestedSpeed) <= 0) {
        return { ok: false, error: "Requested speed must be positive" };
      }

      return {
        ok: true,
        speed: Number(requestedSpeed),
        speedPercent: Number(requestedSpeed) * 100,
        durationTicks: requestedDurationTicks,
        duration: summarizeTicks(requestedDurationTicks),
        source: source,
        reverse: payload.reverse !== undefined && payload.reverse !== null
          ? boolish(payload.reverse)
          : (summary && summary.speed ? summary.speed.reversed : false),
        preserveAudioPitch: payload.preserveAudioPitch !== undefined && payload.preserveAudioPitch !== null
          ? boolish(payload.preserveAudioPitch)
          : true,
        ripple: payload.ripple === true
      };
    }

    function criteriaSummary() {
      return {
        selected: selectedOnly,
        matchName: matchName,
        kind: kind,
        trackIndex: trackIndex,
        track: trackIndex !== null && kind ? trackLabel(kind, trackIndex) : null,
        timeTicks: targetTicks !== null ? String(targetTicks) : null,
        timecode: targetTicks !== null ? PremiereBridge._ticksToTimecode(targetTicks) : null,
        allMatches: speedAllMatches,
        speed: payload.speed !== undefined ? payload.speed : null,
        speedPercent: payload.speedPercent !== undefined ? payload.speedPercent : null,
        durationSeconds: payload.durationSeconds !== undefined ? payload.durationSeconds : null,
        durationTicks: payload.durationTicks !== undefined ? payload.durationTicks : null,
        reverse: payload.reverse !== undefined ? payload.reverse : null,
        preserveAudioPitch: payload.preserveAudioPitch !== undefined ? payload.preserveAudioPitch : true,
        ripple: payload.ripple === true
      };
    }

    function tickTolerance() {
      var oneFrameTicks = null;
      try {
        oneFrameTicks = PremiereBridge._frameToTicks(1, sequence, qeSeq) - PremiereBridge._frameToTicks(0, sequence, qeSeq);
      } catch (errFrameTicks) {
      }
      if (oneFrameTicks === null || isNaN(Number(oneFrameTicks)) || Number(oneFrameTicks) <= 0) {
        oneFrameTicks = PremiereBridge.TICKS_PER_SECOND / 60;
      }
      return Math.max(2, Math.round(Number(oneFrameTicks) / 2));
    }

    function closeEnoughNumber(actual, expected) {
      if (actual === null || actual === undefined || expected === null || expected === undefined) {
        return false;
      }
      var a = Number(actual);
      var e = Number(expected);
      if (isNaN(a) || isNaN(e)) {
        return false;
      }
      return Math.abs(a - e) <= Math.max(0.005, Math.abs(e) * 0.005);
    }

    function closeEnoughTicks(actual, expected) {
      if (actual === null || actual === undefined || expected === null || expected === undefined) {
        return false;
      }
      var a = Number(actual);
      var e = Number(expected);
      if (isNaN(a) || isNaN(e)) {
        return false;
      }
      return Math.abs(a - e) <= tickTolerance();
    }

    function getQeItemCount(track) {
      if (!track) {
        return null;
      }
      var n = null;
      try {
        if (track.numItems !== undefined && track.numItems !== null) {
          n = typeof track.numItems === "function" ? Number(track.numItems()) : Number(track.numItems);
          if (!isNaN(n) && n >= 0) {
            return Math.round(n);
          }
        }
      } catch (errNumItems) {
      }
      try {
        if (track.clips && track.clips.numItems !== undefined && track.clips.numItems !== null) {
          n = Number(track.clips.numItems);
          if (!isNaN(n) && n >= 0) {
            return Math.round(n);
          }
        }
      } catch (errClipNumItems) {
      }
      return null;
    }

    function qeItemTimes(item) {
      var start = null;
      var end = null;
      try {
        if (item && item.start !== undefined && item.start !== null) {
          start = timeValueToTicks(item.start);
        }
      } catch (errStart) {
      }
      try {
        if (item && item.end !== undefined && item.end !== null) {
          end = timeValueToTicks(item.end);
        }
      } catch (errEnd) {
      }
      return {
        startTicks: start !== null && !isNaN(Number(start)) ? Math.round(Number(start)) : null,
        endTicks: end !== null && !isNaN(Number(end)) ? Math.round(Number(end)) : null
      };
    }

    function findQeTrackItem(target) {
      var errors = [];
      if (!qeSeq) {
        return { item: null, method: null, errors: ["QE sequence unavailable"] };
      }
      var getterName = target.kind === "audio" ? "getAudioTrackAt" : "getVideoTrackAt";
      if (!qeSeq[getterName]) {
        return { item: null, method: null, errors: ["QE " + getterName + " unavailable"] };
      }
      var qeTrack = null;
      try {
        qeTrack = qeSeq[getterName](target.trackIndex);
      } catch (errQeTrack) {
        return { item: null, method: null, errors: ["QE track lookup failed: " + String(errQeTrack)] };
      }
      if (!qeTrack || !qeTrack.getItemAt) {
        return { item: null, method: null, errors: ["QE track item lookup unavailable"] };
      }

      var beforeStart = target.before.start && target.before.start.ticks !== null ? Number(target.before.start.ticks) : null;
      var beforeEnd = target.before.end && target.before.end.ticks !== null ? Number(target.before.end.ticks) : null;
      var count = getQeItemCount(qeTrack);
      var limit = count !== null ? Math.min(count, 512) : 512;
      var misses = 0;
      for (var i = 0; i < limit; i++) {
        var item = null;
        try {
          item = qeTrack.getItemAt(i);
        } catch (errQeItem) {
          errors.push("qeTrack.getItemAt(" + i + "): " + String(errQeItem));
          if (count === null) {
            break;
          }
        }
        if (!item) {
          misses++;
          if (count === null && misses > 12) {
            break;
          }
          continue;
        }
        misses = 0;
        if (!item.setSpeed) {
          continue;
        }
        var times = qeItemTimes(item);
        var startMatches = beforeStart !== null && times.startTicks !== null && closeEnoughTicks(times.startTicks, beforeStart);
        var endMatches = beforeEnd !== null && times.endTicks !== null && closeEnoughTicks(times.endTicks, beforeEnd);
        if (startMatches && (endMatches || beforeEnd === null || times.endTicks === null)) {
          return { item: item, method: "qe." + getterName + "(" + target.trackIndex + ").getItemAt(" + i + ")", errors: errors };
        }
      }
      return { item: null, method: null, errors: errors.length ? errors : ["No matching QE track item with setSpeed found"] };
    }

    function applySpeed(target, requested) {
      var qeMatch = findQeTrackItem(target);
      if (!qeMatch.item) {
        return { ok: false, method: qeMatch.method, errors: qeMatch.errors };
      }
      var durationArg = requested.durationTicks !== null && requested.durationTicks !== undefined
        ? PremiereBridge._ticksToTimecode(requested.durationTicks)
        : "";
      try {
        qeMatch.item.setSpeed(
          requested.speed,
          durationArg,
          requested.reverse === true,
          requested.preserveAudioPitch === true,
          requested.ripple === true
        );
        return {
          ok: true,
          method: qeMatch.method + ".setSpeed(speed, duration, reverse, preserveAudioPitch, ripple)",
          durationArg: durationArg,
          errors: qeMatch.errors
        };
      } catch (errSetSpeed) {
        qeMatch.errors.push("qeTrackItem.setSpeed: " + String(errSetSpeed));
      }
      return { ok: false, method: qeMatch.method, errors: qeMatch.errors };
    }

    var matched = [];
    var requestedTrackFound = trackIndex === null;

    function collect(kindName, trackCollection) {
      if (!trackCollection) {
        return;
      }
      if (kind && kind !== kindName) {
        return;
      }
      var trackCount = PremiereBridge._collectionCount(trackCollection, 64);
      for (var t = 0; t < trackCount; t++) {
        if (trackIndex !== null && t !== trackIndex) {
          continue;
        }
        var track = null;
        try {
          track = trackCollection[t];
        } catch (errTrackGet) {
        }
        if (!track) {
          continue;
        }
        requestedTrackFound = true;
        if (!track.clips) {
          continue;
        }
        var clipCount = PremiereBridge._collectionCount(track.clips, 512);
        for (var c = 0; c < clipCount; c++) {
          var clip = null;
          try {
            clip = track.clips[c];
          } catch (errClipGet) {
          }
          if (!clip) {
            continue;
          }
          var summary = summarizeClip(clip, kindName, t, c);
          if (selectedOnly && !summary.selected) {
            continue;
          }
          if (matchName !== null && summary.name !== matchName) {
            continue;
          }
          if (targetTicks !== null) {
            var startTicks = summary.start.ticks !== null ? Number(summary.start.ticks) : null;
            var endTicks = summary.end.ticks !== null ? Number(summary.end.ticks) : null;
            if (startTicks === null || endTicks === null) {
              continue;
            }
            if (!(targetTicks >= startTicks && targetTicks < endTicks)) {
              continue;
            }
          }
          matched.push({
            clip: clip,
            kind: kindName,
            trackIndex: t,
            clipIndex: c,
            before: summary
          });
        }
      }
    }

    collect("video", sequence.videoTracks);
    collect("audio", sequence.audioTracks);

    if (!requestedTrackFound) {
      return PremiereBridge._err(kind === "audio" ? "Audio track not found" : "Video track not found", {
        criteria: criteriaSummary()
      });
    }

    if (!matched.length) {
      return PremiereBridge._err("No clip instances matched the requested selector", {
        criteria: criteriaSummary()
      });
    }

    if (!speedAllMatches && matched.length > 1) {
      var ambiguous = [];
      var ambiguousLimit = Math.min(matched.length, 5);
      for (var a = 0; a < ambiguousLimit; a++) {
        ambiguous.push(matched[a].before);
      }
      return PremiereBridge._err("Multiple clip instances matched the requested selector. Add --all-matches or narrow the selector.", {
        criteria: criteriaSummary(),
        matchCount: matched.length,
        matches: ambiguous
      });
    }

    var targets = speedAllMatches ? matched : [matched[0]];
    var preparedTargets = [];
    for (var prep = 0; prep < targets.length; prep++) {
      var requested = requestedUpdateFromSummary(targets[prep].before);
      if (!requested.ok) {
        return PremiereBridge._err(requested.error, {
          criteria: criteriaSummary(),
          target: targets[prep].before
        });
      }
      preparedTargets.push({ target: targets[prep], requested: requested });
    }

    if (payload.dryRun === true) {
      var dryRunMatches = [];
      for (var d = 0; d < preparedTargets.length; d++) {
        dryRunMatches.push({
          requested: preparedTargets[d].requested,
          before: preparedTargets[d].target.before
        });
      }
      return PremiereBridge._ok({
        dryRun: true,
        skipped: true,
        criteria: criteriaSummary(),
        matchedCount: matched.length,
        targetCount: preparedTargets.length,
        matches: dryRunMatches,
        availability: {
          qeAvailable: !!qeSeq,
          domGetSpeed: !!(preparedTargets.length && preparedTargets[0].target.clip && preparedTargets[0].target.clip.getSpeed)
        }
      });
    }

    var changed = [];
    var unchanged = [];
    var errors = [];
    for (var i = 0; i < preparedTargets.length; i++) {
      var prepared = preparedTargets[i];
      var target = prepared.target;
      var req = prepared.requested;
      var beforeSpeedMatches = target.before.speed && closeEnoughNumber(target.before.speed.speed, req.speed);
      var beforeReverseMatches = target.before.speed && target.before.speed.reversed !== null
        ? target.before.speed.reversed === req.reverse
        : true;
      var beforeDurationMatches = req.durationTicks !== null
        ? (target.before.duration && closeEnoughTicks(target.before.duration.ticks, req.durationTicks))
        : true;
      if (beforeSpeedMatches && beforeReverseMatches && beforeDurationMatches) {
        unchanged.push({
          method: "noop",
          requested: req,
          before: target.before,
          after: target.before
        });
        continue;
      }

      var setResult = applySpeed(target, req);
      var after = summarizeClip(target.clip, target.kind, target.trackIndex, target.clipIndex);
      var speedMatches = after.speed && closeEnoughNumber(after.speed.speed, req.speed);
      var reverseMatches = after.speed && after.speed.reversed !== null ? after.speed.reversed === req.reverse : true;
      var durationMatches = req.durationTicks !== null
        ? (after.duration && closeEnoughTicks(after.duration.ticks, req.durationTicks))
        : true;

      if (setResult.ok && speedMatches && reverseMatches && durationMatches) {
        changed.push({
          method: setResult.method,
          requested: req,
          before: target.before,
          after: after,
          qeDurationArg: setResult.durationArg,
          fallbackErrors: setResult.errors
        });
      } else {
        errors.push({
          method: setResult.method,
          requested: req,
          before: target.before,
          after: after,
          error: setResult.ok ? "Clip speed/duration did not verify after setSpeed" : "No supported QE track item speed setter",
          verification: {
            speedMatches: speedMatches,
            reverseMatches: reverseMatches,
            durationMatches: durationMatches
          },
          fallbackErrors: setResult.errors
        });
      }
    }

    if (errors.length) {
      return PremiereBridge._err("Failed to set one or more clip speed/duration values", {
        criteria: criteriaSummary(),
        matchedCount: matched.length,
        targetCount: preparedTargets.length,
        changedCount: changed.length,
        unchangedCount: unchanged.length,
        changed: changed,
        unchanged: unchanged,
        errors: errors
      });
    }

    return PremiereBridge._ok({
      criteria: criteriaSummary(),
      matchedCount: matched.length,
      targetCount: preparedTargets.length,
      changedCount: changed.length,
      unchangedCount: unchanged.length,
      changed: changed,
      unchanged: unchanged
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.nestSelectedClips = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var project = app.project;
    var sequence = project && project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }
    if (!sequence.createSubsequence) {
      return PremiereBridge._err("sequence.createSubsequence is unavailable; cannot create the nested sequence source");
    }

    function boolish(value, defaultValue) {
      if (value === undefined || value === null) {
        return defaultValue;
      }
      if (value === true || value === false) {
        return value;
      }
      var normalized = String(value).toLowerCase();
      if (normalized === "true" || normalized === "1" || normalized === "yes") {
        return true;
      }
      if (normalized === "false" || normalized === "0" || normalized === "no") {
        return false;
      }
      return !!value;
    }

    function toIntegerOrNull(value) {
      if (value === undefined || value === null) {
        return null;
      }
      var n = Number(value);
      if (isNaN(n) || n < 0 || Math.round(n) !== n) {
        return null;
      }
      return Math.round(n);
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

    function trackLabel(kind, trackIndex) {
      return (kind === "audio" ? "A" : "V") + String(Number(trackIndex) + 1);
    }

    function itemName(clip) {
      try {
        if (clip && clip.name !== undefined && clip.name !== null) {
          return String(clip.name);
        }
      } catch (errClipName) {
      }
      try {
        if (clip && clip.projectItem && clip.projectItem.name !== undefined && clip.projectItem.name !== null) {
          return String(clip.projectItem.name);
        }
      } catch (errProjectName) {
      }
      return null;
    }

    function itemNodeId(clip) {
      try {
        if (clip && clip.nodeId !== undefined && clip.nodeId !== null) {
          return String(clip.nodeId);
        }
      } catch (errNodeId) {
      }
      try {
        if (clip && clip.id !== undefined && clip.id !== null) {
          return String(clip.id);
        }
      } catch (errId) {
      }
      return null;
    }

    function getTrack(collection, index) {
      if (!collection || index === null || index === undefined || index < 0) {
        return null;
      }
      try {
        if (collection[index]) {
          return collection[index];
        }
      } catch (errTrack) {
      }
      return null;
    }

    function clipCount(track) {
      if (!track || !track.clips) {
        return 0;
      }
      return PremiereBridge._collectionCount(track.clips, 4096);
    }

    function summarizeClip(clip, kind, trackIndex, clipIndex) {
      var startTicks = PremiereBridge._timeToTicks(clip && clip.start !== undefined ? clip.start : null);
      var endTicks = PremiereBridge._timeToTicks(clip && clip.end !== undefined ? clip.end : null);
      var isSequence = false;
      try {
        if (clip && clip.projectItem && clip.projectItem.isSequence !== undefined && clip.projectItem.isSequence !== null) {
          if (typeof clip.projectItem.isSequence === "function") {
            isSequence = !!clip.projectItem.isSequence();
          } else {
            isSequence = !!clip.projectItem.isSequence;
          }
        }
      } catch (errIsSequence) {
      }
      return {
        kind: kind,
        trackIndex: trackIndex,
        track: trackLabel(kind, trackIndex),
        clipIndex: clipIndex,
        nodeId: itemNodeId(clip),
        name: itemName(clip),
        sourceName: (clip && clip.projectItem && clip.projectItem.name) ? String(clip.projectItem.name) : null,
        selected: PremiereBridge._clipSelectionState(clip),
        start: summarizeTicks(startTicks),
        end: summarizeTicks(endTicks),
        isSequence: isSequence
      };
    }

    function snapshotTrack(kind, trackIndex, bounds) {
      var track = getTrack(kind === "audio" ? sequence.audioTracks : sequence.videoTracks, trackIndex);
      var clips = [];
      if (!track || !track.clips) {
        return {
          kind: kind,
          trackIndex: trackIndex,
          track: trackLabel(kind, trackIndex),
          clipCount: 0,
          clips: clips
        };
      }
      var count = clipCount(track);
      for (var i = 0; i < count; i++) {
        var clip = null;
        try {
          clip = track.clips[i];
        } catch (errClip) {
        }
        if (!clip) {
          continue;
        }
        var summary = summarizeClip(clip, kind, trackIndex, i);
        var startTicks = summary.start && summary.start.ticks !== null ? Number(summary.start.ticks) : null;
        var endTicks = summary.end && summary.end.ticks !== null ? Number(summary.end.ticks) : null;
        if (bounds && startTicks !== null && endTicks !== null) {
          if (!(endTicks > bounds.inTicks && startTicks < bounds.outTicks)) {
            continue;
          }
        }
        clips.push(summary);
      }
      return {
        kind: kind,
        trackIndex: trackIndex,
        track: trackLabel(kind, trackIndex),
        clipCount: count,
        clips: clips
      };
    }

    function snapshotTracks(selection, bounds, videoTrackIndex, audioTrackIndex) {
      var usedVideo = {};
      var usedAudio = {};
      for (var i = 0; selection && i < selection.length; i++) {
        if (selection[i].kind === "audio") {
          usedAudio[String(selection[i].trackIndex)] = selection[i].trackIndex;
        } else {
          usedVideo[String(selection[i].trackIndex)] = selection[i].trackIndex;
        }
      }
      if (videoTrackIndex !== null && videoTrackIndex !== undefined) {
        usedVideo[String(videoTrackIndex)] = videoTrackIndex;
      }
      if (audioTrackIndex !== null && audioTrackIndex !== undefined) {
        usedAudio[String(audioTrackIndex)] = audioTrackIndex;
      }
      var video = [];
      var audio = [];
      for (var vk in usedVideo) {
        if (usedVideo[vk] !== undefined && usedVideo[vk] !== null) {
          video.push(snapshotTrack("video", usedVideo[vk], bounds));
        }
      }
      for (var ak in usedAudio) {
        if (usedAudio[ak] !== undefined && usedAudio[ak] !== null) {
          audio.push(snapshotTrack("audio", usedAudio[ak], bounds));
        }
      }
      return { video: video, audio: audio };
    }

    function snapshotChanged(beforeSnapshot, afterSnapshot) {
      if (!beforeSnapshot || !afterSnapshot) {
        return true;
      }
      var beforeVideo = beforeSnapshot.video || [];
      var afterVideo = afterSnapshot.video || [];
      var beforeAudio = beforeSnapshot.audio || [];
      var afterAudio = afterSnapshot.audio || [];
      if (beforeVideo.length !== afterVideo.length || beforeAudio.length !== afterAudio.length) {
        return true;
      }
      function tracksChanged(beforeTracks, afterTracks) {
        for (var ti = 0; ti < beforeTracks.length; ti++) {
          var beforeTrack = beforeTracks[ti];
          var afterTrack = afterTracks[ti];
          if (!beforeTrack || !afterTrack) {
            return true;
          }
          if (beforeTrack.trackIndex !== afterTrack.trackIndex || beforeTrack.clipCount !== afterTrack.clipCount) {
            return true;
          }
          var beforeClips = beforeTrack.clips || [];
          var afterClips = afterTrack.clips || [];
          if (beforeClips.length !== afterClips.length) {
            return true;
          }
          for (var ci = 0; ci < beforeClips.length; ci++) {
            var beforeClip = beforeClips[ci];
            var afterClip = afterClips[ci];
            if (!beforeClip || !afterClip) {
              return true;
            }
            if (
              beforeClip.name !== afterClip.name ||
              beforeClip.nodeId !== afterClip.nodeId ||
              beforeClip.clipIndex !== afterClip.clipIndex ||
              String(beforeClip.start ? beforeClip.start.ticks : "") !== String(afterClip.start ? afterClip.start.ticks : "") ||
              String(beforeClip.end ? beforeClip.end.ticks : "") !== String(afterClip.end ? afterClip.end.ticks : "")
            ) {
              return true;
            }
          }
        }
        return false;
      }
      return tracksChanged(beforeVideo, afterVideo) || tracksChanged(beforeAudio, afterAudio);
    }

    function flattenSelectedSnapshot(snapshot) {
      var selected = [];
      function collect(tracks) {
        for (var ti = 0; tracks && ti < tracks.length; ti++) {
          var track = tracks[ti];
          for (var ci = 0; track && track.clips && ci < track.clips.length; ci++) {
            if (track.clips[ci] && track.clips[ci].selected) {
              selected.push(track.clips[ci]);
            }
          }
        }
      }
      collect(snapshot ? snapshot.video : null);
      collect(snapshot ? snapshot.audio : null);
      return selected;
    }

    function filterClipsByKind(clips, kind) {
      var filtered = [];
      for (var f = 0; clips && f < clips.length; f++) {
        if (clips[f] && clips[f].kind === kind) {
          filtered.push(clips[f]);
        }
      }
      return filtered;
    }

    function clipMatchesSummary(clip, summary, kind, trackIndex, clipIndex) {
      var current = summarizeClip(clip, kind, trackIndex, clipIndex);
      if (summary.nodeId && current.nodeId && String(summary.nodeId) === String(current.nodeId)) {
        return { ok: true, summary: current };
      }
      var summaryStart = summary.start && summary.start.ticks !== null ? String(summary.start.ticks) : "";
      var currentStart = current.start && current.start.ticks !== null ? String(current.start.ticks) : "";
      var summaryEnd = summary.end && summary.end.ticks !== null ? String(summary.end.ticks) : "";
      var currentEnd = current.end && current.end.ticks !== null ? String(current.end.ticks) : "";
      var summaryName = summary.name !== null && summary.name !== undefined ? String(summary.name) : "";
      var currentName = current.name !== null && current.name !== undefined ? String(current.name) : "";
      return {
        ok: summary.kind === kind &&
          Number(summary.trackIndex) === Number(trackIndex) &&
          summaryName === currentName &&
          summaryStart === currentStart &&
          summaryEnd === currentEnd,
        summary: current
      };
    }

    function findClipBySummary(summary) {
      var track = getTrack(summary.kind === "audio" ? sequence.audioTracks : sequence.videoTracks, summary.trackIndex);
      if (!track || !track.clips) {
        return null;
      }
      var count = clipCount(track);
      for (var i = 0; i < count; i++) {
        var clip = null;
        try {
          clip = track.clips[i];
        } catch (errClipGet) {
        }
        if (!clip) {
          continue;
        }
        var match = clipMatchesSummary(clip, summary, summary.kind, summary.trackIndex, i);
        if (match.ok) {
          return {
            clip: clip,
            summary: match.summary
          };
        }
      }
      return null;
    }

    function removeOriginalClips(selectedBeforeClips) {
      var removed = [];
      var removeErrors = [];
      for (var ri = selectedBeforeClips.length - 1; ri >= 0; ri--) {
        var beforeClip = selectedBeforeClips[ri];
        var match = findClipBySummary(beforeClip);
        if (!match || !match.clip) {
          removed.push({
            method: "not-found",
            before: beforeClip
          });
          continue;
        }
        if (!match.clip.remove) {
          removeErrors.push({
            before: beforeClip,
            error: "TrackItem.remove is unavailable"
          });
          continue;
        }
        var removeMethod = null;
        try {
          match.clip.remove(false, false);
          removeMethod = "trackItem.remove(false, false)";
        } catch (errRemoveBool) {
          try {
            match.clip.remove(0, 0);
            removeMethod = "trackItem.remove(0, 0)";
          } catch (errRemoveNumber) {
            removeErrors.push({
              before: beforeClip,
              error: "trackItem.remove(false, false): " + String(errRemoveBool) + "; trackItem.remove(0, 0): " + String(errRemoveNumber)
            });
          }
        }
        if (removeMethod) {
          removed.push({
            method: removeMethod,
            before: beforeClip,
            removed: match.summary
          });
        }
      }
      return {
        removed: removed,
        errors: removeErrors
      };
    }

    function remainingOriginalClips(selectedBeforeClips) {
      var remaining = [];
      for (var ri = 0; ri < selectedBeforeClips.length; ri++) {
        var match = findClipBySummary(selectedBeforeClips[ri]);
        if (match && match.summary) {
          remaining.push(match.summary);
        }
      }
      return remaining;
    }

    function clipMatchesNestedRange(summary, nestedName, bounds) {
      if (!summary || summary.kind !== "audio" || !bounds) {
        return false;
      }
      var startTicks = summary.start && summary.start.ticks !== null ? Number(summary.start.ticks) : null;
      var endTicks = summary.end && summary.end.ticks !== null ? Number(summary.end.ticks) : null;
      if (
        startTicks === null ||
        endTicks === null ||
        startTicks !== Math.round(Number(bounds.inTicks)) ||
        endTicks !== Math.round(Number(bounds.outTicks))
      ) {
        return false;
      }
      var name = summary.name !== null && summary.name !== undefined ? String(summary.name) : "";
      var sourceName = summary.sourceName !== null && summary.sourceName !== undefined ? String(summary.sourceName) : "";
      var expectedName = nestedName !== null && nestedName !== undefined ? String(nestedName) : "";
      return expectedName && (name === expectedName || sourceName === expectedName);
    }

    function findNestedAudioClips(nestedName, bounds) {
      var matches = [];
      var audioTrackCount = PremiereBridge._collectionCount(sequence.audioTracks, 64);
      for (var at = 0; at < audioTrackCount; at++) {
        var track = getTrack(sequence.audioTracks, at);
        if (!track || !track.clips) {
          continue;
        }
        var count = clipCount(track);
        for (var ac = 0; ac < count; ac++) {
          var clip = null;
          try {
            clip = track.clips[ac];
          } catch (errAudioClipGet) {
          }
          if (!clip) {
            continue;
          }
          var summary = summarizeClip(clip, "audio", at, ac);
          if (clipMatchesNestedRange(summary, nestedName, bounds)) {
            matches.push({
              clip: clip,
              summary: summary
            });
          }
        }
      }
      return matches;
    }

    function removeUnexpectedNestedAudio(nestedName, bounds) {
      var removed = [];
      var removeErrors = [];
      var matches = findNestedAudioClips(nestedName, bounds);
      for (var ai = matches.length - 1; ai >= 0; ai--) {
        var match = matches[ai];
        if (!match || !match.clip) {
          continue;
        }
        if (!match.clip.remove) {
          removeErrors.push({
            before: match.summary,
            error: "TrackItem.remove is unavailable"
          });
          continue;
        }
        var removeMethod = null;
        try {
          match.clip.remove(false, false);
          removeMethod = "trackItem.remove(false, false)";
        } catch (errAudioRemoveBool) {
          try {
            match.clip.remove(0, 0);
            removeMethod = "trackItem.remove(0, 0)";
          } catch (errAudioRemoveNumber) {
            removeErrors.push({
              before: match.summary,
              error: "trackItem.remove(false, false): " + String(errAudioRemoveBool) + "; trackItem.remove(0, 0): " + String(errAudioRemoveNumber)
            });
          }
        }
        if (removeMethod) {
          removed.push({
            method: removeMethod,
            removed: match.summary
          });
        }
      }
      return {
        removed: removed,
        errors: removeErrors
      };
    }

    function setProjectItemInOut(projectItem, inTicks, outTicks, mediaType, label) {
      var result = {
        ok: false,
        label: label,
        mediaType: mediaType,
        inTicks: String(Math.round(Number(inTicks))),
        outTicks: String(Math.round(Number(outTicks))),
        methods: [],
        errors: []
      };
      if (!projectItem) {
        result.errors.push("projectItem unavailable");
        return result;
      }
      if (!projectItem.setInPoint || !projectItem.setOutPoint) {
        result.errors.push("ProjectItem.setInPoint/setOutPoint unavailable");
        return result;
      }
      var inOk = false;
      var outOk = false;
      try {
        projectItem.setInPoint(result.inTicks, mediaType);
        inOk = true;
        result.methods.push("projectItem.setInPoint(ticks," + String(mediaType) + ")");
      } catch (errSetProjectIn) {
        result.errors.push("projectItem.setInPoint: " + String(errSetProjectIn));
      }
      try {
        projectItem.setOutPoint(result.outTicks, mediaType);
        outOk = true;
        result.methods.push("projectItem.setOutPoint(ticks," + String(mediaType) + ")");
      } catch (errSetProjectOut) {
        result.errors.push("projectItem.setOutPoint: " + String(errSetProjectOut));
      }
      result.ok = inOk && outOk;
      return result;
    }

    function summarizeSequenceInfo(seqInfo) {
      if (!seqInfo) {
        return null;
      }
      return {
        index: seqInfo.index,
        name: seqInfo.name,
        id: seqInfo.id,
        binPath: seqInfo.binPath || "",
        active: !!seqInfo.active
      };
    }

    function selectedItemDetail(item) {
      return {
        kind: item.kind,
        trackIndex: item.trackIndex,
        track: trackLabel(item.kind, item.trackIndex),
        clipIndex: item.clipIndex,
        name: item.name,
        start: summarizeTicks(item.startTicks),
        end: summarizeTicks(item.endTicks)
      };
    }

    var selectedItems = PremiereBridge._selectedTrackItems(sequence);
    if (!selectedItems.length) {
      return PremiereBridge._err("No selected track items found");
    }
    var bounds = PremiereBridge._selectionBounds(selectedItems);
    if (!bounds) {
      return PremiereBridge._err("Unable to compute selection bounds", {
        selectionCount: selectedItems.length,
        selectionSample: selectedItems.slice(0, 12)
      });
    }

    var requestedName = payload.name !== undefined && payload.name !== null ? String(payload.name) : null;
    if (requestedName !== null && !requestedName.replace(/^\s+|\s+$/g, "")) {
      return PremiereBridge._err("name must be a non-empty string");
    }
    var ignoreTrackTargeting = boolish(payload.ignoreTrackTargeting, true);
    var videoTrackIndex = toIntegerOrNull(payload.videoTrackIndex);
    if (payload.videoTrackIndex !== undefined && videoTrackIndex === null) {
      return PremiereBridge._err("Invalid videoTrackIndex");
    }

    var primaryVideoTrack = null;
    var selectedAudioCount = 0;
    for (var s = 0; s < selectedItems.length; s++) {
      if (selectedItems[s].kind === "video") {
        if (primaryVideoTrack === null || selectedItems[s].trackIndex < primaryVideoTrack) {
          primaryVideoTrack = selectedItems[s].trackIndex;
        }
      } else if (selectedItems[s].kind === "audio") {
        selectedAudioCount++;
      }
    }
    if (primaryVideoTrack === null) {
      return PremiereBridge._err("At least one selected video track item is required; parent audio-only nesting is not supported by this command");
    }
    var parentAudioMode = selectedAudioCount > 0 ? "preserve-original-parent-clips" : "none";
    if (videoTrackIndex === null) {
      videoTrackIndex = primaryVideoTrack;
    }

    var videoTrack = getTrack(sequence.videoTracks, videoTrackIndex);
    if (!videoTrack) {
      return PremiereBridge._err("Video track not found", { videoTrackIndex: videoTrackIndex });
    }
    var beforeList = PremiereBridge._sequenceList();
    PremiereBridge._collectSequenceBinPaths(beforeList);
    var beforeSnapshot = snapshotTracks(selectedItems, bounds, videoTrackIndex, null);
    var selectedBeforeClips = flattenSelectedSnapshot(beforeSnapshot);
    var selectedVideoBeforeClips = filterClipsByKind(selectedBeforeClips, "video");
    var selectedAudioBeforeClips = filterClipsByKind(selectedBeforeClips, "audio");
    var selectionDetails = [];
    for (var detailIndex = 0; detailIndex < selectedItems.length; detailIndex++) {
      selectionDetails.push(selectedItemDetail(selectedItems[detailIndex]));
    }
    var activeBefore = {
      name: sequence.name ? String(sequence.name) : null,
      id: sequence.sequenceID !== undefined && sequence.sequenceID !== null ? String(sequence.sequenceID) : null
    };

    var criteria = {
      name: requestedName,
      ignoreTrackTargeting: ignoreTrackTargeting,
      videoTrackIndex: videoTrackIndex,
      parentAudioMode: parentAudioMode,
      selectedAudioCount: selectedAudioCount,
      audioPreservedInNestedSequence: selectedAudioCount > 0,
      parentAudioPreserved: selectedAudioCount > 0,
      selectionCount: selectedItems.length,
      bounds: {
        "in": summarizeTicks(bounds.inTicks),
        "out": summarizeTicks(bounds.outTicks),
        duration: summarizeTicks(Math.max(0, bounds.outTicks - bounds.inTicks))
      }
    };

    if (payload.dryRun === true) {
      return PremiereBridge._ok({
        dryRun: true,
        skipped: true,
        supported: true,
        criteria: criteria,
        selection: selectionDetails,
        tracks: {
          before: beforeSnapshot
        },
        selectedBeforeClips: selectedBeforeClips,
        selectedVideoBeforeClips: selectedVideoBeforeClips,
        selectedAudioBeforeClips: selectedAudioBeforeClips,
        available: {
          createSubsequence: !!sequence.createSubsequence,
          sequenceOverwriteClip: !!sequence.overwriteClip,
          videoTrackOverwriteClip: !!(videoTrack && videoTrack.overwriteClip),
          willInsertParentAudio: false
        }
      });
    }

    var qeSeq = PremiereBridge._getQeSequence();
    var originalInOut = PremiereBridge._readSequenceInOutTicks(sequence, qeSeq);
    var methods = [];
    var errors = [];
    var setInOutResult = PremiereBridge._setInOutTicks(sequence, qeSeq, bounds.inTicks, bounds.outTicks);
    methods.push("setInOut:" + setInOutResult.methods.join("+"));

    var createdRaw = null;
    var createdRef = null;
    try {
      createdRaw = sequence.createSubsequence(ignoreTrackTargeting);
      createdRef = createdRaw;
      methods.push("sequence.createSubsequence(ignoreTrackTargeting)");
    } catch (errCreateBool) {
      errors.push("sequence.createSubsequence(bool): " + String(errCreateBool));
    }
    if (!createdRef) {
      try {
        createdRaw = sequence.createSubsequence();
        createdRef = createdRaw;
        methods.push("sequence.createSubsequence()");
      } catch (errCreateNoArgs) {
        errors.push("sequence.createSubsequence(): " + String(errCreateNoArgs));
      }
    }

    var afterCreateList = PremiereBridge._sequenceList();
    PremiereBridge._collectSequenceBinPaths(afterCreateList);
    var newSequences = PremiereBridge._diffNewSequences(beforeList, afterCreateList);
    var nestedInfo = newSequences && newSequences.length ? newSequences[0] : null;
    if (!nestedInfo && createdRef) {
      try {
        if (createdRef.projectItem) {
          nestedInfo = { name: createdRef.name ? String(createdRef.name) : null, id: createdRef.sequenceID ? String(createdRef.sequenceID) : null, ref: createdRef, projectItemRef: createdRef.projectItem };
        }
      } catch (errCreatedRef) {
      }
    }
    if (!nestedInfo || !nestedInfo.ref || !nestedInfo.projectItemRef) {
      if (originalInOut && originalInOut.ok) {
        PremiereBridge._setInOutTicks(sequence, qeSeq, originalInOut.inTicks, originalInOut.outTicks);
      }
      return PremiereBridge._err("Created subsequence but could not resolve the nested sequence project item", {
        criteria: criteria,
        newSequences: newSequences,
        createResult: createdRaw !== null && createdRaw !== undefined ? String(createdRaw) : null,
        errors: errors
      });
    }

    if (requestedName !== null) {
      try {
        if (nestedInfo.ref && nestedInfo.ref.name !== undefined) {
          nestedInfo.ref.name = requestedName;
        }
      } catch (errRenameSeq) {
        errors.push("nestedSequence.name: " + String(errRenameSeq));
      }
      try {
        if (nestedInfo.projectItemRef && nestedInfo.projectItemRef.name !== undefined) {
          nestedInfo.projectItemRef.name = requestedName;
        }
      } catch (errRenameProjectItem) {
        errors.push("nestedSequence.projectItem.name: " + String(errRenameProjectItem));
      }
      nestedInfo.name = requestedName;
    }

    var activateErrors = [];
    var activateMethod = PremiereBridge._activateSequence(sequence, qeSeq, project, activateErrors);
    if (activateMethod) {
      methods.push("activateOriginal:" + activateMethod);
    }
    for (var ae = 0; ae < activateErrors.length; ae++) {
      errors.push(activateErrors[ae]);
    }

    var removeOriginals = removeOriginalClips(selectedVideoBeforeClips);
    if (removeOriginals.removed && removeOriginals.removed.length) {
      methods.push("removeOriginals:trackItem.remove(false,false)");
    }
    for (var re = 0; re < removeOriginals.errors.length; re++) {
      errors.push("removeOriginals: " + removeOriginals.errors[re].error);
    }

    var overwriteMethod = null;
    var targetTicksString = String(bounds.inTicks);
    var overwriteVideo = false;
    if (!overwriteMethod) {
      try {
        if (videoTrack && videoTrack.overwriteClip) {
          setProjectItemInOut(nestedInfo.projectItemRef, 0, Math.max(0, bounds.outTicks - bounds.inTicks), 1, "video");
          setProjectItemInOut(nestedInfo.projectItemRef, 0, 0, 2, "suppress-audio");
          videoTrack.overwriteClip(nestedInfo.projectItemRef, targetTicksString);
          overwriteVideo = true;
          setProjectItemInOut(nestedInfo.projectItemRef, 0, Math.max(0, bounds.outTicks - bounds.inTicks), 4, "restore-all-media");
        }
      } catch (errTrackOverwrite) {
        errors.push("videoTrack.overwriteClip: " + String(errTrackOverwrite));
      }
    }
    if (!overwriteMethod && overwriteVideo) {
      overwriteMethod = "videoTrack.overwriteClip(projectItem, ticks)";
    }

    var unexpectedAudio = {
      removed: [],
      errors: []
    };
    unexpectedAudio = removeUnexpectedNestedAudio(nestedInfo.name, bounds);
    if (unexpectedAudio.removed && unexpectedAudio.removed.length) {
      methods.push("removeUnexpectedAudio:trackItem.remove(false,false)");
    }
    for (var ue = 0; ue < unexpectedAudio.errors.length; ue++) {
      errors.push("removeUnexpectedAudio: " + unexpectedAudio.errors[ue].error);
    }

    if (originalInOut && originalInOut.ok) {
      PremiereBridge._setInOutTicks(sequence, qeSeq, originalInOut.inTicks, originalInOut.outTicks);
    }

    var afterSnapshot = snapshotTracks(selectedItems, bounds, videoTrackIndex, null);
    var observedChange = snapshotChanged(beforeSnapshot, afterSnapshot);
    var remainingOriginals = remainingOriginalClips(selectedVideoBeforeClips);
    var remainingPreservedParentAudio = remainingOriginalClips(selectedAudioBeforeClips);
    var missingPreservedParentAudio = [];
    for (var mpa = 0; mpa < selectedAudioBeforeClips.length; mpa++) {
      var expectedAudio = selectedAudioBeforeClips[mpa];
      var foundAudio = false;
      for (var rpa = 0; rpa < remainingPreservedParentAudio.length; rpa++) {
        if (
          remainingPreservedParentAudio[rpa] &&
          expectedAudio &&
          String(remainingPreservedParentAudio[rpa].nodeId || "") === String(expectedAudio.nodeId || "")
        ) {
          foundAudio = true;
          break;
        }
      }
      if (!foundAudio) {
        missingPreservedParentAudio.push(expectedAudio);
      }
    }
    var remainingUnexpectedAudio = findNestedAudioClips(nestedInfo.name, bounds);
    var remainingUnexpectedAudioSummaries = [];
    for (var rua = 0; rua < remainingUnexpectedAudio.length; rua++) {
      remainingUnexpectedAudioSummaries.push(remainingUnexpectedAudio[rua].summary);
    }
    var replacementClip = null;
    if (afterSnapshot && afterSnapshot.video) {
      for (var vt = 0; vt < afterSnapshot.video.length; vt++) {
        var trackSnap = afterSnapshot.video[vt];
        for (var vc = 0; trackSnap && trackSnap.clips && vc < trackSnap.clips.length; vc++) {
          var snapClip = trackSnap.clips[vc];
          if (
            snapClip &&
            snapClip.start &&
            snapClip.start.ticks !== null &&
            Number(snapClip.start.ticks) === Math.round(Number(bounds.inTicks)) &&
            snapClip.name &&
            nestedInfo.name &&
            String(snapClip.name) === String(nestedInfo.name)
          ) {
            replacementClip = snapClip;
          }
        }
      }
    }

    if (!overwriteMethod || !observedChange || !replacementClip || remainingOriginals.length || remainingUnexpectedAudioSummaries.length || missingPreservedParentAudio.length) {
      return PremiereBridge._err("Nested sequence was created but the original timeline replacement did not verify", {
        criteria: criteria,
        nestedSequence: summarizeSequenceInfo(nestedInfo),
        overwrite: {
          method: overwriteMethod,
          observedChange: observedChange,
          replacementClip: replacementClip,
          remainingOriginals: remainingOriginals,
          remainingUnexpectedAudio: remainingUnexpectedAudioSummaries,
          missingPreservedParentAudio: missingPreservedParentAudio
        },
        removeOriginals: removeOriginals,
        preservedParentAudio: remainingPreservedParentAudio,
        unexpectedAudio: unexpectedAudio,
        tracks: {
          before: beforeSnapshot,
          after: afterSnapshot
        },
        methods: methods,
        errors: errors
      });
    }

    return PremiereBridge._ok({
      criteria: criteria,
      nestedSequence: summarizeSequenceInfo(nestedInfo),
      replacementClip: replacementClip,
      selection: selectionDetails,
      tracks: {
        before: beforeSnapshot,
        after: afterSnapshot
      },
      overwrite: {
        method: overwriteMethod,
        observedChange: observedChange,
        remainingOriginals: remainingOriginals,
        remainingUnexpectedAudio: remainingUnexpectedAudioSummaries,
        missingPreservedParentAudio: missingPreservedParentAudio
      },
      removeOriginals: removeOriginals,
      preservedParentAudio: remainingPreservedParentAudio,
      unexpectedAudio: unexpectedAudio,
      activeBefore: activeBefore,
      methods: methods,
      errors: errors
    });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.setTrackState = function (jsonStr) {
  try {
    var payload = PremiereBridge._parse(jsonStr) || {};
    var trackIndex = null;
    var kind = payload.kind ? String(payload.kind).toLowerCase() : null;

    if (payload.track !== undefined && payload.track !== null) {
      var trackStr = String(payload.track).toUpperCase();
      if (trackStr.indexOf("V") === 0) {
        trackIndex = Number(trackStr.slice(1)) - 1;
        if (!kind) {
          kind = "video";
        }
      } else if (trackStr.indexOf("A") === 0) {
        trackIndex = Number(trackStr.slice(1)) - 1;
        if (!kind) {
          kind = "audio";
        }
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
    if (!kind) {
      kind = "video";
    }
    if (kind !== "video" && kind !== "audio") {
      return PremiereBridge._err("Invalid track kind; use video or audio");
    }

    var desiredMute = null;
    if (payload.mute !== undefined && payload.mute !== null) {
      desiredMute = !!payload.mute;
    } else if (payload.visible !== undefined && payload.visible !== null) {
      desiredMute = !payload.visible;
    }
    if (desiredMute === null) {
      return PremiereBridge._err("Provide mute or visible state");
    }

    var method = null;
    var currentMute = null;

    var qeSeq = PremiereBridge._getQeSequence();
    var qeGetter = kind === "audio" ? "getAudioTrackAt" : "getVideoTrackAt";
    if (qeSeq && qeSeq[qeGetter]) {
      var qeTrack = qeSeq[qeGetter](trackIndex);
      if (!qeTrack) {
        return PremiereBridge._err(kind === "audio" ? "Audio track not found" : "Video track not found");
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

      if (qeTrack.setMute) {
        qeTrack.setMute(nextMute ? 1 : 0);
        method = "qe.setMute";
      } else if (qeTrack.setEnabled) {
        qeTrack.setEnabled(!nextMute);
        method = "qe.setEnabled";
      } else {
        return PremiereBridge._err("Unable to set track state (no supported setter)");
      }

      return PremiereBridge._ok({ kind: kind, trackIndex: trackIndex, muted: nextMute, method: method });
    }

    var sequence = app.project.activeSequence;
    if (!sequence) {
      return PremiereBridge._err("No active sequence");
    }

    var track = null;
    var domTracks = kind === "audio" ? sequence.audioTracks : sequence.videoTracks;
    if (!domTracks) {
      return PremiereBridge._err(kind === "audio" ? "No audio tracks" : "No video tracks");
    }
    if (domTracks[trackIndex]) {
      track = domTracks[trackIndex];
    } else if (domTracks.numTracks && trackIndex < domTracks.numTracks) {
      track = domTracks[trackIndex];
    }

    if (!track) {
      return PremiereBridge._err(kind === "audio" ? "Audio track not found" : "Video track not found");
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

    if (track.setMute) {
      track.setMute(fallbackMute ? 1 : 0);
      method = "dom.setMute";
    } else if (track.setEnabled) {
      track.setEnabled(!fallbackMute);
      method = "dom.setEnabled";
    } else {
      return PremiereBridge._err("Unable to set track state (no supported setter)");
    }

    return PremiereBridge._ok({ kind: kind, trackIndex: trackIndex, muted: fallbackMute, method: method });
  } catch (err) {
    return PremiereBridge._err(String(err));
  }
};

PremiereBridge.toggleVideoTrack = function (jsonStr) {
  var payload = PremiereBridge._parse(jsonStr) || {};
  payload.kind = "video";
  return PremiereBridge.setTrackState(JSON.stringify(payload));
};
