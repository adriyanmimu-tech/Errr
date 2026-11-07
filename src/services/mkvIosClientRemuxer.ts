// @ts-nocheck
// src/services/mkvIosClientRemuxer.ts
export function readVint(b, pos) {
	if (pos >= b.byteLength) return null;
	const b0 = b[pos];
	if (b0 === 0) return null;
	let len = 1;
	let mask = 128;
	while (len <= 8 && (b0 & mask) === 0) {
		len++;
		mask >>= 1;
	}
	if (len > 8 || pos + len > b.byteLength) return null;
	let val = b0 & mask - 1;
	let allOnes = val === mask - 1;
	for (let i = 1; i < len; i++) {
		val = val * 256 + b[pos + i];
		if (b[pos + i] !== 255) allOnes = false;
	}
	return {
		val: allOnes ? -1 : val,
		len
	};
}
export function readEbmlId(b, pos) {
	if (pos >= b.byteLength) return null;
	const b0 = b[pos];
	if (b0 === 0) return null;
	let len = 1;
	let mask = 128;
	while (len <= 4 && (b0 & mask) === 0) {
		len++;
		mask >>= 1;
	}
	if (len > 4 || pos + len > b.byteLength) return null;
	let id = 0;
	for (let i = 0; i < len; i++) id = id * 256 + b[pos + i];
	return {
		id,
		len
	};
}
export function readUint(b, pos, len) {
	let v = 0;
	for (let i = 0; i < len; i++) v = v * 256 + b[pos + i];
	return v;
}
export function readFloat(b, pos, len) {
	if (pos + len > b.byteLength) return 0;
	const dv = new DataView(b.buffer, b.byteOffset + pos, len);
	if (len === 4) return dv.getFloat32(0, false);
	if (len === 8) return dv.getFloat64(0, false);
	return 0;
}
export function decodeAscii(b, start, end) {
	let s = "";
	for (let i = start; i < end; i++) {
		if (b[i] === 0) break;
		s += String.fromCharCode(b[i]);
	}
	return s;
}
export function findClusterOffset(b, fromPos) {
	const limit = b.byteLength - 4;
	for (let i = Math.max(0, fromPos); i <= limit; i++) if (b[i] === 31 && b[i + 1] === 67 && b[i + 2] === 182 && b[i + 3] === 117) return i;
	return -1;
}
export function parseMkvHeaderAndSamples(b, existingTracks, existingTimecodeScale) {
	let pos = 0;
	let timecodeScale = existingTimecodeScale || 1e6;
	let rawDuration = 0;
	const tracks = existingTracks ? [...existingTracks] : [];
	const videoSamples = [];
	const audioSamples = [];
	const subtitleSamples = [];
	let currentClusterTime = 0;
	let lastCompleteClusterEnd = 0;
	let segmentDataOffset = 52;
	let firstClusterOffset = -1;
	let cuesByteOffset = -1;
	const parseTracksElement = (start, end) => {
		if (tracks.length > 0) return;
		let p = start;
		while (p < end) {
			const idObj = readEbmlId(b, p);
			if (!idObj) break;
			const szObj = readVint(b, p + idObj.len);
			if (!szObj) break;
			const dStart = p + idObj.len + szObj.len;
			const dEnd = szObj.val < 0 ? end : Math.min(end, dStart + szObj.val);
			if (idObj.id === 174) {
				const track = {
					number: 0,
					type: 0,
					codecId: "",
					codecPrivate: null,
					width: 1280,
					height: 720,
					sampleRate: 44100,
					outSampleRate: 0,
					channels: 2,
					defaultDuration: 0
				};
				let tp = dStart;
				while (tp < dEnd) {
					const tid = readEbmlId(b, tp);
					if (!tid) break;
					const tsz = readVint(b, tp + tid.len);
					if (!tsz) break;
					const tds = tp + tid.len + tsz.len;
					const tde = tsz.val < 0 ? dEnd : Math.min(dEnd, tds + tsz.val);
					if (tid.id === 215) track.number = readUint(b, tds, tsz.val);
					else if (tid.id === 131) track.type = readUint(b, tds, tsz.val);
					else if (tid.id === 134) track.codecId = decodeAscii(b, tds, tde);
					else if (tid.id === 25506) track.codecPrivate = b.slice(tds, tde);
					else if (tid.id === 2352003) track.defaultDuration = readUint(b, tds, tsz.val);
					else if (tid.id === 224) {
						let vp = tds;
						while (vp < tde) {
							const vid = readEbmlId(b, vp);
							if (!vid) break;
							const vsz = readVint(b, vp + vid.len);
							if (!vsz) break;
							const vds = vp + vid.len + vsz.len;
							if (vid.id === 176) track.width = readUint(b, vds, vsz.val);
							else if (vid.id === 186) track.height = readUint(b, vds, vsz.val);
							vp = vds + vsz.val;
						}
					} else if (tid.id === 225) {
						let ap = tds;
						while (ap < tde) {
							const aid = readEbmlId(b, ap);
							if (!aid) break;
							const asz = readVint(b, ap + aid.len);
							if (!asz) break;
							const ads = ap + aid.len + asz.len;
							if (aid.id === 181) track.sampleRate = readFloat(b, ads, asz.val);
							else if (aid.id === 30901) track.outSampleRate = readFloat(b, ads, asz.val);
							else if (aid.id === 159) track.channels = readUint(b, ads, asz.val);
							ap = ads + asz.val;
						}
					}
					tp = tde;
				}
				tracks.push(track);
			}
			p = dEnd;
		}
	};
	const handleBlock = (dStart, dEnd, isKeyframeHint, blockDurationTicks = 0) => {
		const trkVint = readVint(b, dStart);
		if (!trkVint) return;
		const trackNum = trkVint.val;
		let bp = dStart + trkVint.len;
		if (bp + 3 > dEnd) return;
		let relTime = b[bp] << 8 | b[bp + 1];
		if (relTime & 32768) relTime -= 65536;
		const flags = b[bp + 2];
		bp += 3;
		const scaleMs = timecodeScale / 1e6;
		const absTimeMs = (currentClusterTime + relTime) * scaleMs;
		const isKeyframe = isKeyframeHint || Boolean(flags & 128);
		const lacing = flags >> 1 & 3;
		const frames = [];
		if (lacing === 0) {
			if (bp < dEnd) frames.push(b.subarray(bp, dEnd));
		} else if (bp < dEnd) {
			const numFrames = b[bp] + 1;
			bp += 1;
			const sizes = [];
			if (lacing === 1) {
				let sum = 0;
				for (let i = 0; i < numFrames - 1; i++) {
					let s = 0;
					while (bp < dEnd && b[bp] === 255) {
						s += 255;
						bp++;
					}
					if (bp < dEnd) {
						s += b[bp];
						bp++;
					}
					sizes.push(s);
					sum += s;
				}
				sizes.push(dEnd - bp - sum);
			} else if (lacing === 2) {
				const fsz = Math.floor((dEnd - bp) / numFrames);
				for (let i = 0; i < numFrames; i++) sizes.push(fsz);
			} else if (lacing === 3) {
				const first = readVint(b, bp);
				if (!first) return;
				bp += first.len;
				let prev = first.val;
				sizes.push(prev);
				let sum = prev;
				for (let i = 1; i < numFrames - 1; i++) {
					const dv = readVint(b, bp);
					if (!dv) return;
					bp += dv.len;
					const bias = (1 << 7 * dv.len - 1) - 1;
					prev = prev + (dv.val - bias);
					sizes.push(prev);
					sum += prev;
				}
				sizes.push(dEnd - bp - sum);
			}
			for (const sz of sizes) if (sz > 0 && bp + sz <= dEnd) {
				frames.push(b.subarray(bp, bp + sz));
				bp += sz;
			}
		}
		const vTrack = tracks.find((t) => t.type === 1);
		const aTrack = tracks.find((t) => t.type === 2 && /AAC/i.test(t.codecId)) || tracks.find((t) => t.type === 2);
		const sTrack = tracks.find((t) => t.type === 17 && t.number === trackNum);
		if (vTrack && trackNum === vTrack.number) {
			const frameDurMs = vTrack.defaultDuration ? vTrack.defaultDuration / 1e6 : 33.333;
			for (let i = 0; i < frames.length; i++) videoSamples.push({
				ptsMs: absTimeMs + i * frameDurMs,
				data: frames[i],
				keyframe: isKeyframe && i === 0
			});
		} else if (aTrack && trackNum === aTrack.number) {
			const frameDurMs = 1024 / (aTrack.sampleRate || 44100) * 1e3;
			for (let i = 0; i < frames.length; i++) audioSamples.push({
				ptsMs: absTimeMs + i * frameDurMs,
				data: frames[i]
			});
		} else if (sTrack && frames.length > 0) try {
			const rawStr = new TextDecoder("utf-8").decode(frames[0]);
			let cleanText = rawStr;
			if (/ASS|SSA/i.test(sTrack.codecId)) {
				const parts = rawStr.split(",");
				if (parts.length >= 9) cleanText = parts.slice(8).join(",");
			}
			cleanText = cleanText.replace(/\{\\[^}]*\}/g, "").replace(/\\N|\\n/g, " ").replace(/<[^>]+>/g, "").replace(/\s{2,}/g, " ").trim();
			if (cleanText.length >= 2) {
				const durMs = blockDurationTicks > 0 ? blockDurationTicks * scaleMs : 3500;
				subtitleSamples.push({
					ptsMs: Math.max(0, absTimeMs),
					endPtsMs: Math.max(0, absTimeMs) + Math.min(8e3, Math.max(1200, durMs)),
					text: cleanText,
					trackNum
				});
			}
		} catch {}
	};
	if (b.byteLength >= 4 && !(b[0] === 26 && b[1] === 69 && b[2] === 223 && b[3] === 163) && !(b[0] === 31 && b[1] === 67 && b[2] === 182 && b[3] === 117)) {
		const firstCluster = findClusterOffset(b, 0);
		if (firstCluster !== -1) pos = firstCluster;
	}
	while (pos < b.byteLength) {
		const idObj = readEbmlId(b, pos);
		if (!idObj) break;
		const szObj = readVint(b, pos + idObj.len);
		if (!szObj) break;
		const dStart = pos + idObj.len + szObj.len;
		const isUnknownSize = szObj.val < 0;
		const rawEnd = isUnknownSize ? b.byteLength : dStart + szObj.val;
		if (idObj.id === 408125543) {
			segmentDataOffset = dStart;
			pos = dStart;
			continue;
		}
		if (idObj.id === 290298740) {
			const dEnd = Math.min(b.byteLength, rawEnd);
			let sp = dStart;
			while (sp < dEnd) {
				const sid = readEbmlId(b, sp);
				if (!sid) break;
				const ssz = readVint(b, sp + sid.len);
				if (!ssz) break;
				const sds = sp + sid.len + ssz.len;
				const sde = ssz.val < 0 ? dEnd : Math.min(dEnd, sds + ssz.val);
				if (sid.id === 19899) {
					let kp = sds;
					let seekIdVal = 0;
					let seekPosVal = -1;
					while (kp < sde) {
						const kid = readEbmlId(b, kp);
						if (!kid) break;
						const ksz = readVint(b, kp + kid.len);
						if (!ksz) break;
						const kds = kp + kid.len + ksz.len;
						const kde = ksz.val < 0 ? sde : Math.min(sde, kds + ksz.val);
						if (kid.id === 21419) seekIdVal = readUint(b, kds, ksz.val);
						else if (kid.id === 21420) seekPosVal = readUint(b, kds, ksz.val);
						kp = kde;
					}
					if (seekIdVal === 475249515 && seekPosVal >= 0) cuesByteOffset = segmentDataOffset + seekPosVal;
				}
				sp = sde;
			}
			pos = dEnd;
			continue;
		}
		if (idObj.id === 357149030) {
			const dEnd = Math.min(b.byteLength, rawEnd);
			let ip = dStart;
			while (ip < dEnd) {
				const iid = readEbmlId(b, ip);
				if (!iid) break;
				const isz = readVint(b, ip + iid.len);
				if (!isz) break;
				const ids = ip + iid.len + isz.len;
				if (iid.id === 2807729) timecodeScale = readUint(b, ids, isz.val);
				else if (iid.id === 17545) rawDuration = readFloat(b, ids, isz.val);
				ip = ids + isz.val;
			}
			pos = dEnd;
			continue;
		}
		if (idObj.id === 374648427) {
			const dEnd = Math.min(b.byteLength, rawEnd);
			parseTracksElement(dStart, dEnd);
			pos = dEnd;
			continue;
		}
		if (idObj.id === 524531317) {
			if (firstClusterOffset < 0) firstClusterOffset = pos;
			if (!isUnknownSize && rawEnd > b.byteLength && lastCompleteClusterEnd > 0) break;
			const dEnd = Math.min(b.byteLength, rawEnd);
			let cp = dStart;
			while (cp < dEnd) {
				const cid = readEbmlId(b, cp);
				if (!cid) break;
				const csz = readVint(b, cp + cid.len);
				if (!csz) break;
				const cds = cp + cid.len + csz.len;
				const cRawEnd = csz.val < 0 ? dEnd : cds + csz.val;
				if (cRawEnd > b.byteLength) {
					cp = b.byteLength;
					break;
				}
				if (cid.id === 231) currentClusterTime = readUint(b, cds, csz.val);
				else if (cid.id === 163) handleBlock(cds, cRawEnd, false, 0);
				else if (cid.id === 160) {
					let bgp = cds;
					let blockStart = -1;
					let blockEnd = -1;
					let hasReference = false;
					let blockDurTicks = 0;
					while (bgp < cRawEnd) {
						const bid = readEbmlId(b, bgp);
						if (!bid) break;
						const bsz = readVint(b, bgp + bid.len);
						if (!bsz) break;
						const bds = bgp + bid.len + bsz.len;
						const bde = Math.min(cRawEnd, bds + bsz.val);
						if (bid.id === 161) {
							blockStart = bds;
							blockEnd = bde;
						} else if (bid.id === 155) blockDurTicks = readUint(b, bds, bsz.val);
						else if (bid.id === 251) hasReference = true;
						bgp = bde;
					}
					if (blockStart !== -1 && blockEnd !== -1) handleBlock(blockStart, blockEnd, !hasReference, blockDurTicks);
				}
				cp = cRawEnd;
			}
			lastCompleteClusterEnd = dEnd;
			pos = dEnd;
			continue;
		}
		if (rawEnd > b.byteLength) break;
		pos = rawEnd;
	}
	const durationSec = rawDuration > 0 ? rawDuration * (timecodeScale / 1e6) / 1e3 : 0;
	return {
		tracks,
		timecodeScale,
		durationSec,
		segmentDataOffset,
		firstClusterOffset,
		cuesByteOffset,
		videoSamples,
		audioSamples,
		subtitleSamples,
		consumedBytes: lastCompleteClusterEnd > 0 ? lastCompleteClusterEnd : b.byteLength
	};
}
/**
* Parses the Matroska Cues (0x1C53BB6B) seek index table from the tail of the file.
* Gives exact keyframe timestamps (ms) -> exact Cluster byte offsets for 0.1s instant seeking!
*/
export function parseMkvCuesFromBuffer(b, segmentDataOffset = 52, timecodeScale = 1e6) {
	let cuesPos = -1;
	const limit = b.byteLength - 4;
	for (let i = 0; i <= limit; i++) if (b[i] === 28 && b[i + 1] === 83 && b[i + 2] === 187 && b[i + 3] === 107) {
		cuesPos = i;
		break;
	}
	if (cuesPos === -1) return [];
	const szObj = readVint(b, cuesPos + 4);
	if (!szObj) return [];
	let p = cuesPos + 4 + szObj.len;
	const end = szObj.val < 0 ? b.byteLength : Math.min(b.byteLength, p + szObj.val);
	const scaleMs = timecodeScale / 1e6;
	const cuePoints = [];
	let lastOffset = -1;
	while (p < end) {
		const idObj = readEbmlId(b, p);
		if (!idObj) break;
		const sObj = readVint(b, p + idObj.len);
		if (!sObj) break;
		const ds = p + idObj.len + sObj.len;
		const de = sObj.val < 0 ? end : Math.min(end, ds + sObj.val);
		if (idObj.id === 187) {
			let cp = ds;
			let rawCueTime = -1;
			let cueClusterPos = -1;
			while (cp < de) {
				const cid = readEbmlId(b, cp);
				if (!cid) break;
				const cs = readVint(b, cp + cid.len);
				if (!cs) break;
				const cds = cp + cid.len + cs.len;
				const cde = cs.val < 0 ? de : Math.min(de, cds + cs.val);
				if (cid.id === 179) rawCueTime = readUint(b, cds, cs.val);
				else if (cid.id === 183) {
					let tp = cds;
					while (tp < cde) {
						const tid = readEbmlId(b, tp);
						if (!tid) break;
						const ts = readVint(b, tp + tid.len);
						if (!ts) break;
						const tds = tp + tid.len + ts.len;
						const tde = ts.val < 0 ? cde : Math.min(cde, tds + ts.val);
						if (tid.id === 241 && cueClusterPos < 0) cueClusterPos = readUint(b, tds, ts.val);
						tp = tde;
					}
				}
				cp = cde;
			}
			if (rawCueTime >= 0 && cueClusterPos >= 0) {
				const byteOffset = segmentDataOffset + cueClusterPos;
				if (byteOffset !== lastOffset) {
					lastOffset = byteOffset;
					cuePoints.push({
						timeMs: rawCueTime * scaleMs,
						byteOffset
					});
				}
			}
		}
		p = de;
	}
	return cuePoints.sort((a, b) => a.timeMs - b.timeMs);
}
export function box(type, ...payloads) {
	let size = 8;
	for (const p of payloads) size += p.byteLength;
	const out = new Uint8Array(size);
	new DataView(out.buffer).setUint32(0, size, false);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	let offset = 8;
	for (const p of payloads) {
		out.set(p, offset);
		offset += p.byteLength;
	}
	return out;
}
export function u32(v) {
	const b = /* @__PURE__ */ new Uint8Array(4);
	new DataView(b.buffer).setUint32(0, v >>> 0, false);
	return b;
}
export function u16(v) {
	const b = /* @__PURE__ */ new Uint8Array(2);
	new DataView(b.buffer).setUint16(0, v & 65535, false);
	return b;
}
export function strBytes(s) {
	const out = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
	return out;
}
/**
* Builds a faststart ISO BMFF MP4 (ftyp + moov + mdat) from parsed H.264 & AAC samples.
*/
export function buildFastStartMp4(tracks, rawVideoSamples, rawAudioSamples) {
	const vTrack = tracks.find((t) => t.type === 1);
	if (!vTrack || !vTrack.codecPrivate || rawVideoSamples.length < 2) return null;
	const aTrack = tracks.find((t) => t.type === 2 && /AAC/i.test(t.codecId)) || tracks.find((t) => t.type === 2);
	const isAacCompatible = !aTrack?.codecId || /AAC/i.test(aTrack.codecId);
	const basePtsMs = rawVideoSamples[0].ptsMs;
	const vSamples = rawVideoSamples.map((s) => ({
		ptsTicks: Math.max(0, Math.round((s.ptsMs - basePtsMs) * 90)),
		data: s.data,
		keyframe: s.keyframe
	}));
	const aSampleRate = aTrack ? aTrack.sampleRate || 22050 : 44100;
	const aSamples = aTrack ? rawAudioSamples.filter((s) => s.ptsMs >= basePtsMs - 40).map((s) => ({
		ptsMs: Math.max(0, s.ptsMs - basePtsMs),
		data: s.data
	})) : [];
	const presOrder = vSamples.map((_, idx) => idx).sort((a, b) => vSamples[a].ptsTicks - vSamples[b].ptsTicks || a - b);
	for (let i = 1; i < presOrder.length; i++) {
		const prevPts = vSamples[presOrder[i - 1]].ptsTicks;
		if (vSamples[presOrder[i]].ptsTicks <= prevPts) vSamples[presOrder[i]].ptsTicks = prevPts + 90;
	}
	const dtsTicks = new Array(vSamples.length);
	for (let i = 0; i < vSamples.length; i++) dtsTicks[i] = vSamples[presOrder[i]].ptsTicks;
	const vDeltas = [];
	const vCtos = [];
	let minDiff = 0;
	for (let i = 0; i < vSamples.length; i++) {
		const diff = vSamples[i].ptsTicks - dtsTicks[i];
		if (diff < minDiff) minDiff = diff;
	}
	for (let i = 0; i < vSamples.length; i++) {
		const nextDts = i + 1 < vSamples.length ? dtsTicks[i + 1] : dtsTicks[i] + 3e3;
		vDeltas.push(Math.max(90, nextDts - dtsTicks[i]));
		vCtos.push(vSamples[i].ptsTicks - dtsTicks[i] - minDiff);
	}
	let vDataLen = 0;
	for (const s of vSamples) vDataLen += s.data.byteLength;
	let aDataLen = 0;
	for (const s of aSamples) aDataLen += s.data.byteLength;
	const totalDur90k = vDeltas.reduce((acc, d) => acc + d, 0);
	const totalDurMs = Math.max(1, Math.round(totalDur90k / 90));
	const ftyp = box("ftyp", strBytes("isom"), u32(512), strBytes("isomiso2avc1mp41"));
	const buildMoovWithOffsets = (vChunkOffset, aChunkOffset) => {
		const matrix = new Uint8Array([
			0,
			1,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			1,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			64,
			0,
			0,
			0
		]);
		const tkhdV = box("tkhd", new Uint8Array([
			0,
			0,
			0,
			3
		]), u32(0), u32(0), u32(1), u32(0), u32(totalDurMs), /* @__PURE__ */ new Uint8Array(8), u16(0), u16(0), u16(0), u16(0), matrix, u32((vTrack.width || 1280) << 16), u32((vTrack.height || 720) << 16));
		const mdhdV = box("mdhd", u32(0), u32(0), u32(0), u32(9e4), u32(totalDur90k), u16(21956), u16(0));
		const hdlrV = box("hdlr", u32(0), u32(0), strBytes("vide"), /* @__PURE__ */ new Uint8Array(12), strBytes("VideoHandler\0"));
		const vmhd = box("vmhd", new Uint8Array([
			0,
			0,
			0,
			1
		]), /* @__PURE__ */ new Uint8Array(8));
		const dinf = box("dinf", box("dref", u32(0), u32(1), box("url ", new Uint8Array([
			0,
			0,
			0,
			1
		]))));
		const isHevc = /HEVC/i.test(vTrack.codecId);
		const isAv1 = /AV1/i.test(vTrack.codecId);
		const sampleEntryFourCC = isHevc ? "hvc1" : isAv1 ? "av01" : "avc1";
		const codecConfigBox = box(isHevc ? "hvcC" : isAv1 ? "av1C" : "avcC", vTrack.codecPrivate);
		const visualSampleEntry = box(sampleEntryFourCC, /* @__PURE__ */ new Uint8Array(6), u16(1), /* @__PURE__ */ new Uint8Array(16), u16(vTrack.width || 1280), u16(vTrack.height || 720), u32(4718592), u32(4718592), u32(0), u16(1), /* @__PURE__ */ new Uint8Array(32), u16(24), u16(65535), codecConfigBox);
		const stsdV = box("stsd", u32(0), u32(1), visualSampleEntry);
		const sttsVBuf = new Uint8Array(8 + vDeltas.length * 8);
		const sttsVDv = new DataView(sttsVBuf.buffer);
		sttsVDv.setUint32(4, vDeltas.length, false);
		for (let i = 0; i < vDeltas.length; i++) {
			sttsVDv.setUint32(8 + i * 8, 1, false);
			sttsVDv.setUint32(12 + i * 8, vDeltas[i], false);
		}
		const sttsV = box("stts", sttsVBuf);
		const cttsVBuf = new Uint8Array(8 + vCtos.length * 8);
		const cttsVDv = new DataView(cttsVBuf.buffer);
		cttsVDv.setUint32(4, vCtos.length, false);
		for (let i = 0; i < vCtos.length; i++) {
			cttsVDv.setUint32(8 + i * 8, 1, false);
			cttsVDv.setUint32(12 + i * 8, vCtos[i], false);
		}
		const cttsV = box("ctts", cttsVBuf);
		const syncIndices = [];
		for (let i = 0; i < vSamples.length; i++) if (vSamples[i].keyframe) syncIndices.push(i + 1);
		if (syncIndices.length === 0) syncIndices.push(1);
		const stssVBuf = new Uint8Array(8 + syncIndices.length * 4);
		const stssVDv = new DataView(stssVBuf.buffer);
		stssVDv.setUint32(4, syncIndices.length, false);
		for (let i = 0; i < syncIndices.length; i++) stssVDv.setUint32(8 + i * 4, syncIndices[i], false);
		const stssV = box("stss", stssVBuf);
		const stscV = box("stsc", u32(0), u32(1), u32(1), u32(vSamples.length), u32(1));
		const stszVBuf = new Uint8Array(12 + vSamples.length * 4);
		const stszVDv = new DataView(stszVBuf.buffer);
		stszVDv.setUint32(8, vSamples.length, false);
		for (let i = 0; i < vSamples.length; i++) stszVDv.setUint32(12 + i * 4, vSamples[i].data.byteLength, false);
		const traks = [box("trak", tkhdV, box("mdia", mdhdV, hdlrV, box("minf", vmhd, dinf, box("stbl", stsdV, sttsV, cttsV, stssV, stscV, box("stsz", stszVBuf), box("stco", u32(0), u32(1), u32(vChunkOffset))))))];
		if (aTrack && isAacCompatible && aSamples.length > 0) {
			const aDurTicks = aSamples.length * 1024;
			const tkhdA = box("tkhd", new Uint8Array([
				0,
				0,
				0,
				3
			]), u32(0), u32(0), u32(2), u32(0), u32(totalDurMs), /* @__PURE__ */ new Uint8Array(8), u16(0), u16(0), u16(256), u16(0), matrix, u32(0), u32(0));
			const mdhdA = box("mdhd", u32(0), u32(0), u32(0), u32(aSampleRate), u32(aDurTicks), u16(21956), u16(0));
			const hdlrA = box("hdlr", u32(0), u32(0), strBytes("soun"), /* @__PURE__ */ new Uint8Array(12), strBytes("SoundHandler\0"));
			const smhd = box("smhd", u32(0), u32(0));
			const asc = aTrack.codecPrivate || new Uint8Array([18, 16]);
			const esds = box("esds", new Uint8Array([
				0,
				0,
				0,
				0,
				3,
				23 + asc.byteLength,
				0,
				2,
				0,
				4,
				15 + asc.byteLength,
				64,
				21,
				0,
				0,
				0,
				0,
				1,
				244,
				0,
				0,
				1,
				244,
				0,
				5,
				asc.byteLength,
				...Array.from(asc),
				6,
				1,
				2
			]));
			const mp4a = box("mp4a", /* @__PURE__ */ new Uint8Array(6), u16(1), /* @__PURE__ */ new Uint8Array(8), u16(aTrack.channels || 2), u16(16), u16(0), u16(0), u32(aSampleRate << 16), esds);
			const stsdA = box("stsd", u32(0), u32(1), mp4a);
			const sttsA = box("stts", u32(0), u32(1), u32(aSamples.length), u32(1024));
			const stscA = box("stsc", u32(0), u32(1), u32(1), u32(aSamples.length), u32(1));
			const stszABuf = new Uint8Array(12 + aSamples.length * 4);
			const stszADv = new DataView(stszABuf.buffer);
			stszADv.setUint32(8, aSamples.length, false);
			for (let i = 0; i < aSamples.length; i++) stszADv.setUint32(12 + i * 4, aSamples[i].data.byteLength, false);
			const trakA = box("trak", tkhdA, box("mdia", mdhdA, hdlrA, box("minf", smhd, dinf, box("stbl", stsdA, sttsA, stscA, box("stsz", stszABuf), box("stco", u32(0), u32(1), u32(aChunkOffset))))));
			traks.push(trakA);
		}
		return box("moov", box("mvhd", u32(0), u32(0), u32(0), u32(1e3), u32(totalDurMs), u32(65536), u16(256), /* @__PURE__ */ new Uint8Array(10), matrix, /* @__PURE__ */ new Uint8Array(24), u32(traks.length + 1)), ...traks);
	};
	const dummyMoov = buildMoovWithOffsets(0, 0);
	const vChunkOffset = ftyp.byteLength + dummyMoov.byteLength + 8;
	const moov = buildMoovWithOffsets(vChunkOffset, vChunkOffset + vDataLen);
	const mdatSize = 8 + vDataLen + aDataLen;
	const finalMp4 = new Uint8Array(ftyp.byteLength + moov.byteLength + mdatSize);
	finalMp4.set(ftyp, 0);
	finalMp4.set(moov, ftyp.byteLength);
	const mdatOffset = ftyp.byteLength + moov.byteLength;
	new DataView(finalMp4.buffer).setUint32(mdatOffset, mdatSize, false);
	finalMp4.set(strBytes("mdat"), mdatOffset + 4);
	let writePos = mdatOffset + 8;
	for (const s of vSamples) {
		finalMp4.set(s.data, writePos);
		writePos += s.data.byteLength;
	}
	for (const s of aSamples) {
		finalMp4.set(s.data, writePos);
		writePos += s.data.byteLength;
	}
	return {
		mp4Bytes: finalMp4,
		durationSec: totalDurMs / 1e3,
		startSec: basePtsMs / 1e3
	};
}
export var mkvStreamMetaCache = /* @__PURE__ */ new Map();
export var inFlightMetaPrewarms = /* @__PURE__ */ new Map();
export function prewarmMkvStreamMeta(url) {
	if (!url || !url.startsWith("http") || /\.(mp4|m4v|m3u8)(\?|$)/i.test(url)) return Promise.resolve(null);
	const existing = mkvStreamMetaCache.get(url);
	if (existing && existing.tracks.length > 0 && existing.cuePoints.length > 0 && existing.initialSeg0Mp4) return Promise.resolve(existing);
	const inFlight = inFlightMetaPrewarms.get(url);
	if (inFlight) return inFlight;
	const p = (async () => {
		try {
			const res = await fetch(url, { headers: { Range: `bytes=0-430079` } });
			if (!res.ok && res.status !== 206) return null;
			let totalFileBytes = 0;
			const totalMatch = (res.headers.get("content-range") || "").match(/\/(\d+)/);
			if (totalMatch) totalFileBytes = Number(totalMatch[1]);
			const buf = new Uint8Array(await res.arrayBuffer());
			const parsed = parseMkvHeaderAndSamples(buf);
			if (parsed.tracks.length === 0) return null;
			let initialSeg0Mp4 = void 0;
			if (parsed.videoSamples.length >= 2) {
				let vForSeg = parsed.videoSamples;
				let aForSeg = parsed.audioSamples;
				let carryVideo = [];
				let carryAudio = [];
				if (!(parsed.consumedBytes > 0 && parsed.consumedBytes < buf.byteLength)) {
					let lastKf = -1;
					for (let i = vForSeg.length - 1; i >= Math.min(20, Math.floor(vForSeg.length * .65)); i--) if (vForSeg[i].keyframe) {
						lastKf = i;
						break;
					}
					if (lastKf > 12 && lastKf < vForSeg.length - 1) {
						const splitPts = vForSeg[lastKf].ptsMs;
						carryVideo = vForSeg.slice(lastKf);
						vForSeg = vForSeg.slice(0, lastKf);
						carryAudio = aForSeg.filter((a) => a.ptsMs >= splitPts);
						aForSeg = aForSeg.filter((a) => a.ptsMs < splitPts);
					}
				}
				const built = buildFastStartMp4(parsed.tracks, vForSeg, aForSeg);
				if (built) {
					let maxPtsMs = 0;
					for (const s of vForSeg) if (s.ptsMs > maxPtsMs) maxPtsMs = s.ptsMs;
					initialSeg0Mp4 = {
						mp4Bytes: built.mp4Bytes,
						startSec: built.startSec,
						durationSec: built.durationSec,
						maxPtsMs,
						nextByteOffset: parsed.consumedBytes > 0 ? parsed.consumedBytes : buf.byteLength,
						carryVideo,
						carryAudio,
						subtitles: parsed.subtitleSamples
					};
				}
			}
			const meta = {
				tracks: parsed.tracks,
				timecodeScale: parsed.timecodeScale,
				totalDurationSec: parsed.durationSec,
				totalFileBytes,
				segmentDataOffset: parsed.segmentDataOffset || 52,
				firstClusterOffset: parsed.firstClusterOffset > 0 ? parsed.firstClusterOffset : 1500,
				cuesByteOffset: parsed.cuesByteOffset,
				cuePoints: existing?.cuePoints || [],
				initialSeg0Mp4
			};
			mkvStreamMetaCache.set(url, meta);
			if (totalFileBytes > 22e4 && meta.cuePoints.length === 0) {
				const tailStart = meta.cuesByteOffset > 0 && meta.cuesByteOffset < totalFileBytes ? meta.cuesByteOffset : Math.max(0, totalFileBytes - 393216);
				const tailEnd = Math.min(totalFileBytes - 1, tailStart + 225280 - 1);
				const tailRes = await fetch(url, { headers: { Range: `bytes=${tailStart}-${tailEnd}` } });
				if (tailRes.ok || tailRes.status === 206) {
					const cues = parseMkvCuesFromBuffer(new Uint8Array(await tailRes.arrayBuffer()), meta.segmentDataOffset, meta.timecodeScale);
					if (cues.length > 0) {
						meta.cuePoints = cues;
						if (!meta.totalDurationSec && cues.length > 1) meta.totalDurationSec = cues[cues.length - 1].timeMs / 1e3 + 4;
						mkvStreamMetaCache.set(url, meta);
					}
				}
			}
			return meta;
		} catch {
			return mkvStreamMetaCache.get(url) || null;
		} finally {
			inFlightMetaPrewarms.delete(url);
		}
	})();
	inFlightMetaPrewarms.set(url, p);
	return p;
}
/**
* Ultra-Fast HLS-Style Micro-Chunk MKV-to-MP4 Stream Controller
*/
export var IosMkvStreamController = class {
	constructor(url, skipIntroSec = 12, initialResumeSec = 0) {
		this.aborted = false;
		this.abortController = new AbortController();
		this.seekAbortController = null;
		this.bgPrebufferAbortController = null;
		this.tracks = [];
		this.timecodeScale = 1e6;
		this.totalFileBytes = 0;
		this.totalDurationSec = 0;
		this.segmentDataOffset = 52;
		this.cuesByteOffset = -1;
		this.cuePoints = [];
		this.cuesPromise = null;
		this.nextByteOffset = 0;
		this.eofReached = false;
		this.lastEmittedVideoPtsMs = -1;
		this.carryVideo = [];
		this.carryAudio = [];
		this.extractedSubtitles = [];
		this.segments = [];
		this.buildingPromise = null;
		this.prewarmedSeekSlice = null;
		this.url = url;
		this.skipIntroSec = skipIntroSec;
		this.initialResumeSec = initialResumeSec;
	}
	destroy() {
		this.aborted = true;
		try {
			this.abortController.abort();
		} catch {}
		try {
			this.seekAbortController?.abort();
		} catch {}
		try {
			this.bgPrebufferAbortController?.abort();
		} catch {}
		for (const seg of this.segments) if (seg.blobUrl) try {
			URL.revokeObjectURL(seg.blobUrl);
		} catch {}
		this.segments = [];
		this.carryVideo = [];
		this.carryAudio = [];
		this.prewarmedSeekSlice = null;
	}
	getTotalDurationSec() {
		return this.totalDurationSec;
	}
	getExtractedSubtitles() {
		return this.extractedSubtitles;
	}
	mergeSubtitleSamples(samples) {
		if (!samples || samples.length === 0) return;
		for (const s of samples) if (!this.extractedSubtitles.some((ex) => Math.abs(ex.ptsMs - s.ptsMs) < 120 && ex.text === s.text)) this.extractedSubtitles.push(s);
	}
	ensureCuesTableLoaded() {
		if (this.cuePoints.length > 0) return Promise.resolve(this.cuePoints);
		const cached = mkvStreamMetaCache.get(this.url);
		if (cached && cached.cuePoints.length > 0) {
			this.cuePoints = cached.cuePoints;
			return Promise.resolve(this.cuePoints);
		}
		if (this.cuesPromise) return this.cuesPromise;
		if (this.totalFileBytes <= 22e4) return Promise.resolve([]);
		this.cuesPromise = (async () => {
			try {
				const hasExactCuesOffset = this.cuesByteOffset > 0 && this.cuesByteOffset < this.totalFileBytes;
				const tailStart = hasExactCuesOffset ? this.cuesByteOffset : Math.max(0, this.totalFileBytes - 327680);
				const maxWindow = hasExactCuesOffset ? 143360 : 225280;
				const tailEnd = Math.min(this.totalFileBytes - 1, tailStart + maxWindow - 1);
				const res = await fetch(this.url, {
					signal: this.abortController.signal,
					headers: { Range: `bytes=${tailStart}-${tailEnd}` }
				});
				if (!res.ok && res.status !== 206) return [];
				const tailBuf = new Uint8Array(await res.arrayBuffer());
				if (this.aborted) return [];
				const cues = parseMkvCuesFromBuffer(tailBuf, this.segmentDataOffset, this.timecodeScale);
				if (cues.length > 0) {
					this.cuePoints = cues;
					if (!this.totalDurationSec && cues.length > 1) this.totalDurationSec = cues[cues.length - 1].timeMs / 1e3 + 4;
					const existingMeta = mkvStreamMetaCache.get(this.url);
					if (existingMeta) {
						existingMeta.cuePoints = cues;
						if (!existingMeta.totalDurationSec && this.totalDurationSec > 0) existingMeta.totalDurationSec = this.totalDurationSec;
					}
				}
				return cues;
			} catch {
				return [];
			} finally {
				this.cuesPromise = null;
			}
		})();
		return this.cuesPromise;
	}
	/**
	* Finds the exact [startByte, endByte] Cluster range from the Matroska Cues table
	* for any target timestamp (in seconds) with a desired chunk byte & duration budget.
	*/
	findExactCueByteRange(targetSec, minBytes = 65e4, maxBytes = 135e4, minDurationMs = 11e3, preferAtOrAfter = false) {
		if (this.cuePoints.length < 2) return null;
		const targetMs = Math.max(0, targetSec * 1e3);
		let startIdx = 0;
		if (preferAtOrAfter) {
			const idx = this.cuePoints.findIndex((c) => c.timeMs >= Math.max(0, targetMs - 500));
			startIdx = idx !== -1 ? idx : 0;
		} else {
			let lo = 0;
			let hi = this.cuePoints.length - 1;
			while (lo <= hi) {
				const mid = lo + hi >>> 1;
				if (this.cuePoints[mid].timeMs <= targetMs) {
					startIdx = mid;
					lo = mid + 1;
				} else hi = mid - 1;
			}
		}
		const startCue = this.cuePoints[startIdx];
		const startByte = startCue.byteOffset;
		let endIdx = startIdx + 1;
		while (endIdx < this.cuePoints.length) {
			const cand = this.cuePoints[endIdx];
			const byteSpan = cand.byteOffset - startByte;
			const durSpan = cand.timeMs - startCue.timeMs;
			if (durSpan >= minDurationMs && byteSpan >= minBytes) break;
			if (durSpan >= minDurationMs * 1.4 || byteSpan >= maxBytes) {
				if (durSpan >= Math.min(8e3, minDurationMs)) break;
			}
			if (byteSpan >= maxBytes * 1.65) break;
			endIdx++;
		}
		if (endIdx < this.cuePoints.length) {
			const nextClusterStart = this.cuePoints[endIdx].byteOffset;
			if (nextClusterStart > startByte + 32768) return {
				startByte,
				endByte: nextClusterStart - 1,
				exactAligned: true
			};
		}
		return {
			startByte,
			endByte: this.totalFileBytes > 0 ? Math.min(this.totalFileBytes - 1, startByte + maxBytes - 1) : startByte + maxBytes - 1,
			exactAligned: false
		};
	}
	prewarmSeekTarget(_targetSec) {}
	getPrebufferedSegmentUrl(targetIndex) {
		const found = this.segments.find((s) => s.index === targetIndex && s.blobUrl);
		return found ? found.blobUrl : "";
	}
	async startInitialSegment() {
		this.lastEmittedVideoPtsMs = -1;
		const isResumeJump = this.initialResumeSec > 15;
		if (!isResumeJump) {
			const prewarmed = mkvStreamMetaCache.get(this.url);
			if (prewarmed && prewarmed.tracks.length > 0 && prewarmed.initialSeg0Mp4) {
				this.tracks = prewarmed.tracks;
				this.timecodeScale = prewarmed.timecodeScale;
				this.totalDurationSec = prewarmed.totalDurationSec;
				this.totalFileBytes = prewarmed.totalFileBytes;
				this.segmentDataOffset = prewarmed.segmentDataOffset || 52;
				this.cuesByteOffset = prewarmed.cuesByteOffset;
				this.cuePoints = prewarmed.cuePoints || [];
				const init0 = prewarmed.initialSeg0Mp4;
				this.lastEmittedVideoPtsMs = init0.maxPtsMs;
				this.nextByteOffset = init0.nextByteOffset;
				this.carryVideo = [...init0.carryVideo];
				this.carryAudio = [...init0.carryAudio];
				this.mergeSubtitleSamples(init0.subtitles);
				if (this.totalFileBytes > 0 && this.nextByteOffset >= this.totalFileBytes) this.eofReached = true;
				const blob = new Blob([init0.mp4Bytes], { type: "video/mp4" });
				const seg0 = {
					index: 0,
					blobUrl: URL.createObjectURL(blob),
					startSec: init0.startSec,
					durationSec: init0.durationSec
				};
				this.segments.push(seg0);
				this.ensureNextSegmentPrebuffered(1, 0);
				if (this.cuePoints.length === 0) this.ensureCuesTableLoaded();
				return seg0;
			}
			const res = await fetch(this.url, {
				signal: this.abortController.signal,
				headers: { Range: `bytes=0-696319` }
			});
			if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
			const totalMatch = (res.headers.get("content-range") || "").match(/\/(\d+)/);
			if (totalMatch) this.totalFileBytes = Number(totalMatch[1]);
			const buf = new Uint8Array(await res.arrayBuffer());
			if (this.aborted) throw new Error("Aborted");
			const parsed = parseMkvHeaderAndSamples(buf);
			if (parsed.tracks.length > 0) this.tracks = parsed.tracks;
			this.timecodeScale = parsed.timecodeScale;
			this.segmentDataOffset = parsed.segmentDataOffset || 52;
			this.cuesByteOffset = parsed.cuesByteOffset;
			if (parsed.durationSec > 0) this.totalDurationSec = parsed.durationSec;
			this.mergeSubtitleSamples(parsed.subtitleSamples);
			const existingMeta = mkvStreamMetaCache.get(this.url);
			if (existingMeta && existingMeta.cuePoints.length > 0) this.cuePoints = existingMeta.cuePoints;
			else {
				mkvStreamMetaCache.set(this.url, {
					tracks: this.tracks,
					timecodeScale: this.timecodeScale,
					totalDurationSec: this.totalDurationSec,
					totalFileBytes: this.totalFileBytes,
					segmentDataOffset: this.segmentDataOffset,
					firstClusterOffset: parsed.firstClusterOffset > 0 ? parsed.firstClusterOffset : 1500,
					cuesByteOffset: this.cuesByteOffset,
					cuePoints: []
				});
				this.ensureCuesTableLoaded();
			}
			const primaryVTrack = this.tracks.find((t) => t.type === 1);
			if (primaryVTrack && /AV1/i.test(primaryVTrack.codecId) && typeof document !== "undefined") {
				if (!document.createElement("video").canPlayType("video/mp4; codecs=\"av01.0.05M.08\"")) throw new Error("AV1 codec unsupported on this iOS device; switching to H.264");
			}
			if (parsed.videoSamples.length >= 2) {
				const endedAtCompleteCluster = parsed.consumedBytes > 0 && parsed.consumedBytes < buf.byteLength;
				this.nextByteOffset = parsed.consumedBytes > 0 ? parsed.consumedBytes : buf.byteLength;
				if (this.totalFileBytes > 0 && this.nextByteOffset >= this.totalFileBytes) this.eofReached = true;
				const seg0 = this.finalizeSegmentFromSamples(0, parsed.videoSamples, parsed.audioSamples, endedAtCompleteCluster);
				if (seg0) {
					this.segments.push(seg0);
					this.ensureNextSegmentPrebuffered(1, 0);
					return seg0;
				}
			}
		}
		let meta = mkvStreamMetaCache.get(this.url);
		if (!meta || meta.tracks.length === 0) {
			const headRes = await fetch(this.url, {
				signal: this.abortController.signal,
				headers: { Range: `bytes=0-16383` }
			});
			if (!headRes.ok && headRes.status !== 206) throw new Error(`HTTP ${headRes.status}`);
			const totalMatch = (headRes.headers.get("content-range") || "").match(/\/(\d+)/);
			if (totalMatch) this.totalFileBytes = Number(totalMatch[1]);
			const headBuf = new Uint8Array(await headRes.arrayBuffer());
			if (this.aborted) throw new Error("Aborted");
			const parsedHead = parseMkvHeaderAndSamples(headBuf);
			this.tracks = parsedHead.tracks;
			this.timecodeScale = parsedHead.timecodeScale;
			this.segmentDataOffset = parsedHead.segmentDataOffset || 52;
			this.cuesByteOffset = parsedHead.cuesByteOffset;
			if (parsedHead.durationSec > 0) this.totalDurationSec = parsedHead.durationSec;
			meta = {
				tracks: this.tracks,
				timecodeScale: this.timecodeScale,
				totalDurationSec: this.totalDurationSec,
				totalFileBytes: this.totalFileBytes,
				segmentDataOffset: this.segmentDataOffset,
				firstClusterOffset: parsedHead.firstClusterOffset > 0 ? parsedHead.firstClusterOffset : 1500,
				cuesByteOffset: this.cuesByteOffset,
				cuePoints: []
			};
			mkvStreamMetaCache.set(this.url, meta);
		} else {
			this.tracks = meta.tracks;
			this.timecodeScale = meta.timecodeScale;
			this.totalDurationSec = meta.totalDurationSec;
			this.totalFileBytes = meta.totalFileBytes;
			this.segmentDataOffset = meta.segmentDataOffset || 52;
			this.cuesByteOffset = meta.cuesByteOffset;
			if (meta.cuePoints.length > 0) this.cuePoints = meta.cuePoints;
		}
		const primaryVTrack = this.tracks.find((t) => t.type === 1);
		if (primaryVTrack && /AV1/i.test(primaryVTrack.codecId) && typeof document !== "undefined") {
			if (!document.createElement("video").canPlayType("video/mp4; codecs=\"av01.0.05M.08\"")) throw new Error("AV1 codec unsupported on this iOS device; switching to H.264");
		}
		if (this.cuePoints.length === 0 && this.totalFileBytes > 22e4) await Promise.race([this.ensureCuesTableLoaded(), new Promise((r) => setTimeout(() => r([]), 2200))]);
		else if (this.cuePoints.length === 0) this.ensureCuesTableLoaded();
		const wantStartSec = isResumeJump ? this.initialResumeSec : 0;
		if (this.cuePoints.length >= 2) {
			const cueRange = this.findExactCueByteRange(wantStartSec, 65e4, 125e4, 11e3, false);
			if (cueRange) {
				const res = await fetch(this.url, {
					signal: this.abortController.signal,
					headers: { Range: `bytes=${cueRange.startByte}-${cueRange.endByte}` }
				});
				if (res.ok || res.status === 206) {
					const buf = new Uint8Array(await res.arrayBuffer());
					if (this.aborted) throw new Error("Aborted");
					const parsed = parseMkvHeaderAndSamples(buf, this.tracks, this.timecodeScale);
					this.mergeSubtitleSamples(parsed.subtitleSamples);
					const endedAtCompleteCluster = cueRange.exactAligned || parsed.consumedBytes > 0 && parsed.consumedBytes < buf.byteLength;
					this.nextByteOffset = cueRange.exactAligned ? cueRange.endByte + 1 : cueRange.startByte + parsed.consumedBytes;
					this.eofReached = this.totalFileBytes > 0 && this.nextByteOffset >= this.totalFileBytes;
					let vSamples = parsed.videoSamples;
					let aSamples = parsed.audioSamples;
					if (vSamples.length > 0) {
						const firstKf = vSamples.findIndex((s) => s.keyframe);
						if (firstKf > 0) {
							const cutPts = vSamples[firstKf].ptsMs;
							vSamples = vSamples.slice(firstKf);
							aSamples = aSamples.filter((a) => a.ptsMs >= cutPts - 20);
						} else if (firstKf === -1) vSamples[0].keyframe = true;
					}
					const seg0 = this.finalizeSegmentFromSamples(0, vSamples, aSamples, endedAtCompleteCluster);
					if (seg0) {
						this.segments.push(seg0);
						this.ensureNextSegmentPrebuffered(1);
						return seg0;
					}
				}
			}
		}
		const FALLBACK_INITIAL_BYTES = 165e4;
		let fallbackStartByte = 0;
		if (wantStartSec > 20 && this.totalDurationSec > 60 && this.totalFileBytes > 3e6) fallbackStartByte = Math.max(0, Math.floor(wantStartSec / this.totalDurationSec * this.totalFileBytes));
		const fallbackEndByte = this.totalFileBytes > 0 ? Math.min(this.totalFileBytes - 1, fallbackStartByte + FALLBACK_INITIAL_BYTES - 1) : fallbackStartByte + FALLBACK_INITIAL_BYTES - 1;
		const res = await fetch(this.url, {
			signal: this.abortController.signal,
			headers: { Range: `bytes=${fallbackStartByte}-${fallbackEndByte}` }
		});
		if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
		const buf = new Uint8Array(await res.arrayBuffer());
		if (this.aborted) throw new Error("Aborted");
		const parsed = parseMkvHeaderAndSamples(buf, this.tracks.length > 0 ? this.tracks : void 0, this.timecodeScale);
		if (parsed.tracks.length > 0) this.tracks = parsed.tracks;
		this.timecodeScale = parsed.timecodeScale;
		if (parsed.durationSec > 0) this.totalDurationSec = parsed.durationSec;
		this.mergeSubtitleSamples(parsed.subtitleSamples);
		const endedAtCompleteCluster = parsed.consumedBytes > 0 && parsed.consumedBytes < buf.byteLength;
		this.nextByteOffset = fallbackStartByte + parsed.consumedBytes;
		if (this.totalFileBytes > 0 && this.nextByteOffset >= this.totalFileBytes) this.eofReached = true;
		let vSamples = parsed.videoSamples;
		let aSamples = parsed.audioSamples;
		if (fallbackStartByte > 0) {
			const firstKf = vSamples.findIndex((s) => s.keyframe);
			if (firstKf > 0) {
				const cutPts = vSamples[firstKf].ptsMs;
				vSamples = vSamples.slice(firstKf);
				aSamples = aSamples.filter((a) => a.ptsMs >= cutPts - 20);
			} else if (firstKf === -1 && vSamples.length > 0) vSamples[0].keyframe = true;
		}
		const seg0 = this.finalizeSegmentFromSamples(0, vSamples, aSamples, endedAtCompleteCluster);
		if (!seg0) throw new Error("Unsupported MKV codec or empty segment");
		this.segments.push(seg0);
		this.ensureNextSegmentPrebuffered(1);
		return seg0;
	}
	finalizeSegmentFromSamples(segIndex, vAll, aAll, exactClusterAligned = false) {
		let vFiltered = vAll;
		let aFiltered = aAll;
		if (segIndex > 0 && this.lastEmittedVideoPtsMs > 0) {
			const minNextPts = this.lastEmittedVideoPtsMs - 5;
			const firstValidKf = vFiltered.findIndex((s) => s.keyframe && s.ptsMs >= minNextPts);
			if (firstValidKf > 0) vFiltered = vFiltered.slice(firstValidKf);
			else if (firstValidKf === -1) vFiltered = vFiltered.filter((s) => s.ptsMs > minNextPts);
			if (vFiltered.length > 0) {
				if (!vFiltered[0].keyframe) {
					const kfIdx = vFiltered.findIndex((s) => s.keyframe);
					if (kfIdx > 0) vFiltered = vFiltered.slice(kfIdx);
					else vFiltered[0].keyframe = true;
				}
				const cutPts = vFiltered[0].ptsMs;
				aFiltered = aFiltered.filter((a) => a.ptsMs >= cutPts - 20);
			}
		}
		if (vFiltered.length < 2) return null;
		let vForSeg = vFiltered;
		let aForSeg = aFiltered;
		if (!exactClusterAligned && !this.eofReached) {
			let lastKeyframeIdx = -1;
			for (let i = vFiltered.length - 1; i >= Math.min(25, Math.floor(vFiltered.length * .65)); i--) if (vFiltered[i].keyframe) {
				lastKeyframeIdx = i;
				break;
			}
			if (lastKeyframeIdx > 15 && lastKeyframeIdx < vFiltered.length - 1) {
				const splitPtsMs = vFiltered[lastKeyframeIdx].ptsMs;
				vForSeg = vFiltered.slice(0, lastKeyframeIdx);
				this.carryVideo = vFiltered.slice(lastKeyframeIdx);
				aForSeg = aFiltered.filter((a) => a.ptsMs < splitPtsMs);
				this.carryAudio = aFiltered.filter((a) => a.ptsMs >= splitPtsMs);
			} else {
				this.carryVideo = [];
				this.carryAudio = [];
			}
		} else {
			this.carryVideo = [];
			this.carryAudio = [];
		}
		const built = buildFastStartMp4(this.tracks, vForSeg, aForSeg);
		if (!built) return null;
		let maxPts = this.lastEmittedVideoPtsMs;
		for (const s of vForSeg) if (s.ptsMs > maxPts) maxPts = s.ptsMs;
		this.lastEmittedVideoPtsMs = maxPts;
		const blob = new Blob([built.mp4Bytes], { type: "video/mp4" });
		return {
			index: segIndex,
			blobUrl: URL.createObjectURL(blob),
			startSec: built.startSec,
			durationSec: built.durationSec
		};
	}
	ensureNextSegmentPrebuffered(targetIndex, chainDepth = 0) {
		const existing = this.segments.find((s) => s.index === targetIndex && s.blobUrl);
		if (existing) {
			if (chainDepth < 1 && !this.eofReached && !this.aborted) {
				if (!this.segments.find((s) => s.index === targetIndex + 1 && s.blobUrl) && !this.buildingPromise) this.ensureNextSegmentPrebuffered(targetIndex + 1, chainDepth + 1);
			}
			return Promise.resolve(existing);
		}
		if (this.buildingPromise) return this.buildingPromise;
		if (this.eofReached && this.carryVideo.length === 0) return Promise.resolve(null);
		this.buildingPromise = (async () => {
			const bgCtrl = new AbortController();
			this.bgPrebufferAbortController = bgCtrl;
			try {
				let vCombined = [...this.carryVideo];
				let aCombined = [...this.carryAudio];
				this.carryVideo = [];
				this.carryAudio = [];
				let exactAligned = false;
				if (!this.eofReached) {
					const rangeStart = this.nextByteOffset;
					const desiredBytes = 36e5;
					let rangeEnd = this.totalFileBytes > 0 ? Math.min(this.totalFileBytes - 1, rangeStart + desiredBytes - 1) : rangeStart + desiredBytes - 1;
					if (this.cuePoints.length >= 2) {
						const nextCue = this.cuePoints.find((c) => c.byteOffset >= rangeStart + 22e5 && c.byteOffset <= rangeStart + desiredBytes + 14e5);
						if (nextCue) {
							rangeEnd = nextCue.byteOffset - 1;
							exactAligned = true;
						}
					}
					const res = await fetch(this.url, {
						signal: bgCtrl.signal,
						headers: { Range: `bytes=${rangeStart}-${rangeEnd}` }
					});
					if (res.ok || res.status === 206) {
						const buf = new Uint8Array(await res.arrayBuffer());
						if (this.aborted || bgCtrl.signal.aborted) return null;
						const parsed = parseMkvHeaderAndSamples(buf, this.tracks, this.timecodeScale);
						this.mergeSubtitleSamples(parsed.subtitleSamples);
						const endedAtCompleteCluster = exactAligned || parsed.consumedBytes > 0 && parsed.consumedBytes < buf.byteLength;
						this.nextByteOffset = exactAligned ? rangeEnd + 1 : rangeStart + parsed.consumedBytes;
						exactAligned = endedAtCompleteCluster;
						if (this.totalFileBytes > 0 && this.nextByteOffset >= this.totalFileBytes || parsed.videoSamples.length === 0) this.eofReached = true;
						vCombined = vCombined.concat(parsed.videoSamples);
						aCombined = aCombined.concat(parsed.audioSamples);
					} else this.eofReached = true;
				}
				const seg = this.finalizeSegmentFromSamples(targetIndex, vCombined, aCombined, exactAligned);
				if (seg) {
					this.segments.push(seg);
					if (this.segments.length > 6) {
						const toRemove = this.segments.slice(0, this.segments.length - 6);
						for (const old of toRemove) if (old.blobUrl) {
							try {
								URL.revokeObjectURL(old.blobUrl);
							} catch {}
							old.blobUrl = "";
						}
						this.segments = this.segments.filter((s) => Boolean(s.blobUrl));
					}
				}
				return seg;
			} catch {
				return null;
			} finally {
				this.buildingPromise = null;
				if (this.bgPrebufferAbortController === bgCtrl) this.bgPrebufferAbortController = null;
				if (chainDepth < 1 && !this.aborted && !this.eofReached) this.ensureNextSegmentPrebuffered(targetIndex + 1, chainDepth + 1);
			}
		})();
		return this.buildingPromise;
	}
	async seekToSeconds(targetSec) {
		if (this.totalDurationSec <= 0 && this.totalFileBytes <= 0) return null;
		const maxDur = this.totalDurationSec > 0 ? this.totalDurationSec : 99999;
		const clampedSec = Math.max(0, Math.min(maxDur - 2, targetSec));
		try {
			this.seekAbortController?.abort();
		} catch {}
		try {
			this.bgPrebufferAbortController?.abort();
		} catch {}
		this.buildingPromise = null;
		const seekCtrl = new AbortController();
		this.seekAbortController = seekCtrl;
		try {
			if (this.cuePoints.length === 0 && this.totalFileBytes > 22e4) await Promise.race([this.ensureCuesTableLoaded(), new Promise((r) => setTimeout(() => r([]), 2200))]);
			let startByte = 0;
			let endByte = 0;
			let exactAligned = false;
			const cueRange = this.findExactCueByteRange(clampedSec, 55e4, 115e4, 1e4, false);
			if (cueRange) {
				startByte = cueRange.startByte;
				endByte = cueRange.endByte;
				exactAligned = cueRange.exactAligned;
			} else {
				const approxRatio = this.totalDurationSec > 0 ? clampedSec / this.totalDurationSec : 0;
				startByte = Math.max(0, Math.floor(approxRatio * this.totalFileBytes));
				const FALLBACK_SEEK_BYTES = 185e4;
				endByte = this.totalFileBytes > 0 ? Math.min(this.totalFileBytes - 1, startByte + FALLBACK_SEEK_BYTES - 1) : startByte + FALLBACK_SEEK_BYTES - 1;
			}
			const res = await fetch(this.url, {
				signal: seekCtrl.signal,
				headers: { Range: `bytes=${startByte}-${endByte}` }
			});
			if (!res.ok && res.status !== 206) return null;
			const buf = new Uint8Array(await res.arrayBuffer());
			if (this.aborted || seekCtrl.signal.aborted) return null;
			const parsed = parseMkvHeaderAndSamples(buf, this.tracks, this.timecodeScale);
			this.mergeSubtitleSamples(parsed.subtitleSamples);
			const endedAtCompleteCluster = exactAligned || parsed.consumedBytes > 0 && parsed.consumedBytes < buf.byteLength;
			this.nextByteOffset = exactAligned ? endByte + 1 : startByte + parsed.consumedBytes;
			this.eofReached = this.totalFileBytes > 0 && this.nextByteOffset >= this.totalFileBytes;
			if (parsed.videoSamples.length === 0) return null;
			let firstKfIdx = parsed.videoSamples.findIndex((s) => s.keyframe);
			if (firstKfIdx === -1) {
				parsed.videoSamples[0].keyframe = true;
				firstKfIdx = 0;
			}
			const cutPts = parsed.videoSamples[firstKfIdx].ptsMs;
			const vSamples = parsed.videoSamples.slice(firstKfIdx);
			const aSamples = parsed.audioSamples.filter((a) => a.ptsMs >= cutPts - 20);
			this.lastEmittedVideoPtsMs = -1;
			this.carryVideo = [];
			this.carryAudio = [];
			for (const old of this.segments) if (old.blobUrl) {
				try {
					URL.revokeObjectURL(old.blobUrl);
				} catch {}
				old.blobUrl = "";
			}
			this.segments = [];
			const newIdx = Math.floor(Date.now() % 1e5);
			const seg = this.finalizeSegmentFromSamples(newIdx, vSamples, aSamples, endedAtCompleteCluster);
			if (seg) {
				this.segments.push(seg);
				this.ensureNextSegmentPrebuffered(newIdx + 1);
			}
			return seg;
		} catch {
			return null;
		}
	}
};