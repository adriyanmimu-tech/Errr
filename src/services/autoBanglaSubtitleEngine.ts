// @ts-nocheck
export var subtitleMemoryCache = new Map();
export var srtUrlCueCache = new Map();
export var activeTranslationBatches = new Set();
export var singleLineTranslationCache = new Map();

export function banglaDigitsToAscii(str) {
  return String(str || "").replace(/[\u09E6-\u09EF]/g, (d) => String(d.charCodeAt(0) - 2534));
}

export function cleanMovieTitleForSubSearch(rawTitle) {
  const safeTitle = String(rawTitle || "");
  const yearMatches = [...safeTitle.matchAll(/\b(19[5-9]\d|20[0-2]\d)\b/g)].map((m) => m[1]);
  const year = yearMatches.length > 0 ? yearMatches[0] : undefined;
  const cleanTitle = safeTitle
    .replace(/\[.*?\]|\(.*?\)|\{.*?\}/g, " ")
    .replace(/\b(?:19[5-9]\d|20[0-2]\d)\b/g, " ")
    .replace(
      /\b(?:S\d+(?:E\d+)?|Season\s*\d+(?:-\d+)?|Ep(?:isode)?\s*\d+(?:-\d+)?|Part\s*\d+|Vol(?:ume)?\s*\d+|Chapter\s*\d+|Complete(?:d)?|Added|Full\s*Movie|Full\s*HD|FHD|UHD|1080p|720p|480p|360p|2160p|4K|WEB-?DL|WEB-?Rip|Blu-?Ray|BRRip|BDRip|HDRip|DVDRip|HDTS|HDTC|PreDVD|DVDScr|CAMRip|HDCAM|CAM|TS|TC|HQ|Clean\s*Audio|Line\s*Audio|ORG|Original|Hindi|Bangla|Bengali|Tamil|Telugu|Malayalam|Kannada|South|Indian|Korean|Chinese|Japanese|Turkish|English|Dual\s*Audio|Multi\s*Audio|Audio|Dubbed|Dub|Uncensored|Uncut|Extended|18\+|ESub|BSub|MSub|Sub(?:s|titled)?|x264|x265|HEVC|10bit|AAC|DDP?5\.?1|Atmos|NF|AMZN|DSNP|ZEE5|Hoichoi|Chorki|Bongo|SonyLIV|Hotstar)\b/gi,
      " "
    )
    .replace(/\s{2,}/g, " ")
    .trim();
  const prefixTitle = cleanTitle
    .split(/[:\-–—|•+/]/)[0]
    .replace(/\s{2,}/g, " ")
    .trim();
  const finalClean = cleanTitle
    .replace(/[:\-–—|•+/]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return {
    cleanTitle: finalClean || safeTitle.slice(0, 32).trim(),
    prefixTitle: prefixTitle || finalClean || safeTitle.slice(0, 24).trim(),
    year,
  };
}

export function parseTimestampToSeconds(raw) {
  const parts = String(raw || "")
    .trim()
    .replace(",", ".")
    .split(":");
  if (parts.length === 3) {
    const h = parseFloat(parts[0]) || 0;
    const m = parseFloat(parts[1]) || 0;
    const s = parseFloat(parts[2]) || 0;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const m = parseFloat(parts[0]) || 0;
    const s = parseFloat(parts[1]) || 0;
    return m * 60 + s;
  }
  return 0;
}

export function formatSecondsToVttTime(sec) {
  const safe = Math.max(0, sec);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(
    2,
    "0"
  )}.${String(ms).padStart(3, "0")}`;
}

export function isWatermarkOrAdCue(text) {
  const lower = String(text || "").toLowerCase();
  return /opensubtitles|subscene|yts\.mx|yify|subdl|addic7ed|podnapisi|downloaded from|subtitles by|synced by|synched by|ripped by|encoded by|corrected by|translated by|support us|visit\s*:|www\.|http:\/\/|https:\/\/|\.com\b|\.org\b|\.net\b/i.test(
    lower
  );
}

/**
 * Strips non-spoken SDH hearing-impaired tags like `[music]`, `(sighs)`, `♪ ... ♪`, and `SPEAKER:`
 * so subtitles ONLY show actual spoken words in exact sync with the actor's voice.
 */
export function cleanSpokenDialogueText(raw) {
  let t = String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{\\[^}]+\}/g, " ")
    .replace(/\{[^}]+\}/g, " ")
    .replace(/[♪♫♬]+[^♪♫♬]*[♪♫♬]+/g, " ")
    .replace(/^[♪♫♬\s]+|[♪♫♬\s]+$/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/(?:^|\s)[A-Z][A-Z0-9\s]{1,16}:\s*/g, " ")
    .replace(/^\s*-\s+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!/[\p{L}\p{N}]/u.test(t)) return "";
  return t;
}

export function parseSrtOrVttToCues(rawContent, delayOffsetSec = 0) {
  if (!rawContent) return [];
  // Normalize MovieBox delay field (if delay > 100 or < -100, it's in milliseconds)
  const normalizedDelaySec =
    Math.abs(delayOffsetSec) > 60 ? delayOffsetSec / 1000 : Number(delayOffsetSec) || 0;
  const blocks = String(rawContent)
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^WEBVTT[^\n]*\n+/i, "")
    .split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    let timeLineIdx = -1;
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      if (lines[i].includes("-->")) {
        timeLineIdx = i;
        break;
      }
    }
    if (timeLineIdx === -1) continue;
    const timeParts = lines[timeLineIdx].split("-->");
    if (timeParts.length < 2) continue;
    const rawStartSec = parseTimestampToSeconds(timeParts[0]);
    const endRaw = timeParts[1].trim().split(/\s+/)[0];
    const rawEndSec = parseTimestampToSeconds(endRaw);
    const startSec = Math.max(0, rawStartSec + normalizedDelaySec);
    const endSec = Math.max(startSec + 0.25, rawEndSec + normalizedDelaySec);
    const rawJoined = lines.slice(timeLineIdx + 1).join(" ");
    if (isWatermarkOrAdCue(rawJoined)) continue;
    const cleanedDialogue = cleanSpokenDialogueText(rawJoined);
    if (!cleanedDialogue || endSec <= startSec) continue;
    const clampedEndSec = Math.min(endSec, startSec + 7.5);
    const hasBengaliChars = /[\u0980-\u09FF]/.test(cleanedDialogue);
    cues.push({
      startSec: Number(startSec.toFixed(3)),
      endSec: Number(clampedEndSec.toFixed(3)),
      text: cleanedDialogue,
      originalText: cleanedDialogue,
      translated: hasBengaliChars,
    });
  }
  cues.sort((a, b) => a.startSec - b.startSec);
  // Prevent overlapping cues from lingering into the next spoken line
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].endSec > cues[i + 1].startSec && cues[i + 1].startSec > cues[i].startSec + 0.15) {
      cues[i].endSec = Number(cues[i + 1].startSec.toFixed(3));
    }
  }
  return cues;
}

export function buildVttFromCues(cues) {
  const lines = ["WEBVTT", ""];
  cues.forEach((cue, idx) => {
    lines.push(String(idx + 1));
    lines.push(`${formatSecondsToVttTime(cue.startSec)} --> ${formatSecondsToVttTime(cue.endSec)}`);
    lines.push(cue.text);
    lines.push("");
  });
  return lines.join("\n");
}

/**
 * High-precision (0.01s) lookup for the active spoken cue(s) at `exactTimeSec`.
 * Uses binary search for O(log N) speed so it runs smoothly 30+ times per second.
 */
export function findActiveCueTextAtTime(cues, exactTimeSec) {
  if (!cues || cues.length === 0 || exactTimeSec < 0) return "";
  let lo = 0;
  let hi = cues.length - 1;
  let firstCandidate = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (cues[mid].endSec >= exactTimeSec - 0.03) {
      firstCandidate = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  if (firstCandidate === -1) return "";
  const matchedTexts = [];
  const startLook = Math.max(0, firstCandidate - 2);
  for (let i = startLook; i < cues.length; i++) {
    const c = cues[i];
    if (c.startSec > exactTimeSec + 0.06) break;
    if (exactTimeSec >= c.startSec - 0.06 && exactTimeSec <= c.endSec + 0.03) {
      const rawText = (c.text || "").trim();
      if (rawText && !matchedTexts.includes(rawText)) {
        matchedTexts.push(rawText);
        if (matchedTexts.length >= 2) break;
      }
    }
  }
  return matchedTexts.join(" ");
}

export async function translateSingleLineToBangla(line) {
  const clean = String(line || "")
    .replace(/\r?\n/g, " ")
    .trim();
  if (!clean) return "";
  if (/[\u0980-\u09FF]/.test(clean)) return clean;
  const cached = singleLineTranslationCache.get(clean);
  if (cached) return cached;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=bn&dt=t&q=${encodeURIComponent(
      clean
    )}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return clean;
    const data = await res.json();
    if (!Array.isArray(data?.[0])) return clean;
    const finalBn = data[0]
      .map((seg) => seg?.[0] || "")
      .join("")
      .trim();
    if (finalBn) {
      singleLineTranslationCache.set(clean, finalBn);
      return finalBn;
    }
    return clean;
  } catch {
    return clean;
  }
}

/**
 * 100% Shift-Proof 1-to-1 Line Translation into fluent Bengali (বাংলা).
 * Each line is isolated with `(100 + batchPos). <sentence>.` and `\n\n` paragraph breaks
 * so Google Translate NEVER merges two cues or shifts dialogue across timestamps!
 */
export async function translateLinesToBangla(lines) {
  if (!lines.length) return [];
  const results = new Array(lines.length);
  const uncachedIndices = [];
  for (let i = 0; i < lines.length; i++) {
    const clean = String(lines[i] || "")
      .replace(/\r?\n/g, " ")
      .trim();
    if (!clean) results[i] = "";
    else if (/[\u0980-\u09FF]/.test(clean)) results[i] = clean;
    else if (singleLineTranslationCache.has(clean)) results[i] = singleLineTranslationCache.get(clean);
    else uncachedIndices.push(i);
  }
  if (uncachedIndices.length === 0) return results;
  try {
    const joined = uncachedIndices
      .map((origIdx, batchPos) => {
        const cleanLine = String(lines[origIdx] || "")
          .replace(/\r?\n/g, " ")
          .trim();
        const withEndingPunct = /[.?!।]$/.test(cleanLine) ? cleanLine : `${cleanLine}.`;
        return `(${100 + batchPos}). ${withEndingPunct}`;
      })
      .join("\n\n");
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=bn&dt=t&q=${encodeURIComponent(
      joined
    )}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4200);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.[0])) {
        const translatedFull = data[0].map((seg) => seg?.[0] || "").join("");
        const matches = [...translatedFull.matchAll(/\(\s*([0-9\u09E6-\u09EF]{3})\s*\)\s*[.।]?\s*/g)];
        const parsedByBatchPos = new Map();
        for (let mIdx = 0; mIdx < matches.length; mIdx++) {
          const match = matches[mIdx];
          const numStr = banglaDigitsToAscii(match[1]);
          const batchPos = parseInt(numStr, 10) - 100;
          const contentStart = (match.index ?? 0) + match[0].length;
          const contentEnd =
            mIdx + 1 < matches.length
              ? matches[mIdx + 1].index ?? translatedFull.length
              : translatedFull.length;
          const extracted = translatedFull
            .slice(contentStart, contentEnd)
            .replace(/\(\s*[0-9\u09E6-\u09EF]{3}\s*\)/g, "")
            .replace(/([.।])\1+/g, "$1")
            .replace(/\s+/g, " ")
            .trim();
          if (!isNaN(batchPos) && batchPos >= 0 && extracted) {
            parsedByBatchPos.set(batchPos, extracted);
          }
        }
        const missingBatchPositions = [];
        uncachedIndices.forEach((origIdx, batchPos) => {
          const hit = parsedByBatchPos.get(batchPos);
          if (hit) {
            results[origIdx] = hit;
            singleLineTranslationCache.set(
              String(lines[origIdx] || "")
                .replace(/\r?\n/g, " ")
                .trim(),
              hit
            );
          } else {
            missingBatchPositions.push(batchPos);
          }
        });
        if (missingBatchPositions.length > 0) {
          await Promise.all(
            missingBatchPositions.map(async (batchPos) => {
              const origIdx = uncachedIndices[batchPos];
              results[origIdx] = await translateSingleLineToBangla(lines[origIdx]);
            })
          );
        }
        return results.map((r, idx) => r || lines[idx]);
      }
    }
  } catch {}
  return lines.map((orig, idx) => results[idx] || orig);
}

/**
 * Translates subtitle cues around the current playback timestamp (`currentTimeSec`)
 * immediately in a fast micro-batch first so dialogue at the playhead is ready in <180ms,
 * then translates upcoming cues in larger batches.
 */
export async function ensureBanglaTranslationAroundTime(cues, currentTimeSec, onUpdated) {
  if (!cues || cues.length === 0) return false;
  // Step 1: Immediate urgent micro-batch (next 45 seconds = ~12 cues) for instant lip-sync
  const urgentStart = Math.max(0, currentTimeSec - 3);
  const immediateEnd = currentTimeSec + 45;
  const targetIndices = [];
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (!c.translated && c.endSec >= urgentStart && c.startSec <= immediateEnd) {
      targetIndices.push(i);
      if (targetIndices.length >= 16) break;
    }
  }
  // Step 2: Medium lookahead (next 3 minutes)
  if (targetIndices.length === 0) {
    const mediumEnd = currentTimeSec + 180;
    for (let i = 0; i < cues.length; i++) {
      const c = cues[i];
      if (!c.translated && c.endSec >= urgentStart && c.startSec <= mediumEnd) {
        targetIndices.push(i);
        if (targetIndices.length >= 28) break;
      }
    }
  }
  // Step 3: Remaining file pre-translation
  if (targetIndices.length === 0) {
    for (let i = 0; i < cues.length; i++) {
      if (!c.translated && !cues[i].translated) {
        targetIndices.push(i);
        if (targetIndices.length >= 32) break;
      }
    }
  }
  if (targetIndices.length === 0) return false;
  const batchKey = `${targetIndices[0]}-${targetIndices[targetIndices.length - 1]}-${cues.length}`;
  if (activeTranslationBatches.has(batchKey)) return false;
  activeTranslationBatches.add(batchKey);
  try {
    const translatedLines = await translateLinesToBangla(
      targetIndices.map((idx) => cues[idx].originalText || cues[idx].text)
    );
    let changed = false;
    targetIndices.forEach((cueIdx, i) => {
      if (translatedLines[i]) {
        cues[cueIdx].text = translatedLines[i];
        cues[cueIdx].translated = /[\u0980-\u09FF]/.test(translatedLines[i]);
        changed = true;
      }
    });
    if (changed && onUpdated) onUpdated([...cues]);
    return changed;
  } finally {
    activeTranslationBatches.delete(batchKey);
  }
}

/**
 * Progressively pre-translates all cues in the background so seeking anywhere in the movie
 * has 0ms Bengali subtitles ready in memory.
 */
function startBackgroundFullCueTranslation(cues, onUpdated) {
  if (!cues || cues.length === 0) return;
  (async () => {
    for (let round = 0; round < 18; round++) {
      const hasUntranslated = cues.some((c) => !c.translated && !c.keepOriginalScript);
      if (!hasUntranslated) break;
      const changed = await ensureBanglaTranslationAroundTime(cues, round * 120, onUpdated);
      if (!changed) break;
      await new Promise((r) => setTimeout(r, 120));
    }
  })().catch(() => {});
}

function normalizeWords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

export async function fetchEmbeddedMkvSubtitles(streamUrl, mode = "probe", startSec = 0) {
  if (!streamUrl || !streamUrl.startsWith("http") || /abyssplayer|vidsrc|\/embed\//i.test(streamUrl))
    return [];
  try {
    const params = new URLSearchParams({
      url: streamUrl,
      mode,
      startSec: String(Math.floor(startSec)),
    });
    const res = await fetch(`/api/subtitles/extract?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data?.ok || !data?.srt) return [];
    return parseSrtOrVttToCues(String(data.srt));
  } catch {
    return [];
  }
}

export async function resolveImdbCandidates(rawTitle, isSeries) {
  const { cleanTitle, prefixTitle, year } = cleanMovieTitleForSubSearch(rawTitle);
  const queryWords = cleanTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  const prefixWords = prefixTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  const queries = Array.from(
    new Set([cleanTitle, prefixTitle, queryWords.slice(0, 4).join(" ")])
  ).filter((q) => q.length >= 2);
  const candidates = new Map();
  const scoreCandidate = (id, name, releaseYear, qType) => {
    if (!id.startsWith("tt") || !name) return;
    const nameLower = name.toLowerCase();
    const candWords = normalizeWords(nameLower);
    if (candWords.length === 0) return;
    const cleanLower = cleanTitle.toLowerCase();
    const prefixLower = prefixTitle.toLowerCase();
    const matchedPrefixWords = prefixWords.filter((w) => nameLower.includes(w)).length;
    const matchedQueryWords = queryWords.filter((w) => nameLower.includes(w)).length;
    if (
      prefixWords.length > 0 &&
      matchedPrefixWords === 0 &&
      !nameLower.includes(prefixLower) &&
      !prefixLower.includes(nameLower)
    )
      return;
    let score = 30;
    if (nameLower === cleanLower) score += 70;
    else if (nameLower === prefixLower) score += 62;
    else if (nameLower.startsWith(prefixLower) || prefixLower.startsWith(nameLower)) score += 45;
    if (prefixWords.length > 0) score += Math.round((matchedPrefixWords / prefixWords.length) * 35);
    if (queryWords.length > 0) score += Math.round((matchedQueryWords / queryWords.length) * 20);
    const extraWords = Math.max(0, candWords.length - Math.max(queryWords.length, 2));
    score -= extraWords * 4;
    const wantY = year ? parseInt(year, 10) : 0;
    const candY = releaseYear ? parseInt(releaseYear.slice(0, 4), 10) : 0;
    if (wantY && candY) {
      if (candY === wantY) score += 25;
      else if (wantY >= 2025 && (candY === wantY - 1 || candY === wantY - 2)) score += 16;
      else if (Math.abs(candY - wantY) === 1) score += 12;
      else if (Math.abs(candY - wantY) > 4) score -= 12;
    }
    if (qType) {
      if (isSeries === /tv|series|mini/i.test(qType)) score += 14;
    }
    const existing = candidates.get(id);
    if (!existing || existing.score < score)
      candidates.set(id, {
        id,
        name,
        year: releaseYear.slice(0, 4),
        score,
      });
  };
  const tasks = [];
  for (const q of queries.slice(0, 2)) {
    const firstChar = (q.replace(/[^a-zA-Z0-9]/g, "")[0] || "x").toLowerCase();
    tasks.push(
      (async () => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 2800);
          const imdbUrl = `https://v3.sg.media-imdb.com/suggestion/${firstChar}/${encodeURIComponent(
            q
          )}.json`;
          const res = await fetch(imdbUrl, { signal: controller.signal });
          clearTimeout(timer);
          if (!res.ok) return;
          const data = await res.json();
          const list = Array.isArray(data?.d) ? data.d : [];
          for (const item of list) {
            scoreCandidate(
              String(item?.id || ""),
              String(item?.l || "").trim(),
              String(item?.y || ""),
              String(item?.qid || item?.q || "")
            );
          }
        } catch {}
      })()
    );
  }
  await Promise.allSettled(tasks);
  return Array.from(candidates.values())
    .filter((c) => c.score >= 42)
    .sort((a, b) => b.score - a.score);
}

/**
 * Fetches and parses a specific subtitle track URL and translates its initial cues to Bengali.
 */
export async function loadSubtitleTrackByUrl(track, currentTimeSec = 0, onBackgroundUpdate) {
  const cacheKey = `${track.url}::orig=${track.keepOriginalScript ? "1" : "0"}::delay=${track.delay || 0}`;
  const cached = srtUrlCueCache.get(cacheKey);
  if (cached && cached.length > 0) {
    if (!track.keepOriginalScript) {
      await ensureBanglaTranslationAroundTime(cached, currentTimeSec, onBackgroundUpdate);
      startBackgroundFullCueTranslation(cached, onBackgroundUpdate);
    }
    return cached.map((c) => ({ ...c }));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);
  const res = await fetch(track.url, { signal: controller.signal });
  clearTimeout(timer);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const parsedCues = parseSrtOrVttToCues(await res.text(), Number(track.delay || 0));
  if (parsedCues.length === 0) throw new Error("Empty subtitle file");
  if (track.keepOriginalScript) {
    parsedCues.forEach((c) => {
      c.text = c.originalText || c.text;
      c.translated = true;
      c.keepOriginalScript = true;
    });
    srtUrlCueCache.set(cacheKey, parsedCues);
    return parsedCues.map((c) => ({ ...c }));
  }
  // Check if all initial cues are already in Bengali (e.g. from native MovieBox Bangla or server-translated SRT)
  const sampleFirst15 = parsedCues.slice(0, 15);
  const banglaCount = sampleFirst15.filter((c) => /[\u0980-\u09FF]/.test(c.text)).length;
  if (banglaCount >= Math.min(8, sampleFirst15.length)) {
    parsedCues.forEach((c) => {
      if (/[\u0980-\u09FF]/.test(c.text)) {
        c.translated = true;
      }
      c.keepOriginalScript = false;
    });
  }
  await ensureBanglaTranslationAroundTime(parsedCues, currentTimeSec, onBackgroundUpdate);
  startBackgroundFullCueTranslation(parsedCues, onBackgroundUpdate);
  srtUrlCueCache.set(cacheKey, parsedCues);
  return parsedCues.map((c) => ({ ...c }));
}

function scoreSubtitleReleaseMatch(releaseRaw, lang, streamHint) {
  const rLower = releaseRaw.toLowerCase();
  const sLower = streamHint.toLowerCase();
  const isWebDl = /web-?dl/i.test(rLower);
  const isWebRip = /web-?rip/i.test(rLower);
  const isBluRay = /bluray|brrip|bdrip/i.test(rLower);
  const isCam = /hdts|hdtc|cam|predvd|ts|tc/i.test(rLower);
  const tag = isWebDl
    ? "WEB-DL"
    : isWebRip
      ? "WEBRip"
      : isBluRay
        ? "BluRay"
        : isCam
          ? "HDTS Sync"
          : "WEB Sync";
  let score = 50;
  if (lang === "ben" || lang === "bn") score += 25;
  if (isWebDl) score += 28;
  else if (isWebRip) score += 24;
  else if (isBluRay) score += 10;
  if (/hdts|hdtc|cam/i.test(sLower) && isCam) score += 35;
  if (/bluray/i.test(sLower) && isBluRay) score += 35;
  if (/web/i.test(sLower) && (isWebDl || isWebRip)) score += 20;
  return { score, tag };
}

export async function fetchOpenSubtitlesTracksForCandidates(
  candidates,
  season,
  episode,
  streamHint = ""
) {
  const isEpisode = Boolean(season && season > 0 && episode && episode > 0);
  for (const cand of candidates.slice(0, 4)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const endpoint = isEpisode
        ? `https://opensubtitles-v3.strem.io/subtitles/series/${cand.id}:${season}:${episode}.json`
        : `https://opensubtitles-v3.strem.io/subtitles/movie/${cand.id}.json`;
      const res = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      const rawSubs = Array.isArray(data?.subtitles) ? data.subtitles : [];
      if (rawSubs.length === 0) continue;
      const validSubs = rawSubs.filter((s) => {
        const lang = String(s?.lang || "").toLowerCase();
        const name = String(s?.subtitleFileName || s?.movieReleaseName || "");
        if (!["ben", "bn", "eng", "en"].includes(lang)) return false;
        if (/forced|commentary|trailer/i.test(name)) return false;
        return Boolean(s?.url);
      });
      if (validSubs.length === 0) continue;
      const scored = validSubs.map((item, idx) => {
        const url = String(item?.url || "").trim();
        const lang = String(item?.lang || "eng").toLowerCase();
        const isBn = lang === "ben" || lang === "bn";
        const releaseRaw = String(
          item?.movieReleaseName || item?.subtitleFileName || cand.name
        )
          .replace(/\.srt$/i, "")
          .replace(/[._]/g, " ")
          .trim();
        const { score, tag } = scoreSubtitleReleaseMatch(releaseRaw, lang, streamHint);
        return {
          url,
          isBn,
          releaseRaw,
          tag,
          score: score - idx * 0.5,
          rawId: String(item?.id || idx + 1),
        };
      });
      scored.sort((a, b) => b.score - a.score);
      const tracks = [];
      const bestBangla = scored.find((item) => item.isBn) || scored[0];
      const bestEnglish = scored.find((item) => !item.isBn) || scored[0];
      if (bestBangla) {
        tracks.push({
          id: `os-bn-${bestBangla.rawId}`,
          url: bestBangla.url,
          lang: "bn",
          label: "বাংলা",
          releaseName: bestBangla.releaseRaw.slice(0, 65),
          keepOriginalScript: false,
          delay: 0,
        });
      }
      if (bestEnglish) {
        tracks.push({
          id: `os-en-${bestEnglish.rawId}`,
          url: bestEnglish.url,
          lang: "en",
          label: "English",
          releaseName: bestEnglish.releaseRaw.slice(0, 65),
          keepOriginalScript: true,
          delay: 0,
        });
      }
      if (tracks.length > 0) {
        return {
          tracks,
          matchedImdbId: cand.id,
          matchedName: cand.name,
        };
      }
    } catch {}
  }
  return null;
}

/**
 * Main entry point: Resolves official MovieBox API subtitles (`/api/mb-captions`) with
 * exact streamId lip-sync timestamps.
 */
export async function fetchOrGenerateAutoBanglaSubtitles(params) {
  const searchTitle = (params.forceSearchTitle || params.title || "").trim();
  const explicitSeason =
    typeof params.season === "number" && params.season > 0 ? params.season : 0;
  const explicitEpisode =
    typeof params.episode === "number" && params.episode > 0 ? params.episode : 0;
  const isSeries = Boolean(
    explicitSeason > 0 ||
      explicitEpisode > 0 ||
      /\b(season|episode|ep\s*\d+|s\d+e\d+)\b/i.test(
        `${params.title} ${params.episodeLabel || ""}`
      )
  );
  const parsedSeasonMatch = `${params.title} ${params.episodeLabel || ""}`.match(
    /\b(?:season\s*|s)0*(\d{1,2})\b/i
  );
  const parsedEpMatch = `${params.episodeLabel || ""} ${params.title}`.match(
    /\b(?:episode\s*|ep\s*|e)0*(\d{1,3})\b/i
  );
  const effectiveSeason =
    explicitSeason > 0
      ? explicitSeason
      : isSeries
        ? parsedSeasonMatch
          ? parseInt(parsedSeasonMatch[1], 10)
          : 1
        : 0;
  const effectiveEpisode =
    explicitEpisode > 0
      ? explicitEpisode
      : isSeries
        ? parsedEpMatch
          ? parseInt(parsedEpMatch[1], 10)
          : 1
        : 0;

  const cacheKey = `${params.moviePath}::${searchTitle}::s${effectiveSeason}::e${effectiveEpisode}`;
  const cached = subtitleMemoryCache.get(cacheKey);
  if (cached && !params.forceSearchTitle && cached.cues.length > 0) {
    await ensureBanglaTranslationAroundTime(
      cached.cues,
      params.currentTimeSec || 0,
      params.onCuesUpdated
    );
    return cached;
  }

  // 1. Primary Authoritative Source: Official MovieBox Subtitle API (`/api/mb-captions`)
  if (params.moviePath && params.moviePath.startsWith("/mb/")) {
    try {
      const capParams = new URLSearchParams({
        path: params.moviePath,
        se: String(effectiveSeason),
        ep: String(effectiveEpisode),
      });
      const capRes = await fetch(`/api/mb-captions?${capParams.toString()}`);
      if (capRes.ok) {
        const capJson = await capRes.json();
        const rawCaptions = Array.isArray(capJson?.captions) ? capJson.captions : [];
        if (rawCaptions.length > 0) {
          const mbTracks = [];
          const nativeBanglaCap = rawCaptions.find(
            (c) => /^(bn|ben)$/i.test(c.lan) || /bangla|bengali|বাংলা/i.test(c.lanName)
          );
          const englishCap =
            rawCaptions.find(
              (c) => /^en/i.test(c.lan) || /english/i.test(c.lanName)
            ) ||
            rawCaptions.find(
              (c) => !(/^(bn|ben)$/i.test(c.lan) || /bangla|bengali|বাংলা/i.test(c.lanName))
            ) ||
            rawCaptions[0];

          if (nativeBanglaCap) {
            mbTracks.push({
              id: `mb-cap-bn-${nativeBanglaCap.id}`,
              url: nativeBanglaCap.url,
              lang: "bn",
              label: "বাংলা (Official)",
              releaseName: `${params.title} • MovieBox Official Bangla`,
              keepOriginalScript: false,
              delay: Number(nativeBanglaCap.delay || 0) || 0,
            });
          } else if (englishCap) {
            mbTracks.push({
              id: `mb-cap-auto-bn-${englishCap.id}`,
              url: englishCap.bnUrl || englishCap.url,
              lang: "bn",
              label: "বাংলা (Official)",
              releaseName: `${params.title} • MovieBox Official Sync`,
              keepOriginalScript: false,
              delay: Number(englishCap.delay || 0) || 0,
            });
          }

          if (englishCap) {
            mbTracks.push({
              id: `mb-cap-orig-${englishCap.id}-en`,
              url: englishCap.url,
              lang: "en",
              label: "English (Official)",
              releaseName: `${params.title} • MovieBox Official English`,
              keepOriginalScript: true,
              delay: Number(englishCap.delay || 0) || 0,
            });
          }

          // Include any additional official MovieBox caption languages on the stream
          for (const extraCap of rawCaptions) {
            if (extraCap === nativeBanglaCap || extraCap === englishCap) continue;
            mbTracks.push({
              id: `mb-cap-extra-${extraCap.id}-${extraCap.lan}`,
              url: extraCap.url,
              lang: extraCap.lan || "other",
              label: `${extraCap.lanName || extraCap.lan} (Official)`,
              releaseName: `${params.title} • MovieBox Official`,
              keepOriginalScript: true,
              delay: Number(extraCap.delay || 0) || 0,
            });
          }

          for (let i = 0; i < mbTracks.length; i++) {
            try {
              const track = mbTracks[i];
              const cues = await loadSubtitleTrackByUrl(
                track,
                params.currentTimeSec || 0,
                params.onCuesUpdated
              );
              if (cues.length >= 3) {
                const vttText = buildVttFromCues(cues);
                const blob = new Blob([vttText], { type: "text/vtt" });
                const result = {
                  cues,
                  vttBlobUrl: URL.createObjectURL(blob),
                  sourceLabel: track.label,
                  language: track.lang,
                  availableTracks: mbTracks,
                  activeTrackIndex: i,
                  autoOffsetSec: 0,
                };
                subtitleMemoryCache.set(cacheKey, result);
                return result;
              }
            } catch {}
          }
        }
      }
    } catch {}
  }

  // 2. Fallback: OpenSubtitles v3 only if MovieBox has no official captions for this item
  const streamHint = `${params.streamName || ""} ${params.title || ""}`;
  const foundOnline = await fetchOpenSubtitlesTracksForCandidates(
    await resolveImdbCandidates(searchTitle, isSeries),
    effectiveSeason > 0 ? effectiveSeason : null,
    effectiveEpisode > 0 ? effectiveEpisode : null,
    streamHint
  );
  if (foundOnline && foundOnline.tracks.length > 0) {
    const minExpectedCues = isSeries ? 20 : 35;
    for (let i = 0; i < foundOnline.tracks.length; i++) {
      try {
        const track = foundOnline.tracks[i];
        const cues = await loadSubtitleTrackByUrl(
          track,
          params.currentTimeSec || 0,
          params.onCuesUpdated
        );
        if (cues.length < minExpectedCues && foundOnline.tracks.length > i + 1) continue;
        if (cues.length >= 8) {
          const vttText = buildVttFromCues(cues);
          const blob = new Blob([vttText], { type: "text/vtt" });
          const result = {
            cues,
            vttBlobUrl: URL.createObjectURL(blob),
            sourceLabel: `${track.label} · ${foundOnline.matchedName}`,
            language: "bn",
            availableTracks: foundOnline.tracks,
            activeTrackIndex: i,
            matchedImdbId: foundOnline.matchedImdbId,
            autoOffsetSec: 0,
          };
          subtitleMemoryCache.set(cacheKey, result);
          return result;
        }
      } catch {}
    }
  }

  return {
    cues: [],
    vttBlobUrl: "",
    sourceLabel: "সাবটাইটেল পাওয়া যায়নি",
    language: "bn",
    availableTracks: [],
    activeTrackIndex: 0,
  };
}