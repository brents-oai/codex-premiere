#!/usr/bin/env swift

import Foundation
import CoreGraphics
import AppKit
import Vision

struct RectSummary: Codable {
  let x: Double
  let y: Double
  let width: Double
  let height: Double
}

struct WindowSummary: Codable {
  let id: Int
  let ownerName: String
  let title: String
  let bounds: RectSummary
}

struct MatchSummary: Codable {
  let timecode: String
  let text: String
  let bounds: RectSummary
}

struct CandidateSummary: Codable {
  let timecode: String
  let occurrences: Int
  let maxHeight: Double
  let anchorDistance: Double
  let score: Double
  let confidence: Double
  let matches: [MatchSummary]
}

struct ImageSummary: Codable {
  let width: Int
  let height: Int
}

struct OcrSummary: Codable {
  let image: ImageSummary
  let selected: CandidateSummary?
  let candidates: [CandidateSummary]
}

struct Envelope<T: Codable>: Codable {
  let ok: Bool
  let data: T?
  let error: String?
}

let timecodeRegex = try! NSRegularExpression(pattern: #"\b\d{2}[:;]\d{2}[:;]\d{2}[:;]\d{2}\b"#)

func fail(_ message: String) -> Never {
  fputs(message + "\n", stderr)
  exit(1)
}

func emit<T: Codable>(_ value: T) -> Never {
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
  do {
    let data = try encoder.encode(value)
    FileHandle.standardOutput.write(data)
    if let newline = "\n".data(using: .utf8) {
      FileHandle.standardOutput.write(newline)
    }
    exit(0)
  } catch {
    fail(String(describing: error))
  }
}

func rectSummary(_ dict: [String: Any]) -> RectSummary {
  let x = Double(dict["X"] as? CGFloat ?? 0)
  let y = Double(dict["Y"] as? CGFloat ?? 0)
  let width = Double(dict["Width"] as? CGFloat ?? 0)
  let height = Double(dict["Height"] as? CGFloat ?? 0)
  return RectSummary(x: x, y: y, width: width, height: height)
}

func anchorDistance(for matches: [MatchSummary]) -> Double {
  let anchorX = 0.32
  var best = 1.0
  for match in matches {
    let centerX = match.bounds.x + (match.bounds.width / 2.0)
    let delta = abs(centerX - anchorX)
    if delta < best {
      best = delta
    }
  }
  return best
}

func scoreCandidate(matches: [MatchSummary]) -> (score: Double, confidence: Double, maxHeight: Double, anchorDistance: Double) {
  let count = matches.count
  var maxHeight = 0.0
  for match in matches {
    if match.bounds.height > maxHeight {
      maxHeight = match.bounds.height
    }
  }
  let anchor = anchorDistance(for: matches)
  let anchorScore = max(0.0, 1.0 - min(anchor, 1.0))
  let score = (Double(count) * 1000.0) + (maxHeight * 100.0) + (anchorScore * 10.0)

  var confidence = 0.30
  if count >= 2 {
    confidence += 0.40
  } else if count == 1 {
    confidence += 0.10
  }
  if maxHeight >= 0.016 {
    confidence += 0.15
  } else if maxHeight >= 0.014 {
    confidence += 0.08
  } else if maxHeight >= 0.012 {
    confidence += 0.04
  }
  if anchor <= 0.08 {
    confidence += 0.14
  } else if anchor <= 0.16 {
    confidence += 0.07
  }

  return (score: score, confidence: min(confidence, 0.99), maxHeight: maxHeight, anchorDistance: anchor)
}

func readWindowInfo() -> Never {
  let infoList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
  var windows: [WindowSummary] = []

  for info in infoList {
    let ownerName = String(describing: info[kCGWindowOwnerName as String] ?? "")
    if ownerName.range(of: "Adobe Premiere", options: .caseInsensitive) == nil {
      continue
    }
    let layer = info[kCGWindowLayer as String] as? Int ?? 0
    if layer != 0 {
      continue
    }
    guard let bounds = info[kCGWindowBounds as String] as? [String: Any] else {
      continue
    }
    let rect = rectSummary(bounds)
    if rect.width <= 500 || rect.height <= 500 {
      continue
    }
    let title = String(describing: info[kCGWindowName as String] ?? "")
    let idValue = info[kCGWindowNumber as String]
    let id = Int(String(describing: idValue ?? "")) ?? 0
    if id <= 0 {
      continue
    }
    windows.append(WindowSummary(id: id, ownerName: ownerName, title: title, bounds: rect))
  }

  if windows.isEmpty {
    emit(Envelope<WindowSummary>(ok: false, data: nil, error: "No on-screen Adobe Premiere window found"))
  }

  windows.sort { a, b in
    (a.bounds.width * a.bounds.height) > (b.bounds.width * b.bounds.height)
  }
  emit(Envelope(ok: true, data: windows[0], error: nil))
}

func imageSize(_ image: CGImage) -> ImageSummary {
  ImageSummary(width: image.width, height: image.height)
}

func readOcr(path: String) -> Never {
  let url = URL(fileURLWithPath: path)
  guard let image = NSImage(contentsOf: url) else {
    emit(Envelope<OcrSummary>(ok: false, data: nil, error: "Unable to load image at \(path)"))
  }
  var rect = NSRect(origin: .zero, size: image.size)
  guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
    emit(Envelope<OcrSummary>(ok: false, data: nil, error: "Unable to read CGImage at \(path)"))
  }

  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = false

  do {
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try handler.perform([request])
  } catch {
    emit(Envelope<OcrSummary>(ok: false, data: nil, error: String(describing: error)))
  }

  var grouped: [String: [MatchSummary]] = [:]
  for observation in request.results ?? [] {
    guard let candidate = observation.topCandidates(1).first else {
      continue
    }
    let text = candidate.string
    let nsText = text as NSString
    let matches = timecodeRegex.matches(in: text, options: [], range: NSRange(location: 0, length: nsText.length))
    if matches.isEmpty {
      continue
    }
    let bounds = RectSummary(
      x: Double(observation.boundingBox.minX),
      y: Double(observation.boundingBox.minY),
      width: Double(observation.boundingBox.width),
      height: Double(observation.boundingBox.height)
    )
    for match in matches {
      let timecode = nsText.substring(with: match.range)
      grouped[timecode, default: []].append(MatchSummary(timecode: timecode, text: text, bounds: bounds))
    }
  }

  var candidates: [CandidateSummary] = []
  for (timecode, matches) in grouped {
    let scored = scoreCandidate(matches: matches)
    candidates.append(
      CandidateSummary(
        timecode: timecode,
        occurrences: matches.count,
        maxHeight: scored.maxHeight,
        anchorDistance: scored.anchorDistance,
        score: scored.score,
        confidence: scored.confidence,
        matches: matches.sorted { a, b in
          if a.bounds.height != b.bounds.height {
            return a.bounds.height > b.bounds.height
          }
          return a.bounds.y > b.bounds.y
        }
      )
    )
  }

  candidates.sort { a, b in
    if a.score != b.score {
      return a.score > b.score
    }
    if a.occurrences != b.occurrences {
      return a.occurrences > b.occurrences
    }
    if a.maxHeight != b.maxHeight {
      return a.maxHeight > b.maxHeight
    }
    return a.timecode < b.timecode
  }

  emit(
    Envelope(
      ok: true,
      data: OcrSummary(
        image: imageSize(cgImage),
        selected: candidates.isEmpty ? nil : candidates[0],
        candidates: candidates
      ),
      error: nil
    )
  )
}

let args = Array(CommandLine.arguments.dropFirst())
if args.isEmpty {
  fail("Usage: premiere-ui-timecode.swift window-info | ocr <image-path>")
}

if args[0] == "window-info" {
  readWindowInfo()
}

if args[0] == "ocr" {
  if args.count < 2 {
    fail("Provide an image path for ocr")
  }
  readOcr(path: args[1])
}

fail("Unknown command: \(args[0])")
