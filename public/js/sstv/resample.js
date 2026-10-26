/**
 * High-quality linear & cubic spline audio resampler.
 * Converts any input sample rate to target rate (e.g. 24000 Hz).
 */

export function resamplePCM(inputSamples, inputRate, targetRate = 24000) {
  if (inputRate === targetRate) {
    return inputSamples;
  }

  const ratio = inputRate / targetRate;
  const outLength = Math.ceil(inputSamples.length / ratio);
  const output = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const idx0 = Math.floor(srcPos);
    const frac = srcPos - idx0;

    const idxM1 = Math.max(0, idx0 - 1);
    const idxP1 = Math.min(inputSamples.length - 1, idx0 + 1);
    const idxP2 = Math.min(inputSamples.length - 1, idx0 + 2);

    // 4-point Hermite / Catmull-Rom cubic interpolation
    const p0 = inputSamples[idxM1];
    const p1 = inputSamples[idx0];
    const p2 = inputSamples[idxP1];
    const p3 = inputSamples[idxP2];

    const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
    const b = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
    const c = -0.5 * p0 + 0.5 * p2;
    const d = p1;

    output[i] = a * frac * frac * frac + b * frac * frac + c * frac + d;
  }

  return output;
}
