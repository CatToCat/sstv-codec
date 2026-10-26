/**
 * SSTV Robot36 Protocol Constants and Parameters
 */

export const RATE = 24000;       // Internal processing sample rate (Hz)
export const WIDTH = 320;        // Image width in pixels
export const HEIGHT = 240;       // Image height in pixels

// Line Timing (seconds)
export const LINE_TIME = 0.150;      // 150 ms total line duration
export const SYNC_TIME = 0.009;      // 9 ms line sync pulse
export const PORCH_TIME = 0.003;     // 3 ms sync porch
export const Y_TIME = 0.088;         // 88 ms luminance scan
export const SEP_TIME = 0.0045;      // 4.5 ms chroma separator pulse
export const SEP_PORCH_TIME = 0.0015;// 1.5 ms chroma porch
export const CHROMA_TIME = 0.044;    // 44 ms chroma scan

// Tone Frequencies (Hz)
export const FREQ_SYNC = 1200;       // Line sync tone
export const FREQ_PORCH = 1500;      // Sync porch tone
export const FREQ_BLACK = 1500;      // Video black (0)
export const FREQ_WHITE = 2300;      // Video white (255)
export const FREQ_RANGE = 800;       // Frequency sweep range (2300 - 1500)

// Chroma Separator Tones
export const FREQ_SEP_EVEN = 1500;   // Even line separator (R-Y / Cr)
export const FREQ_SEP_ODD = 2300;    // Odd line separator (B-Y / Cb)
export const FREQ_SEP_PORCH = 1900;  // 1900 Hz chroma porch

// VIS Calibration Header
export const FREQ_LEADER = 1900;
export const FREQ_VIS_BIT0 = 1300;   // Binary 0
export const FREQ_VIS_BIT1 = 1100;   // Binary 1
export const ROBOT36_VIS_CODE = 0x08;// Robot36 mode code (7 bits: 0001000)
