/**
 * SSTV Robot36 Audio Decoder (Digital Phase Discriminator & Line Correlator)
 */

import {
  RATE,
  WIDTH,
  HEIGHT,
  LINE_TIME,
  SYNC_TIME,
  PORCH_TIME,
  Y_TIME,
  SEP_TIME,
  SEP_PORCH_TIME,
  CHROMA_TIME,
} from './constants.js';

// Precompute 65-tap FIR Hilbert coefficients with Blackman window
const HILBERT_TAPS = 65;
const HILBERT_HALF = Math.floor(HILBERT_TAPS / 2); // 32
const HILBERT_COEFFS = new Float32Array(HILBERT_TAPS);

(() => {
  for (let i = 0; i < HILBERT_TAPS; i++) {
    const n = i - HILBERT_HALF;
    if (n % 2 !== 0) {
      const val = 2 / (Math.PI * n);
      // Blackman window
      const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (HILBERT_TAPS - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (HILBERT_TAPS - 1));
      HILBERT_COEFFS[i] = val * w;
    } else {
      HILBERT_COEFFS[i] = 0;
    }
  }
})();

// Biquad Bandpass Filter (950 Hz - 2700 Hz)
class BiquadFilter {
  constructor(type, fc, Q, fs = RATE) {
    const w0 = (2 * Math.PI * fc) / fs;
    const alpha = Math.sin(w0) / (2 * Q);
    const cosw0 = Math.cos(w0);

    let b0, b1, b2, a0, a1, a2;
    if (type === 'highpass') {
      b0 = (1 + cosw0) / 2;
      b1 = -(1 + cosw0);
      b2 = (1 + cosw0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosw0;
      a2 = 1 - alpha;
    } else { // lowpass
      b0 = (1 - cosw0) / 2;
      b1 = 1 - cosw0;
      b2 = (1 - cosw0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosw0;
      a2 = 1 - alpha;
    }

    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  process(input, output = null) {
    const len = input.length;
    const out = output || new Float32Array(len);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < len; i++) {
      const x0 = input[i];
      const y0 = this.b0 * x0 + this.b1 * x1 + this.b2 * x2 - this.a1 * y1 - this.a2 * y2;
      out[i] = y0;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
    }
    return out;
  }
}

const hpFilter = new BiquadFilter('highpass', 950, 0.7071);
const lpFilter = new BiquadFilter('lowpass', 2700, 0.7071);

/**
 * Matched-filter 1200 Hz sync tone pulses.
 */
export function syncCandidates(audio) {
  const windowSize = Math.round(0.006 * RATE); // 144 samples (6 ms)
  const len = audio.length;
  if (len < windowSize) return new Int32Array(0);

  const TWO_PI_1200_RATE = (2 * Math.PI * 1200) / RATE;

  // Prefix sums for moving average
  const sumI = new Float64Array(len + 1);
  const sumQ = new Float64Array(len + 1);
  const sumP = new Float64Array(len + 1);

  for (let i = 0; i < len; i++) {
    const s = audio[i];
    const angle = i * TWO_PI_1200_RATE;
    const iVal = s * Math.cos(angle);
    const qVal = -s * Math.sin(angle);
    const pVal = s * s;

    sumI[i + 1] = sumI[i] + iVal;
    sumQ[i + 1] = sumQ[i] + qVal;
    sumP[i + 1] = sumP[i] + pVal;
  }

  const halfWin = Math.floor(windowSize / 2);
  const mask = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    const start = Math.max(0, i - halfWin);
    const end = Math.min(len, i + halfWin);
    const count = end - start;

    const avgI = (sumI[end] - sumI[start]) / count;
    const avgQ = (sumQ[end] - sumQ[start]) / count;
    const avgP = (sumP[end] - sumP[start]) / count;

    const demodMag = Math.hypot(avgI, avgQ);
    const strength = demodMag / (Math.sqrt(avgP) + 1e-5);
    if (strength > 0.35) {
      mask[i] = 1;
    }
  }

  // Detect rising and falling edges
  const minLen = Math.round(0.003 * RATE); // 72 samples
  const maxLen = Math.round(0.013 * RATE); // 312 samples
  const shift = Math.round(0.0045 * RATE);  // 108 samples

  const candidates = [];
  let inPulse = false;
  let pulseStart = 0;

  for (let i = 0; i < len; i++) {
    if (!inPulse && mask[i]) {
      inPulse = true;
      pulseStart = i;
    } else if (inPulse && !mask[i]) {
      inPulse = false;
      const duration = i - pulseStart;
      if (duration >= minLen && duration <= maxLen) {
        const center = Math.floor((pulseStart + i) / 2) - shift;
        if (center >= 0) candidates.push(center);
      }
    }
  }

  return new Int32Array(candidates);
}

/**
 * Scan candidates to identify complete 240-line sequences.
 */
export function findAllLines(candidates, audioLength) {
  if (candidates.length < 20) return [];

  const minGap = 0.145 * RATE;
  const maxGap = 0.152 * RATE;
  const gaps = new Int32Array(candidates.length - 1);
  for (let i = 0; i < gaps.length; i++) {
    gaps[i] = candidates[i + 1] - candidates[i];
  }

  // Find contiguous runs of plausible gaps
  const runs = [];
  let runStart = -1;
  for (let i = 0; i < gaps.length; i++) {
    const isPlausible = gaps[i] > minGap && gaps[i] < maxGap;
    if (isPlausible) {
      if (runStart === -1) runStart = i;
    } else {
      if (runStart !== -1) {
        if (i - runStart >= 10) runs.push([runStart, i]);
        runStart = -1;
      }
    }
  }
  if (runStart !== -1 && gaps.length - runStart >= 10) {
    runs.push([runStart, gaps.length]);
  }

  if (runs.length === 0) return [];

  // Sort runs by length descending
  runs.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  const [bestBegin, bestEnd] = runs[0];
  const step = (candidates[bestEnd] - candidates[bestBegin]) / (bestEnd - bestBegin);
  const scale = step / (LINE_TIME * RATE);

  const expectedOffsets = new Int32Array(HEIGHT);
  for (let r = 0; r < HEIGHT; r++) {
    expectedOffsets[r] = Math.round(r * step);
  }

  const errorThreshold = Math.round(0.007 * RATE);
  const scored = [];

  for (let i = 0; i < candidates.length; i++) {
    const start = candidates[i];
    if (start + (HEIGHT - 1) * step + step > audioLength) continue;

    let score = 0;
    for (let r = 0; r < HEIGHT; r++) {
      const target = start + expectedOffsets[r];
      // Binary search nearest candidate
      let low = 0, high = candidates.length - 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (candidates[mid] < target) low = mid + 1;
        else high = mid - 1;
      }
      let minErr = Infinity;
      if (low < candidates.length) minErr = Math.min(minErr, Math.abs(candidates[low] - target));
      if (low > 0) minErr = Math.min(minErr, Math.abs(candidates[low - 1] - target));

      if (minErr < errorThreshold) score++;
    }

    if (score >= 70) {
      scored.push({ start, score });
    }
  }

  if (scored.length === 0) return [];

  // Group nearby starts (within 350 samples) and select max score
  scored.sort((a, b) => b.score - a.score);
  const distinct = [];
  for (const item of scored) {
    if (!distinct.some(d => Math.abs(d.start - item.start) < 350)) {
      distinct.push(item);
    }
  }

  // Construct precise line positions for each match
  return distinct.map(m => {
    const lines = new Int32Array(HEIGHT);
    for (let r = 0; r < HEIGHT; r++) {
      const target = Math.round(m.start + r * step);
      // Find exact candidate if present
      let low = 0, high = candidates.length - 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (candidates[mid] < target) low = mid + 1;
        else high = mid - 1;
      }
      let bestCand = -1, minErr = errorThreshold;
      if (low < candidates.length && Math.abs(candidates[low] - target) < minErr) {
        minErr = Math.abs(candidates[low] - target);
        bestCand = candidates[low];
      }
      if (low > 0 && Math.abs(candidates[low - 1] - target) < minErr) {
        bestCand = candidates[low - 1];
      }
      lines[r] = bestCand !== -1 ? bestCand : target;
    }
    return { offset: m.start, lines, score: m.score, scale };
  });
}

/**
 * FM Discriminator: Compute instantaneous frequencies using Biquad bandpass + FIR Hilbert.
 */
export function frequencies(audio) {
  const len = audio.length;

  // 1. Bandpass filter 950 - 2700 Hz
  const bpOut = new Float32Array(len);
  hpFilter.process(audio, bpOut);
  lpFilter.process(bpOut, bpOut);

  // 2. 65-tap FIR Hilbert transform to obtain quadrature signal
  const quadrature = new Float32Array(len);
  for (let i = HILBERT_HALF; i < len - HILBERT_HALF; i++) {
    let sum = 0;
    for (let k = 1; k <= HILBERT_HALF; k += 2) {
      sum += HILBERT_COEFFS[HILBERT_HALF + k] * (bpOut[i - k] - bpOut[i + k]);
    }
    quadrature[i] = sum;
  }

  // Real signal is already aligned at the center of the symmetric FIR filter
  const analyticI = bpOut;

  // 3. Phase difference discriminator
  const phaseStep = new Float32Array(len);
  for (let i = 1; i < len; i++) {
    const i1 = analyticI[i], q1 = quadrature[i];
    const i0 = analyticI[i - 1], q0 = quadrature[i - 1];
    const dot = i1 * i0 + q1 * q0;
    const cross = q1 * i0 - i1 * q0;
    phaseStep[i] = Math.atan2(cross, dot);
  }

  // 4. 21-tap moving average filter on phase steps
  const win = 21;
  const halfWin = Math.floor(win / 2);
  const freq = new Float32Array(len);
  const scale = RATE / (2 * Math.PI);

  let sum = 0;
  for (let i = 0; i < win && i < len; i++) sum += phaseStep[i];

  for (let i = 0; i < len; i++) {
    const addIdx = i + halfWin;
    const subIdx = i - halfWin - 1;
    if (addIdx < len && addIdx >= win) sum += phaseStep[addIdx];
    if (subIdx >= 0) sum -= phaseStep[subIdx];
    freq[i] = (sum / win) * scale;
  }

  return freq;
}

/**
 * Sample a color or luminance channel from instantaneous frequencies.
 */
function sampleChannel(freq, lines, offsetSec, durationSec, scale) {
  const result = new Float32Array(HEIGHT * WIDTH);
  const len = freq.length;

  for (let r = 0; r < HEIGHT; r++) {
    const lineStart = lines[r];
    const rowOffset = r * WIDTH;
    for (let c = 0; c < WIDTH; c++) {
      const t = (offsetSec + (c + 0.5) * (durationSec / WIDTH)) * scale;
      const idx = lineStart + Math.round(t * RATE);
      if (idx >= 0 && idx < len) {
        const val = (freq[idx] - 1500) * (255 / 800);
        result[rowOffset + c] = Math.max(0, Math.min(255, val));
      } else {
        result[rowOffset + c] = 0;
      }
    }
  }
  return result;
}

/**
 * Render Y and Cr/Cb into RGB and Grayscale RGBA arrays.
 */
export function renderRobot36(freq, lines, scale) {
  const Y = sampleChannel(freq, lines, 0.012, 0.088, scale);
  const chroma = sampleChannel(freq, lines, 0.106, 0.044, scale);

  // Even rows: Cr (R-Y); Odd rows: Cb (B-Y)
  const rgbData = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  const grayData = new Uint8ClampedArray(WIDTH * HEIGHT * 4);

  for (let r = 0; r < HEIGHT; r++) {
    // Each chroma line is shared across its line pair:
    // even row pair is (r, r+1), so even row uses r's Cr and (r+1)'s Cb
    const evenRow = r % 2 === 0 ? r : r - 1;
    const oddRow = Math.min(HEIGHT - 1, evenRow + 1);

    const rowOffset = r * WIDTH;
    const evenOffset = evenRow * WIDTH;
    const oddOffset = oddRow * WIDTH;

    for (let c = 0; c < WIDTH; c++) {
      const yVal = Y[rowOffset + c];
      const crVal = chroma[evenOffset + c] - 128;
      const cbVal = chroma[oddOffset + c] - 128;

      // Color reconstruction
      const R = Math.max(0, Math.min(255, yVal + 1.402 * crVal));
      const G = Math.max(0, Math.min(255, yVal - 0.344136 * cbVal - 0.714136 * crVal));
      const B = Math.max(0, Math.min(255, yVal + 1.772 * cbVal));

      const outIdx = (rowOffset + c) * 4;
      rgbData[outIdx] = R;
      rgbData[outIdx + 1] = G;
      rgbData[outIdx + 2] = B;
      rgbData[outIdx + 3] = 255;

      // Grayscale luminance only
      grayData[outIdx] = yVal;
      grayData[outIdx + 1] = yVal;
      grayData[outIdx + 2] = yVal;
      grayData[outIdx + 3] = 255;
    }
  }

  return { rgbData, grayData };
}

/**
 * Full Audio Scanner: Scan long audio in 80s overlapping windows.
 */
export function decodeAll(audio, onProgress = null) {
  const duration = audio.length / RATE;
  const found = [];
  const windowSec = 80;
  const stepSec = 40;

  const starts = [];
  for (let s = 0; s < Math.max(1, duration - 35); s += stepSec) {
    starts.push(s);
  }

  for (let i = 0; i < starts.length; i++) {
    const startSec = starts[i];
    if (onProgress) {
      onProgress({
        progress: (i + 0.5) / starts.length,
        message: `Scanning ${startSec.toFixed(0)}s–${Math.min(startSec + windowSec, duration).toFixed(0)}s...`,
      });
    }

    const startSample = Math.floor(startSec * RATE);
    const endSample = Math.min(audio.length, Math.floor((startSec + windowSec) * RATE));
    const chunk = audio.subarray(startSample, endSample);
    if (chunk.length < 35 * RATE) continue;

    const candidates = syncCandidates(chunk);
    if (candidates.length < 20) continue;

    const matches = findAllLines(candidates, chunk.length);
    if (matches.length === 0) continue;

    const freq = frequencies(chunk);

    for (const match of matches) {
      const absoluteSec = startSec + match.offset / RATE;
      // Deduplicate with existing matches within 34 seconds
      if (found.some(prev => Math.abs(prev.timestamp - absoluteSec) < 34)) {
        continue;
      }

      const { rgbData, grayData } = renderRobot36(freq, match.lines, match.scale);
      found.push({
        timestamp: absoluteSec,
        score: match.score,
        scale: match.scale,
        rgbData,
        grayData,
        width: WIDTH,
        height: HEIGHT,
      });
    }
  }

  found.sort((a, b) => a.timestamp - b.timestamp);
  if (onProgress) {
    onProgress({ progress: 1.0, message: `Completed! Found ${found.length} image(s).` });
  }

  return found;
}
