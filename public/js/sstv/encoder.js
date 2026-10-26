/**
 * SSTV Robot36 Audio Encoder (Continuous-phase DDS Synthesizer)
 */

import {
  RATE,
  WIDTH,
  HEIGHT,
  FREQ_SYNC,
  FREQ_PORCH,
  FREQ_BLACK,
  FREQ_RANGE,
  FREQ_SEP_EVEN,
  FREQ_SEP_ODD,
  FREQ_SEP_PORCH,
  FREQ_LEADER,
  FREQ_VIS_BIT0,
  FREQ_VIS_BIT1,
  ROBOT36_VIS_CODE,
} from './constants.js';

export function encodeRobot36(imageData, onProgress = null) {
  const { width, height, data } = imageData;
  if (width !== WIDTH || height !== HEIGHT) {
    throw new Error(`Image dimensions must be ${WIDTH}x${HEIGHT}, got ${width}x${height}`);
  }

  // Pre-calculate total sample count
  const headerDuration = 0.300 + 0.010 + 0.300 + 0.030 + 8 * 0.030 + 0.030 + 0.010; // 0.920 s
  const linesDuration = HEIGHT * 0.150; // 36.000 s
  const tailDuration = 0.200; // 200 ms trailing silence
  const totalDuration = headerDuration + linesDuration + tailDuration;
  const totalSamples = Math.ceil(totalDuration * RATE);
  const audio = new Float32Array(totalSamples);

  let sampleIdx = 0;
  let phase = 0;
  const TWO_PI = 2 * Math.PI;
  const amplitude = 0.8; // 80% full scale to leave headroom

  // Helper: append fixed-frequency tone with continuous phase
  function appendTone(freq, durationSec) {
    const count = Math.round(durationSec * RATE);
    const phaseInc = (TWO_PI * freq) / RATE;
    for (let i = 0; i < count; i++) {
      if (sampleIdx < totalSamples) {
        audio[sampleIdx++] = amplitude * Math.sin(phase);
        phase += phaseInc;
        if (phase > TWO_PI) phase -= TWO_PI;
      }
    }
  }

  // --- 1. Leader / Calibration Header ---
  appendTone(FREQ_LEADER, 0.300); // 1900 Hz, 300 ms
  appendTone(FREQ_SYNC, 0.010);   // 1200 Hz, 10 ms
  appendTone(FREQ_LEADER, 0.300); // 1900 Hz, 300 ms

  // --- 2. VIS Header ---
  appendTone(FREQ_SYNC, 0.030);   // VIS Start: 1200 Hz, 30 ms

  // VIS 7 data bits (LSB first) + even parity bit
  let parityCount = 0;
  for (let b = 0; b < 7; b++) {
    const bit = (ROBOT36_VIS_CODE >> b) & 1;
    if (bit === 1) parityCount++;
    const freq = bit ? FREQ_VIS_BIT1 : FREQ_VIS_BIT0;
    appendTone(freq, 0.030); // 30 ms per bit
  }
  // Parity bit (even parity)
  const parityBit = (parityCount % 2 === 0) ? 0 : 1;
  appendTone(parityBit ? FREQ_VIS_BIT1 : FREQ_VIS_BIT0, 0.030);

  appendTone(FREQ_SYNC, 0.030);   // VIS Stop: 1200 Hz, 30 ms
  appendTone(FREQ_PORCH, 0.010);  // Sync separator: 1500 Hz porch (10 ms) so line 0 sync isn't merged!

  // --- Precompute Y, Cr, Cb arrays (Float32Array[HEIGHT][WIDTH]) ---
  const Y = new Float32Array(HEIGHT * WIDTH);
  const Cr = new Float32Array(HEIGHT * WIDTH);
  const Cb = new Float32Array(HEIGHT * WIDTH);

  for (let r = 0; r < HEIGHT; r++) {
    for (let c = 0; c < WIDTH; c++) {
      const idx = (r * WIDTH + c) * 4;
      const R = data[idx];
      const G = data[idx + 1];
      const B = data[idx + 2];
      const pos = r * WIDTH + c;

      // ITU-R BT.601 conversion
      const yVal = 0.299 * R + 0.587 * G + 0.114 * B;
      Y[pos] = Math.max(0, Math.min(255, yVal));
      Cr[pos] = Math.max(0, Math.min(255, 0.500 * R - 0.419 * G - 0.081 * B + 128));
      Cb[pos] = Math.max(0, Math.min(255, -0.169 * R - 0.331 * G + 0.500 * B + 128));
    }
  }

  // --- 3. Scan Lines (240 lines) ---
  const yDuration = 0.088;      // 88 ms
  const chromaDuration = 0.044; // 44 ms
  const ySamplesCount = Math.round(yDuration * RATE);
  const chromaSamplesCount = Math.round(chromaDuration * RATE);

  for (let row = 0; row < HEIGHT; row++) {
    // Report progress periodically
    if (onProgress && row % 20 === 0) {
      onProgress(row / HEIGHT);
    }

    // A. Sync pulse: 1200 Hz, 9 ms
    appendTone(FREQ_SYNC, 0.009);

    // B. Sync porch: 1500 Hz, 3 ms
    appendTone(FREQ_PORCH, 0.003);

    // C. Y (Luminance) scan: 88 ms, 320 pixels
    const rowOffset = row * WIDTH;
    for (let i = 0; i < ySamplesCount; i++) {
      const px = Math.min(WIDTH - 1, Math.floor((i / ySamplesCount) * WIDTH));
      const yVal = Y[rowOffset + px];
      const freq = FREQ_BLACK + yVal * (FREQ_RANGE / 255);
      const phaseInc = (TWO_PI * freq) / RATE;
      if (sampleIdx < totalSamples) {
        audio[sampleIdx++] = amplitude * Math.sin(phase);
        phase += phaseInc;
        if (phase > TWO_PI) phase -= TWO_PI;
      }
    }

    // D. Separator pulse: 4.5 ms
    // Even rows send Cr (1500 Hz); Odd rows send Cb (2300 Hz)
    const isEven = row % 2 === 0;
    appendTone(isEven ? FREQ_SEP_EVEN : FREQ_SEP_ODD, 0.0045);

    // E. Chroma porch: 1900 Hz, 1.5 ms
    appendTone(FREQ_SEP_PORCH, 0.0015);

    // F. Chroma scan: 44 ms
    // Even rows transmit Cr for the current line pair; odd rows transmit Cb.
    const chromaArr = isEven ? Cr : Cb;
    for (let i = 0; i < chromaSamplesCount; i++) {
      const px = Math.min(WIDTH - 1, Math.floor((i / chromaSamplesCount) * WIDTH));
      const chromaVal = chromaArr[rowOffset + px];
      const freq = FREQ_BLACK + chromaVal * (FREQ_RANGE / 255);
      const phaseInc = (TWO_PI * freq) / RATE;
      if (sampleIdx < totalSamples) {
        audio[sampleIdx++] = amplitude * Math.sin(phase);
        phase += phaseInc;
        if (phase > TWO_PI) phase -= TWO_PI;
      }
    }
  }

  // Trailing silence
  while (sampleIdx < totalSamples) {
    audio[sampleIdx++] = 0;
  }

  if (onProgress) onProgress(1.0);
  return audio;
}
