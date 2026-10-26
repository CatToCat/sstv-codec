# SSTV Codec

Zero-dependency, browser-native SSTV (Slow Scan Television) Robot36 audio encoder & decoder running purely on client-side Web Audio & Web Workers.

---

## Features

- **Bi-directional SSTV Processing**:
  - **Encode (Image to Audio)**: Convert any high-resolution image into an ITU-standard Robot36 audio signal (continuous-phase DDS sine synthesis, 37.1s WAV).
  - **Decode (Audio to Image)**: Extract SSTV frames from radio recordings (WAV, MP3, M4A, AAC, FLAC) with matched-filter 1200Hz sync detection and clock drift auto-correction.
- **Full Original Resolution Restoration**: Automatically reconstructs and upscales decoded 320x240 SSTV scanlines back to full original image resolution (e.g. 1080x1080) and aspect ratio.
- **Apple Minimalist UI**: Clean, responsive dual-column split workspace in pure white Apple design.
- **Zero Server Upload**: Audio and images are processed entirely within the local browser memory. No file size limits, no timeouts, full privacy.

---

## Getting Started

No external npm dependencies required. Run directly with Node.js:

```bash
# Start local development server (default port 3000)
npm run dev

# Run automated round-trip tests (Image -> Audio -> Decode -> Image)
npm test
```

Open `http://localhost:3000` in your web browser.

---

## Protocol Specifications (Robot36)

- **Resolution**: 320 &times; 240
- **Line Duration**: 150.0 ms
- **Sync Tone**: 1200 Hz (9.0 ms)
- **Luminance (Y)**: 1500 Hz (black) to 2300 Hz (white), 88.0 ms
- **Chrominance**: 1500 Hz to 2300 Hz, 44.0 ms (even lines: Cr, odd lines: Cb)
- **VIS Code**: 0x08 (Decimal 8)

---

## License

[MIT License](LICENSE)
