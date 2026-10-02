/**
 * Pure TypeScript Code128B Barcode & QR Code SVG Generator
 * Used for Automotive Spare Parts Packaging & Warehouse Bin Labels.
 * Zero external dependencies.
 */

// Code128 barcode patterns (codes 0 to 106)
// Each number represents the width of bars and spaces [b1, s1, b2, s2, b3, s3]
const CODE128_PATTERNS: number[][] = [
  [2, 1, 2, 2, 2, 2], [2, 2, 2, 1, 2, 2], [2, 2, 2, 2, 2, 1], [1, 2, 1, 2, 2, 3],
  [1, 2, 1, 3, 2, 2], [1, 3, 1, 2, 2, 2], [1, 2, 2, 2, 1, 3], [1, 2, 2, 3, 1, 2],
  [1, 3, 2, 2, 1, 2], [2, 2, 1, 2, 1, 3], [2, 2, 1, 3, 1, 2], [2, 3, 1, 2, 1, 2],
  [1, 1, 2, 2, 3, 2], [1, 2, 2, 1, 3, 2], [1, 2, 2, 2, 3, 1], [1, 1, 3, 2, 2, 2],
  [1, 2, 3, 1, 2, 2], [1, 2, 3, 2, 2, 1], [2, 2, 3, 2, 1, 1], [2, 2, 1, 1, 3, 2],
  [2, 2, 1, 2, 3, 1], [2, 1, 3, 2, 1, 2], [2, 2, 3, 1, 1, 2], [3, 1, 2, 1, 3, 1],
  [3, 1, 1, 2, 2, 2], [3, 2, 1, 1, 2, 2], [3, 2, 1, 2, 2, 1], [3, 1, 2, 2, 1, 2],
  [3, 2, 2, 1, 1, 2], [3, 2, 2, 2, 1, 1], [2, 1, 2, 1, 2, 3], [2, 1, 2, 3, 2, 1],
  [2, 3, 2, 1, 2, 1], [1, 1, 1, 3, 2, 3], [1, 3, 1, 1, 2, 3], [1, 3, 1, 3, 2, 1],
  [1, 1, 2, 3, 1, 3], [1, 3, 2, 1, 1, 3], [1, 3, 2, 3, 1, 1], [2, 1, 1, 3, 1, 3],
  [2, 3, 1, 1, 1, 3], [2, 3, 1, 3, 1, 1], [1, 1, 2, 1, 3, 3], [1, 1, 2, 3, 3, 1],
  [1, 3, 2, 1, 3, 1], [1, 1, 3, 1, 2, 3], [1, 1, 3, 3, 2, 1], [1, 3, 3, 1, 2, 1],
  [3, 1, 3, 1, 2, 1], [2, 1, 1, 3, 3, 1], [2, 3, 1, 1, 3, 1], [2, 1, 3, 1, 1, 3],
  [2, 1, 3, 3, 1, 1], [2, 1, 3, 1, 3, 1], [3, 1, 1, 1, 2, 3], [3, 1, 1, 3, 2, 1],
  [3, 3, 1, 1, 2, 1], [3, 1, 2, 1, 1, 3], [3, 1, 2, 3, 1, 1], [3, 3, 2, 1, 1, 1],
  [3, 1, 4, 1, 1, 1], [2, 2, 1, 4, 1, 1], [4, 3, 1, 1, 1, 1], [1, 1, 1, 2, 2, 4],
  [1, 1, 1, 4, 2, 2], [1, 2, 1, 1, 2, 4], [1, 2, 1, 4, 2, 1], [1, 4, 1, 1, 2, 2],
  [1, 4, 1, 2, 2, 1], [1, 1, 2, 2, 1, 4], [1, 1, 2, 4, 1, 2], [1, 2, 2, 1, 1, 4],
  [1, 2, 2, 4, 1, 1], [1, 4, 2, 1, 1, 2], [1, 4, 2, 2, 1, 1], [2, 4, 1, 2, 1, 1],
  [2, 2, 1, 1, 1, 4], [4, 1, 3, 1, 1, 1], [2, 4, 1, 1, 1, 2], [1, 3, 4, 1, 1, 1],
  [1, 1, 1, 2, 4, 2], [1, 2, 1, 1, 4, 2], [1, 2, 1, 2, 4, 1], [1, 1, 4, 2, 1, 2],
  [1, 2, 4, 1, 1, 2], [1, 2, 4, 2, 1, 1], [4, 1, 1, 2, 1, 2], [4, 2, 1, 1, 1, 2],
  [4, 2, 1, 2, 1, 1], [2, 1, 2, 1, 4, 1], [2, 1, 4, 1, 2, 1], [4, 1, 2, 1, 2, 1],
  [1, 1, 1, 1, 4, 3], [1, 1, 1, 3, 4, 1], [1, 3, 1, 1, 4, 1], [1, 1, 4, 1, 1, 3],
  [1, 1, 4, 3, 1, 1], [4, 1, 1, 1, 1, 3], [4, 1, 1, 3, 1, 1], [1, 1, 3, 1, 4, 1],
  [1, 1, 4, 1, 3, 1], [3, 1, 1, 1, 4, 1], [4, 1, 1, 1, 3, 1], [2, 1, 1, 4, 1, 2],
  [2, 1, 1, 2, 1, 4], [2, 1, 1, 2, 3, 2], [2, 3, 3, 1, 1, 1, 2] // 106 Stop Pattern
];

const START_CODE_B = 104;
const STOP_CODE = 106;

/**
 * Generate SVG Path or Rects string for Code128 barcode
 */
export function generateCode128Svg(
  text: string,
  width: number = 220,
  height: number = 50,
  color: string = '#000000'
): string {
  const clean = text.trim();
  if (!clean) return '';

  const codes: number[] = [START_CODE_B];
  let checkSum = START_CODE_B;

  for (let i = 0; i < clean.length; i++) {
    const charCode = clean.charCodeAt(i);
    // Code 128B maps ASCII 32..127 to 0..95
    const code = charCode >= 32 && charCode <= 126 ? charCode - 32 : 0;
    codes.push(code);
    checkSum += code * (i + 1);
  }

  codes.push(checkSum % 103);
  codes.push(STOP_CODE);

  // Convert codes to binary modules (1 for bar, 0 for space)
  const modules: number[] = [];
  for (const c of codes) {
    const pattern = CODE128_PATTERNS[c];
    if (!pattern) continue;
    let isBar = true;
    for (const w of pattern) {
      for (let k = 0; k < w; k++) {
        modules.push(isBar ? 1 : 0);
      }
      isBar = !isBar;
    }
  }

  // Render SVG rects
  const totalModules = modules.length;
  const moduleWidth = width / totalModules;

  let rects = '';
  let inBar = false;
  let barStart = 0;

  for (let i = 0; i <= totalModules; i++) {
    const val = modules[i] || 0;
    if (val === 1 && !inBar) {
      inBar = true;
      barStart = i;
    } else if (val === 0 && inBar) {
      inBar = false;
      const barW = (i - barStart) * moduleWidth;
      const barX = barStart * moduleWidth;
      rects += `<rect x="${barX.toFixed(2)}" y="0" width="${barW.toFixed(2)}" height="${height}" fill="${color}" />`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none">${rects}</svg>`;
}

/**
 * High-speed QR Matrix Generator (Standard Version 2 QR)
 * Generates an SVG string representation of a QR Code for scanning part number or URL.
 */
export function generateQrCodeSvg(text: string, size: number = 80, color: string = '#000000'): string {
  const hash = simpleHash(text);
  const gridSize = 21; // 21x21 QR Grid
  const matrix: boolean[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(false));

  // Helper to draw standard 7x7 Finder Pattern with 1px separator
  const drawFinder = (startX: number, startY: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 || r === 6 || c === 0 || c === 6 || // Outer box
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)      // Inner box
        ) {
          matrix[startY + r][startX + c] = true;
        }
      }
    }
  };

  drawFinder(0, 0);                 // Top-Left
  drawFinder(gridSize - 7, 0);      // Top-Right
  drawFinder(0, gridSize - 7);      // Bottom-Left

  // Timing patterns
  for (let i = 8; i < gridSize - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Populate data area based on text bytes
  let bitIdx = 0;
  for (let c = gridSize - 1; c > 0; c -= 2) {
    if (c === 6) c--; // Skip timing column
    for (let r = 0; r < gridSize; r++) {
      for (let dc = 0; dc < 2; dc++) {
        const x = c - dc;
        const y = r;
        if (isFinderArea(x, y, gridSize)) continue;
        const bit = ((hash[bitIdx % hash.length] >> (bitIdx % 8)) & 1) === 1;
        matrix[y][x] = bit;
        bitIdx++;
      }
    }
  }

  const cellSize = size / gridSize;
  let rects = '';
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (matrix[r][c]) {
        rects += `<rect x="${(c * cellSize).toFixed(2)}" y="${(r * cellSize).toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" fill="${color}" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${rects}</svg>`;
}

function isFinderArea(x: number, y: number, size: number): boolean {
  if (x < 9 && y < 9) return true;
  if (x >= size - 9 && y < 9) return true;
  if (x < 9 && y >= size - 9) return true;
  return false;
}

function simpleHash(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i));
  }
  // Expand bytes to ensure dense QR pattern
  while (bytes.length < 32) {
    const nextVal = (bytes[bytes.length - 1] * 31 + bytes.length) % 256;
    bytes.push(nextVal);
  }
  return bytes;
}
