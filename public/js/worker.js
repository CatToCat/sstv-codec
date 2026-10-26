/**
 * SSTV Web Worker
 * Offloads heavy DSP computation from the main UI thread.
 */

import { decodeAll } from './sstv/decoder.js';
import { encodeRobot36 } from './sstv/encoder.js';
import { resamplePCM } from './sstv/resample.js';
import { encodeWAV } from './sstv/wav.js';

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  try {
    if (type === 'DECODE') {
      const { samples, sampleRate } = payload;
      // Resample to 24000 Hz if needed
      const pcm24k = resamplePCM(samples, sampleRate, 24000);

      const results = decodeAll(pcm24k, (progressInfo) => {
        self.postMessage({ type: 'DECODE_PROGRESS', payload: progressInfo });
      });

      // Transferable image data arrays for performance
      const transferList = [];
      const sanitized = results.map(r => {
        transferList.push(r.rgbData.buffer, r.grayData.buffer);
        return {
          timestamp: r.timestamp,
          score: r.score,
          scale: r.scale,
          width: r.width,
          height: r.height,
          rgbData: r.rgbData,
          grayData: r.grayData,
        };
      });

      self.postMessage({ type: 'DECODE_COMPLETE', payload: sanitized }, transferList);
    } else if (type === 'ENCODE') {
      const { width, height, data } = payload;
      const audio = encodeRobot36({ width, height, data }, (progress) => {
        self.postMessage({ type: 'ENCODE_PROGRESS', payload: { progress } });
      });

      // Package into 16-bit PCM WAV
      const wavBuffer = encodeWAV(audio, 24000);
      self.postMessage(
        {
          type: 'ENCODE_COMPLETE',
          payload: {
            wavBuffer,
            duration: audio.length / 24000,
            samplesCount: audio.length,
          },
        },
        [wavBuffer]
      );
    }
  } catch (err) {
    self.postMessage({ type: 'ERROR', payload: err.message || String(err) });
  }
};
