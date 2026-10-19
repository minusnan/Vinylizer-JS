// sleeve.js — vinyl sleeve / slipcase
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs/promises';
import path from 'path';

export async function createSleeve(coverPath, opts) {
  const {
    size = 1080,
    sleeveSize = 780,
    outputPath,
    shadowEnabled = true,
    shadowColor = '#000000',
    shadowIntensity = 0.65,
  } = opts;

  if (!outputPath) throw new Error('outputPath is required');

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const cover = await loadImage(path.resolve(coverPath));

  const x = (size - sleeveSize) / 2;
  const y = (size - sleeveSize) / 2;

  // Soft outer contour shadow only (no hard border)
  if (shadowEnabled && shadowIntensity > 0) {
    const a = Math.max(0, Math.min(1, shadowIntensity));
    const hex = shadowColor.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    ctx.save();
    ctx.shadowColor = `rgba(${r},${g},${b},${a * 0.85})`;
    ctx.shadowBlur = 8 + a * 18;   // tight around the edge
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2 + a * 4; // slight lift, not a long cast
    ctx.fillStyle = '#111';
    ctx.fillRect(x, y, sleeveSize, sleeveSize);
    ctx.restore();
  }

  // Cover art fills the whole face — no inner frame / stroke
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, sleeveSize, sleeveSize);
  ctx.clip();
  drawCoverCover(ctx, cover, x, y, sleeveSize, sleeveSize);
  ctx.restore();

  // Soft top highlight only (no outline)
  const hl = ctx.createLinearGradient(x, y, x, y + sleeveSize * 0.08);
  hl.addColorStop(0, 'rgba(255,255,255,0.05)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(x, y, sleeveSize, sleeveSize * 0.08);

  await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await fs.writeFile(outputPath, canvas.toBuffer('image/png'));
  return outputPath;
}

function drawCoverCover(ctx, img, x, y, W, H) {
  const scale = Math.max(W / img.width, H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, x + (W - w) / 2, y + (H - h) / 2, w, h);
}
