// prepareDisc.js — realistic vinyl disc with label / full-texture modes
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs/promises';
import path from 'path';

export async function prepareDisc(coverPath, opts) {
  const {
    size,
    style,                          // 'circle' | 'texture'
    vinylColor = '#0e0e0e',
    center = 'hole',                // 'hole' | 'spindle'
    circleLabelRatio = 0.34,
    circleRimRatio = 0.055,
    holeRatio = 0.012,
    spindleRatio = 0.045,
    outputPath,
    shadowEnabled = true,
    shadowColor = '#000000',
    shadowIntensity = 0.65,
    grooveIntensity = 1.0,   // 0 = almost none, 1 = default, 1.5 = heavy
    scratches = false,
    scratchAmount = 0.5,
  } = opts;

  if (!coverPath) throw new Error('coverPath is required');
  if (!outputPath) throw new Error('outputPath is required');

  const coverAbs = path.resolve(coverPath);
  const outAbs = path.resolve(outputPath);

  await fs.access(coverAbs).catch(() => {
    throw new Error(`Cover not found: ${coverAbs}`);
  });
  await fs.mkdir(path.dirname(outAbs), { recursive: true });

  const cx = size / 2;
  const cy = size / 2;
  // Leave margin so contour shadow is not clipped by the square canvas
  const pad = Math.max(12, Math.round(size * 0.045));
  const r = cx - pad; // actual disc radius

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const cover = await loadImage(coverAbs);

  // Soft circular contour shadow (drawn first, room in the padding)
  if (shadowEnabled && shadowIntensity > 0) {
    const a = Math.max(0, Math.min(1, shadowIntensity));
    const hex = String(shadowColor).replace('#', '');
    const sr = parseInt(hex.slice(0, 2), 16) || 0;
    const sg = parseInt(hex.slice(2, 4), 16) || 0;
    const sb = parseInt(hex.slice(4, 6), 16) || 0;
    ctx.save();
    ctx.shadowColor = `rgba(${sr},${sg},${sb},${a * 0.8})`;
    ctx.shadowBlur = Math.min(pad * 1.6, 8 + a * 18);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.min(pad * 0.35, 2 + a * 3);
    ctx.fillStyle = `rgba(${sr},${sg},${sb},${0.2 * a})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (style === 'circle') {
    ctx.fillStyle = vinylColor;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    const labelR = r * circleLabelRatio;
    const rimR = labelR + r * circleRimRatio;

    const g = Math.max(0, Math.min(2, grooveIntensity));
    drawTrackZone(ctx, cx, r * 0.985, r * 0.94, vinylColor, 1.0 * g);
    drawTrackZone(ctx, cx, r * 0.94, rimR * 1.15, vinylColor, 0.95 * g);
    drawDeadZone(ctx, cx, rimR * 1.15, rimR, vinylColor, 1.0 * g);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rimR, 0, Math.PI * 2);
    ctx.arc(cx, cy, labelR, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fillStyle = deepShade(vinylColor, 0.38);
    ctx.fill();
    ctx.restore();

    drawRimLines(ctx, cx, rimR, labelR, vinylColor, 1.4 * g);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, labelR, 0, Math.PI * 2);
    ctx.clip();
    drawCoverCover(ctx, cover, cx - labelR, cy - labelR, labelR * 2, labelR * 2);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, labelR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(1, r * 0.0035);
    ctx.stroke();

  } else {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    drawCoverCover(ctx, cover, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();

    const g = Math.max(0, Math.min(2, grooveIntensity));
    drawTrackZone(ctx, cx, r * 0.985, r * 0.93, vinylColor, 0.55 * g);
    drawTrackZone(ctx, cx, r * 0.93, r * 0.38, vinylColor, 0.45 * g);
    drawDeadZone(ctx, cx, r * 0.38, r * 0.14, vinylColor, 0.6 * g);

    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.14, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = Math.max(1, r * 0.003);
    ctx.stroke();

    drawRimLines(ctx, cx, r * 0.14, r * 0.09, vinylColor, 0.08 * g);
    drawRadialHighlights(ctx, cx, r);
    tintOverlay(ctx, cx, r, vinylColor, 0.12);
  }

  drawGlobalHighlight(ctx, cx, r);

  if (scratches) {
    drawScratches(ctx, cx, cy, r, Math.max(0, Math.min(1, scratchAmount)));
  }

  if (center === 'hole') {
    drawHole(ctx, cx, cy, r * holeRatio);
  } else {
    drawSpindle(ctx, cx, cy, r * spindleRatio);
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const buffer = canvas.toBuffer('image/png');
  await fs.writeFile(outAbs, buffer);
  return outAbs;
}

// --- Zone drawers (cx = center) ---

function drawTrackZone(ctx, cx, outerR, innerR, baseColor, alphaMultiplier = 1.0) {
  ctx.save();
  let rad = innerR;
  while (rad < outerR) {
    const step = 1.8 + Math.random() * 2.8;
    rad += step;
    if (rad >= outerR) break;

    const rand = Math.random();
    const isBright = rand > 0.62;
    const isThick = rand > 0.88;
    const alpha = (0.04 + Math.random() * 0.13) * alphaMultiplier;

    ctx.beginPath();
    ctx.arc(cx, cx, rad, 0, Math.PI * 2);
    ctx.strokeStyle = isBright
      ? `rgba(255,255,255,${alpha})`
      : `rgba(0,0,0,${alpha * 1.6})`;
    ctx.lineWidth = isThick ? Math.max(1, outerR * 0.0035) : Math.max(0.4, outerR * 0.0009);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDeadZone(ctx, cx, outerR, innerR, baseColor, alphaMultiplier = 1.0) {
  ctx.save();
  const step = Math.max(1.8, outerR * 0.007);
  for (let rad = innerR; rad < outerR; rad += step) {
    ctx.beginPath();
    ctx.arc(cx, cx, rad, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.07 * alphaMultiplier})`;
    ctx.lineWidth = Math.max(0.8, outerR * 0.0018);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cx, rad + step * 0.45, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0,0,0,${0.18 * alphaMultiplier})`;
    ctx.lineWidth = Math.max(0.7, outerR * 0.0013);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRimLines(ctx, cx, outerR, innerR, baseColor, alphaMultiplier = 1.0) {
  ctx.save();
  const step = Math.max(0.9, (outerR - innerR) / 22);
  for (let rad = innerR + step; rad < outerR; rad += step) {
    ctx.beginPath();
    ctx.arc(cx, cx, rad, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.11 * alphaMultiplier})`;
    ctx.lineWidth = Math.max(0.7, outerR * 0.0018);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cx, rad + step * 0.38, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0,0,0,${0.32 * alphaMultiplier})`;
    ctx.lineWidth = Math.max(0.7, outerR * 0.0013);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRadialHighlights(ctx, cx, r) {
  ctx.save();
  const angles = [
    { start: Math.PI * 0.08, end: Math.PI * 0.22, opacity: 0.13 },
    { start: Math.PI * 0.58, end: Math.PI * 0.72, opacity: 0.09 },
    { start: Math.PI * 1.28, end: Math.PI * 1.42, opacity: 0.07 },
  ];

  angles.forEach(({ start, end, opacity }) => {
    const grad = ctx.createRadialGradient(cx, cx, r * 0.28, cx, cx, r);
    grad.addColorStop(0, `rgba(255,255,255,${opacity})`);
    grad.addColorStop(0.55, `rgba(255,255,255,${opacity * 0.4})`);
    grad.addColorStop(1, `rgba(255,255,255,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, cx);
    ctx.arc(cx, cx, r, start, end);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
}

function drawGlobalHighlight(ctx, cx, r) {
  ctx.save();
  const grad = ctx.createLinearGradient(cx * 0.18, cx * 0.18, cx * 1.75, cx * 1.75);
  grad.addColorStop(0, 'rgba(255,255,255,0.09)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.025)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function tintOverlay(ctx, cx, r, color, alpha) {
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCoverCover(ctx, img, x, y, W, H) {
  const scale = Math.max(W / img.width, H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, x + (W - w) / 2, y + (H - h) / 2, w, h);
}

function drawHole(ctx, cx, cy, holeR) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, holeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, holeR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = Math.max(1, holeR * 0.18);
  ctx.stroke();
  ctx.restore();
}

function drawSpindle(ctx, cx, cy, spindleR) {
  ctx.save();
  const shadow = ctx.createRadialGradient(
    cx, cy + spindleR * 0.35, spindleR * 0.2,
    cx, cy + spindleR * 0.35, spindleR * 2.1
  );
  shadow.addColorStop(0, 'rgba(0,0,0,0.38)');
  shadow.addColorStop(0.55, 'rgba(0,0,0,0.12)');
  shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.arc(cx, cy + spindleR * 0.35, spindleR * 2.1, 0, Math.PI * 2);
  ctx.fill();

  const metal = ctx.createLinearGradient(
    cx - spindleR, cy - spindleR,
    cx + spindleR, cy + spindleR
  );
  metal.addColorStop(0, '#5a5a5a');
  metal.addColorStop(0.32, '#d0d0d0');
  metal.addColorStop(0.55, '#9a9a9a');
  metal.addColorStop(1, '#3a3a3a');
  ctx.beginPath();
  ctx.arc(cx, cy, spindleR, 0, Math.PI * 2);
  ctx.fillStyle = metal;
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = Math.max(1, spindleR * 0.08);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx - spindleR * 0.28, cy - spindleR * 0.28, spindleR * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.fill();
  ctx.restore();
}


function drawScratches(ctx, cx, cy, r, amount) {
  const count = Math.round(4 + amount * 18);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const a0 = Math.random() * Math.PI * 2;
    const span = (0.08 + Math.random() * 0.55) * Math.PI; // arc length
    const rr = r * (0.2 + Math.random() * 0.75);
    const wide = Math.random() > 0.85;
    const alpha = (0.08 + Math.random() * 0.22) * (0.5 + amount * 0.5);

    ctx.beginPath();
    ctx.arc(cx, cy, rr, a0, a0 + span);
    ctx.strokeStyle = Math.random() > 0.5
      ? `rgba(255,255,255,${alpha})`
      : `rgba(0,0,0,${alpha * 1.3})`;
    ctx.lineWidth = wide ? Math.max(1.2, r * 0.004) : Math.max(0.5, r * 0.0015);
    ctx.stroke();

    // occasional radial hairline scratch
    if (Math.random() < 0.25 * amount) {
      const ang = Math.random() * Math.PI * 2;
      const r1 = r * (0.15 + Math.random() * 0.2);
      const r2 = r * (0.7 + Math.random() * 0.28);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
      ctx.strokeStyle = `rgba(255,255,255,${0.06 + Math.random() * 0.12})`;
      ctx.lineWidth = Math.max(0.4, r * 0.001);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function deepShade(hex, amount) {
  const h = hex.replace('#', '');
  const num = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;

  const hsl = rgbToHsl(r, g, b);
  hsl.l = Math.max(0, hsl.l - amount);
  hsl.s = Math.min(1, hsl.s + amount * 0.45);
  const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  return `rgb(${rgb.r},${rgb.g},${rgb.b})`;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}
