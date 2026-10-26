/**
 * SSTV Codec Web Application
 * Pure client-side Web Audio & Web Worker DSP Pipeline
 * English-only, zero external dependencies.
 */

import { WIDTH, HEIGHT } from './sstv/constants.js';

document.addEventListener('DOMContentLoaded', () => {
  const worker = new Worker('js/worker.js', { type: 'module' });

  // Store current source image metadata for full-resolution restoration
  let originalSpecs = {
    width: 1080,
    height: 1080,
    aspect: 1.0,
    hasReference: true,
  };

  // ==========================================
  // CUSTOM APPLE POPOVER DROPDOWNS
  // ==========================================
  function setupDropdown(dropdownId, triggerBtnId, menuId, valueDisplayId, onSelect = null) {
    const dropdown = document.getElementById(dropdownId);
    const triggerBtn = document.getElementById(triggerBtnId);
    const menu = document.getElementById(menuId);
    const valueDisplay = document.getElementById(valueDisplayId);

    if (!dropdown || !triggerBtn || !menu) return;

    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) {
        menu.classList.add('open');
        triggerBtn.classList.add('open');
      }
    });

    menu.querySelectorAll('.menu-item:not(.disabled)').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.querySelectorAll('.menu-item').forEach((i) => i.classList.remove('active'));
        item.classList.add('active');

        const label = item.querySelector('.item-text').textContent;
        const val = item.dataset.value;
        if (valueDisplay) valueDisplay.textContent = label;

        menu.classList.remove('open');
        triggerBtn.classList.remove('open');

        if (onSelect) onSelect(val, label);
      });
    });
  }

  function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu.open').forEach((m) => m.classList.remove('open'));
    document.querySelectorAll('.dropdown-trigger.open').forEach((t) => t.classList.remove('open'));
  }

  document.addEventListener('click', closeAllDropdowns);

  setupDropdown('encodeDropdown', 'encodeDropdownBtn', 'encodeDropdownMenu', 'encodeCurrentMode', (val) => {
    const audioSpecsTag = document.getElementById('audioSpecsTag');
    if (audioSpecsTag && val === 'robot36') {
      audioSpecsTag.textContent = 'Robot 36 \u00b7 37.1s';
    }
  });

  setupDropdown('decodeDropdown', 'decodeDropdownBtn', 'decodeDropdownMenu', 'decodeCurrentMode');

  // ==========================================
  // LEFT: ENCODER CONTROLS
  // ==========================================
  const encodeFileInput = document.getElementById('encodeFileInput');
  const btnChooseImage = document.getElementById('btnChooseImage');
  const encodePreviewCanvas = document.getElementById('encodePreviewCanvas');
  const previewCtx = encodePreviewCanvas.getContext('2d');
  const watermarkText = document.getElementById('watermarkText');
  const btnStartEncode = document.getElementById('btnStartEncode');
  const encodeResultBox = document.getElementById('encodeResultBox');
  const audioPlayer = document.getElementById('audioPlayer');
  const btnDownloadWav = document.getElementById('btnDownloadWav');
  const btnSendToDecoder = document.getElementById('btnSendToDecoder');
  const crtScanLine = document.getElementById('crtScanLine');
  const imageResolutionBadge = document.getElementById('imageResolutionBadge');

  let currentSourceImage = null;
  let currentWavBlob = null;

  // Render image at its native full original resolution
  function renderCanvas() {
    if (!currentSourceImage) return;

    const natW = currentSourceImage.naturalWidth || currentSourceImage.width || 1080;
    const natH = currentSourceImage.naturalHeight || currentSourceImage.height || 1080;

    originalSpecs = {
      width: natW,
      height: natH,
      aspect: natW / natH,
      hasReference: true,
    };

    // Canvas internal size matches original image size (1:1 native resolution)
    encodePreviewCanvas.width = natW;
    encodePreviewCanvas.height = natH;

    // Draw full image without crop or distortion
    previewCtx.drawImage(currentSourceImage, 0, 0, natW, natH);

    // Update original resolution badge
    imageResolutionBadge.textContent = `${natW} \u00d7 ${natH} px`;

    // Render overlay text adapted to original resolution
    const text = watermarkText.value.trim();
    if (text) {
      const barHeight = Math.max(28, Math.round(natH * 0.065));
      previewCtx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      previewCtx.fillRect(0, natH - barHeight, natW, barHeight);

      const fontSize = Math.max(13, Math.round(natW * 0.038));
      previewCtx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace`;
      previewCtx.fillStyle = '#f5f5f7';
      previewCtx.textAlign = 'center';
      previewCtx.textBaseline = 'middle';
      previewCtx.fillText(text, natW / 2, natH - barHeight / 2);
    }
  }

  // Create Robot36 320x240 frame (Aspect Fit with black letterbox) for audio synthesis
  function createRobot36Frame() {
    const offscreen = document.createElement('canvas');
    offscreen.width = WIDTH;
    offscreen.height = HEIGHT;
    const ctx = offscreen.getContext('2d');

    // Fill background with clean black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    if (currentSourceImage) {
      const srcW = originalSpecs.width;
      const srcH = originalSpecs.height;
      const targetAspect = WIDTH / HEIGHT; // 4:3
      const srcAspect = originalSpecs.aspect;

      let drawW, drawH, dx, dy;
      if (srcAspect > targetAspect) {
        // Wider than 4:3 -> fit to width, pillarbox top/bottom
        drawW = WIDTH;
        drawH = Math.round(WIDTH / srcAspect);
        dx = 0;
        dy = Math.round((HEIGHT - drawH) / 2);
      } else {
        // Taller than 4:3 -> fit to height, letterbox left/right
        drawH = HEIGHT;
        drawW = Math.round(HEIGHT * srcAspect);
        dx = Math.round((WIDTH - drawW) / 2);
        dy = 0;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(currentSourceImage, 0, 0, srcW, srcH, dx, dy, drawW, drawH);
    }

    // Overlay text on the Robot36 frame
    const text = watermarkText.value.trim();
    if (text) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(0, HEIGHT - 26, WIDTH, 26);

      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace';
      ctx.fillStyle = '#f5f5f7';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, WIDTH / 2, HEIGHT - 13);
    }

    return ctx.getImageData(0, 0, WIDTH, HEIGHT);
  }

  // Load default user sample image
  const defaultImg = new Image();
  defaultImg.onload = () => {
    currentSourceImage = defaultImg;
    renderCanvas();
  };
  defaultImg.src = 'sample.jpg';

  btnChooseImage.addEventListener('click', () => encodeFileInput.click());

  encodeFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      loadNewImageFile(e.target.files[0]);
    }
  });

  // Drag & drop image onto the preview viewport
  const previewStage = document.getElementById('previewStage');
  previewStage.addEventListener('dragover', (e) => {
    e.preventDefault();
    previewStage.style.borderColor = 'var(--apple-blue)';
  });
  previewStage.addEventListener('dragleave', () => {
    previewStage.style.borderColor = 'var(--border-line)';
  });
  previewStage.addEventListener('drop', (e) => {
    e.preventDefault();
    previewStage.style.borderColor = 'var(--border-line)';
    if (e.dataTransfer.files.length > 0) {
      loadNewImageFile(e.dataTransfer.files[0]);
    }
  });

  function loadNewImageFile(file) {
    const img = new Image();
    img.onload = () => {
      currentSourceImage = img;
      renderCanvas();
    };
    img.src = URL.createObjectURL(file);
  }

  watermarkText.addEventListener('input', renderCanvas);

  btnStartEncode.addEventListener('click', () => {
    btnStartEncode.disabled = true;
    btnStartEncode.textContent = 'Synthesizing (0%)...';

    const frameData = createRobot36Frame();
    worker.postMessage({
      type: 'ENCODE',
      payload: {
        width: WIDTH,
        height: HEIGHT,
        data: frameData.data,
      },
    });
  });

  // ==========================================
  // RIGHT: DECODER CONTROLS
  // ==========================================
  const decodeDropzone = document.getElementById('decodeDropzone');
  const decodeFileInput = document.getElementById('decodeFileInput');
  const decodeProgressBox = document.getElementById('decodeProgressBox');
  const decodeProgressMsg = document.getElementById('decodeProgressMsg');
  const decodeProgressPercent = document.getElementById('decodeProgressPercent');
  const decodeProgressBar = document.getElementById('decodeProgressBar');
  const galleryList = document.getElementById('galleryList');

  decodeDropzone.addEventListener('click', () => decodeFileInput.click());

  decodeDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    decodeDropzone.classList.add('dragover');
  });

  decodeDropzone.addEventListener('dragleave', () => {
    decodeDropzone.classList.remove('dragover');
  });

  decodeDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    decodeDropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      processAudioFile(e.dataTransfer.files[0]);
    }
  });

  decodeFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      processAudioFile(e.target.files[0]);
    }
  });

  let audioCtx = null;

  async function processAudioFile(file) {
    decodeProgressBox.style.display = 'block';
    decodeProgressMsg.textContent = `Reading audio (${(file.size / 1024 / 1024).toFixed(1)} MB)...`;
    decodeProgressBar.style.width = '15%';
    decodeProgressPercent.textContent = '15%';

    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }

      const arrayBuffer = await file.arrayBuffer();
      decodeProgressMsg.textContent = 'Decoding PCM samples...';
      decodeProgressBar.style.width = '30%';
      decodeProgressPercent.textContent = '30%';

      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const samples = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;

      decodeProgressMsg.textContent = `Scanning ${audioBuffer.duration.toFixed(1)}s audio...`;
      decodeProgressBar.style.width = '45%';
      decodeProgressPercent.textContent = '45%';

      worker.postMessage({
        type: 'DECODE',
        payload: { samples, sampleRate },
      });
    } catch (err) {
      decodeProgressMsg.textContent = `Audio decode error: ${err.message || err}`;
      decodeProgressBar.style.backgroundColor = '#ff453a';
    }
  }

  // Link button: send left synthesized audio directly into right decoder
  btnSendToDecoder.addEventListener('click', () => {
    if (!currentWavBlob) return;
    const file = new File([currentWavBlob], 'synthesized_robot36.wav', { type: 'audio/wav' });
    processAudioFile(file);
  });

  // Reconstruct 320x240 frame back to original image size & aspect ratio
  function reconstructToOriginalSize(rawCanvas, targetW, targetH, targetAspect) {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = targetW;
    outCanvas.height = targetH;
    const outCtx = outCanvas.getContext('2d');

    const sstvAspect = WIDTH / HEIGHT; // 4:3

    let sx, sy, sW, sH;
    if (targetAspect > sstvAspect) {
      // Source was wider than 4:3 -> during encoding it was fitted to width
      sW = WIDTH;
      sH = Math.round(WIDTH / targetAspect);
      sx = 0;
      sy = Math.round((HEIGHT - sH) / 2);
    } else {
      // Source was taller than 4:3 -> during encoding it was fitted to height (e.g. 1:1)
      sH = HEIGHT;
      sW = Math.round(HEIGHT * targetAspect);
      sx = Math.round((WIDTH - sW) / 2);
      sy = 0;
    }

    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(rawCanvas, sx, sy, sW, sH, 0, 0, targetW, targetH);
    return outCanvas;
  }

  // Render decoded frames at full original image size
  function renderDecodedResults(matches) {
    galleryList.innerHTML = '';

    if (matches.length === 0) {
      galleryList.innerHTML = `
        <div class="gallery-empty">
          No valid Robot36 image sequence found. Signal might be too weak or another mode.
        </div>
      `;
      return;
    }

    // Determine target output size based on original image
    const targetW = originalSpecs.width || 1080;
    const targetH = originalSpecs.height || 1080;
    const targetAspect = originalSpecs.aspect || 1.0;

    matches.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'gallery-card';

      const min = Math.floor(item.timestamp / 60);
      const sec = (item.timestamp % 60).toFixed(1).padStart(4, '0');
      const timeStr = `${min}:${sec}`;

      card.innerHTML = `
        <div class="gallery-card-top">
          <div>
            <strong>Decoded Frame #${index + 1}</strong>
            <span style="color: var(--text-dim); margin-left: 0.5rem;">t = ${timeStr}</span>
          </div>
          <span class="sync-pill">Sync ${item.score}/240</span>
        </div>
        <div class="gallery-canvas-wrap">
          <canvas id="displayCanvas_${index}"></canvas>
          <div class="resolution-badge" id="badge_${index}">${targetW} &times; ${targetH} px</div>
        </div>
        <div class="gallery-card-bottom">
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <div class="pill-switch">
              <button class="pill-btn active" data-color="rgb">RGB</button>
              <button class="pill-btn" data-color="gray">Luminance</button>
            </div>
            <div class="pill-switch">
              <button class="pill-btn active" data-size="original">Original (${targetW}&times;${targetH})</button>
              <button class="pill-btn" data-size="raw">Raw (320&times;240)</button>
            </div>
          </div>
          <button class="apple-btn apple-btn-secondary btn-save" style="padding: 0.4rem 0.95rem; font-size: 0.82rem;">
            Save PNG
          </button>
        </div>
      `;

      // 1. Prepare raw 320x240 offscreen canvases for RGB and Gray
      const rawRgbCanvas = document.createElement('canvas');
      rawRgbCanvas.width = WIDTH;
      rawRgbCanvas.height = HEIGHT;
      rawRgbCanvas.getContext('2d').putImageData(
        new ImageData(new Uint8ClampedArray(item.rgbData), WIDTH, HEIGHT),
        0,
        0
      );

      const rawGrayCanvas = document.createElement('canvas');
      rawGrayCanvas.width = WIDTH;
      rawGrayCanvas.height = HEIGHT;
      rawGrayCanvas.getContext('2d').putImageData(
        new ImageData(new Uint8ClampedArray(item.grayData), WIDTH, HEIGHT),
        0,
        0
      );

      // 2. Prepare restored original-size canvases for RGB and Gray
      const origRgbCanvas = reconstructToOriginalSize(rawRgbCanvas, targetW, targetH, targetAspect);
      const origGrayCanvas = reconstructToOriginalSize(rawGrayCanvas, targetW, targetH, targetAspect);

      const displayCanvas = card.querySelector(`#displayCanvas_${index}`);
      const dispCtx = displayCanvas.getContext('2d');
      const badge = card.querySelector(`#badge_${index}`);

      let currentColor = 'rgb';
      let currentSize = 'original';

      function updateDisplay() {
        const isOrig = currentSize === 'original';
        const sourceCanvas = currentColor === 'rgb' 
          ? (isOrig ? origRgbCanvas : rawRgbCanvas)
          : (isOrig ? origGrayCanvas : rawGrayCanvas);

        displayCanvas.width = sourceCanvas.width;
        displayCanvas.height = sourceCanvas.height;
        dispCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
        dispCtx.drawImage(sourceCanvas, 0, 0);

        // Raw mode uses pixelated rendering to showcase authentic SSTV scanline pixels
        displayCanvas.style.imageRendering = isOrig ? 'auto' : 'pixelated';

        badge.textContent = `${displayCanvas.width} \u00d7 ${displayCanvas.height} px`;
      }

      // Default: show restored Original Size (e.g. 1080x1080)
      updateDisplay();

      // Handle Color switch (RGB / Gray)
      const colorBtns = card.querySelectorAll('[data-color]');
      colorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          colorBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentColor = btn.dataset.color;
          updateDisplay();
        });
      });

      // Handle Size switch (Original / Raw)
      const sizeBtns = card.querySelectorAll('[data-size]');
      sizeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          sizeBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentSize = btn.dataset.size;
          updateDisplay();
        });
      });

      // Handle Download button (saves at currently selected size: full original resolution by default)
      card.querySelector('.btn-save').addEventListener('click', () => {
        const a = document.createElement('a');
        const sizeTag = currentSize === 'original' ? `${targetW}x${targetH}` : '320x240';
        a.download = `sstv_decoded_${index + 1}_${sizeTag}_${min}m${Math.round(sec)}s.png`;
        a.href = displayCanvas.toDataURL('image/png');
        a.click();
      });

      galleryList.appendChild(card);
    });
  }

  // ==========================================
  // WORKER MESSAGE HANDLING
  // ==========================================
  worker.onmessage = (e) => {
    const { type, payload } = e.data;

    if (type === 'DECODE_PROGRESS') {
      const p = Math.round(payload.progress * 100);
      decodeProgressBar.style.width = `${p}%`;
      decodeProgressPercent.textContent = `${p}%`;
      decodeProgressMsg.textContent = payload.message;
    } else if (type === 'DECODE_COMPLETE') {
      decodeProgressBar.style.width = '100%';
      decodeProgressPercent.textContent = '100%';
      decodeProgressMsg.textContent = `Completed. ${payload.length} frame(s) extracted.`;
      renderDecodedResults(payload);
    } else if (type === 'ENCODE_PROGRESS') {
      const p = Math.round(payload.progress * 100);
      btnStartEncode.textContent = `Synthesizing (${p}%)...`;
    } else if (type === 'ENCODE_COMPLETE') {
      btnStartEncode.disabled = false;
      btnStartEncode.textContent = 'Synthesize Audio';

      currentWavBlob = new Blob([payload.wavBuffer], { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(currentWavBlob);
      audioPlayer.src = audioUrl;
      encodeResultBox.style.display = 'block';

      // Smooth CRT Scanline Animation
      const headerSec = 0.92;
      const linesSec = 36.0;

      audioPlayer.ontimeupdate = () => {
        const t = audioPlayer.currentTime;
        if (t > headerSec && t < headerSec + linesSec) {
          crtScanLine.style.display = 'block';
          const progressY = (t - headerSec) / linesSec;
          crtScanLine.style.top = `${progressY * 100}%`;
        } else {
          crtScanLine.style.display = 'none';
        }
      };

      audioPlayer.onended = () => {
        crtScanLine.style.display = 'none';
      };
    } else if (type === 'ERROR') {
      alert(`Worker error: ${payload}`);
      btnStartEncode.disabled = false;
      btnStartEncode.textContent = 'Synthesize Audio';
    }
  };

  btnDownloadWav.addEventListener('click', () => {
    if (!currentWavBlob) return;
    const a = document.createElement('a');
    a.download = `sstv_robot36_${Date.now()}.wav`;
    a.href = URL.createObjectURL(currentWavBlob);
    a.click();
  });
});
