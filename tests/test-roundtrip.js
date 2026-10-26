/**
 * Node.js Round-trip Test: Image -> Encode -> Audio -> Decode -> Image
 */

import { encodeRobot36 } from '../public/js/sstv/encoder.js';
import { decodeAll } from '../public/js/sstv/decoder.js';
import { WIDTH, HEIGHT } from '../public/js/sstv/constants.js';

console.log('--- SSTV Robot36 Round-trip Test ---');

// 1. Create a synthetic 320x240 RGB image
const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
for (let r = 0; r < HEIGHT; r++) {
  for (let c = 0; c < WIDTH; c++) {
    const idx = (r * WIDTH + c) * 4;
    if (r < 40) {
      // Top bar: White
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
    } else if (r > 200) {
      // Bottom bar: Black
      data[idx] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
    } else if (c < 160) {
      // Left block: Neutral Gray
      data[idx] = 128;
      data[idx + 1] = 128;
      data[idx + 2] = 128;
    } else {
      // Right block: Red
      data[idx] = 220;
      data[idx + 1] = 30;
      data[idx + 2] = 30;
    }
    data[idx + 3] = 255;
  }
}

console.log('1. Generated synthetic test image (320x240)');

// 2. Encode to Robot36 Audio
console.time('Encoding Audio');
const audio = encodeRobot36({ width: WIDTH, height: HEIGHT, data });
console.timeEnd('Encoding Audio');
console.log(`2. Audio generated: ${audio.length} samples (${(audio.length / 24000).toFixed(2)} seconds)`);

// 3. Decode Audio
console.time('Decoding Audio');
const results = decodeAll(audio, (p) => {
  if (Math.round(p.progress * 100) % 25 === 0) {
    console.log(`   [Decoder] ${(p.progress * 100).toFixed(0)}%: ${p.message}`);
  }
});
console.timeEnd('Decoding Audio');

console.log(`3. Decode finished, found ${results.length} image(s)`);

if (results.length === 0) {
  console.error('FAILED: No image detected!');
  process.exit(1);
}

const match = results[0];
console.log(`   Timestamp: ${match.timestamp.toFixed(2)}s, Sync Score: ${match.score}/240, Clock Scale: ${match.scale.toFixed(5)}`);

if (match.score < 200) {
  console.error(`FAILED: Sync score ${match.score} is too low (expected > 200)`);
  process.exit(1);
}

// 4. Check decoded colors
// Sample Left Center (Gray) and Right Center (Red)
const centerRow = 120;
const leftCol = 80;
const rightCol = 240;

const leftIdx = (centerRow * WIDTH + leftCol) * 4;
const rightIdx = (centerRow * WIDTH + rightCol) * 4;

const leftR = match.rgbData[leftIdx], leftG = match.rgbData[leftIdx + 1], leftB = match.rgbData[leftIdx + 2];
const rightR = match.rgbData[rightIdx], rightG = match.rgbData[rightIdx + 1], rightB = match.rgbData[rightIdx + 2];

console.log(`   Left block (expected ~128,128,128): RGB(${leftR}, ${leftG}, ${leftB})`);
console.log(`   Right block (expected ~220,30,30): RGB(${rightR}, ${rightG}, ${rightB})`);

if (rightR > 180 && rightG < 80 && rightB < 80 && Math.abs(leftR - 128) < 30) {
  console.log('SUCCESS: Color reconstruction is highly accurate!');
  process.exit(0);
} else {
  console.error('FAILED: Color error exceeds tolerance.');
  process.exit(1);
}
