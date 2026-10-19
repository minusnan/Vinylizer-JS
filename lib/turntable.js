// turntable.js — panel + tonearm assets
import { createCanvas } from 'canvas';
import fs from 'fs/promises';
import path from 'path';

export async function createTurntable(opts) {
  const {
    size = 1080,
    platterSize = 780,
    outputPanelPath,
    outputTonearmPath,
    shadowEnabled = true,
    shadowColor = '#000000',
    shadowIntensity = 0.65,
  } = opts;

  if (!outputPanelPath || !outputTonearmPath) {
    throw new Error('outputPanelPath and outputTonearmPath are required');
  }

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Compact body — just enough margin for controls, not huge relative to disc
  const bodyPad = 64;
  const bodySize = platterSize + bodyPad * 2;
  const bodyX = (size - bodySize) / 2;
  const bodyY = (size - bodySize) / 2;

  // Tight contour shadow (not a long cast)
  if (shadowEnabled && shadowIntensity > 0) {
    const a = Math.max(0, Math.min(1, shadowIntensity));
    const hex = shadowColor.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    ctx.save();
    ctx.shadowColor = `rgba(${r},${g},${b},${a * 0.85})`;
    ctx.shadowBlur = 10 + a * 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2 + a * 5;
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.roundRect(bodyX, bodyY, bodySize, bodySize, 16);
    ctx.fill();
    ctx.restore();
  }

  // Body fill
  const bodyGrad = ctx.createLinearGradient(bodyX, bodyY, bodyX + bodySize, bodyY + bodySize);
  bodyGrad.addColorStop(0, '#2e2e2e');
  bodyGrad.addColorStop(0.45, '#1c1c1c');
  bodyGrad.addColorStop(1, '#101010');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.roundRect(bodyX, bodyY, bodySize, bodySize, 16);
  ctx.fill();

  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 2;
  ctx.stroke();

  const edgeGrad = ctx.createLinearGradient(bodyX, bodyY, bodyX, bodyY + 40);
  edgeGrad.addColorStop(0, 'rgba(255,255,255,0.1)');
  edgeGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = edgeGrad;
  ctx.beginPath();
  ctx.roundRect(bodyX, bodyY, bodySize, bodySize, 16);
  ctx.fill();

  // --- PLATTER WELL ---
  const platterX = size / 2;
  const platterY = size / 2;
  const wellR = (platterSize / 2) * 0.96;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  const wellGrad = ctx.createRadialGradient(
    platterX, platterY, wellR * 0.1,
    platterX, platterY, wellR
  );
  wellGrad.addColorStop(0, '#2a2a2a');
  wellGrad.addColorStop(0.7, '#141414');
  wellGrad.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = wellGrad;
  ctx.beginPath();
  ctx.arc(platterX, platterY, wellR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(platterX, platterY, wellR, 0, Math.PI * 2);
  ctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 2;
  ctx.stroke();

  const outerRingR = (platterSize / 2) + 4;
  ctx.beginPath();
  ctx.arc(platterX, platterY, outerRingR, 0, Math.PI * 2);
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // --- SPINDLE ---
  const spindleR = size * 0.0055;
  ctx.save();
  const spindleGrad = ctx.createLinearGradient(
    platterX - spindleR, platterY - spindleR,
    platterX + spindleR, platterY + spindleR
  );
  spindleGrad.addColorStop(0, '#777');
  spindleGrad.addColorStop(0.35, '#fff');
  spindleGrad.addColorStop(0.6, '#bbb');
  spindleGrad.addColorStop(1, '#555');
  ctx.fillStyle = spindleGrad;
  ctx.beginPath();
  ctx.arc(platterX, platterY, spindleR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- CONTROLS: centered in bottom-right pad, clearly outside platter ---
  // Pad zone: [bodyX+bodySize-bodyPad, bodyX+bodySize] x [bodyY+bodySize-bodyPad, bodyY+bodySize]
  const padCenterX = bodyX + bodySize - bodyPad / 2;
  const padCenterY = bodyY + bodySize - bodyPad / 2;

  drawKnob(ctx, padCenterX - 14, padCenterY - 4, 12);
  drawKnob(ctx, padCenterX + 12, padCenterY - 4, 10);
  drawLever(ctx, padCenterX - 1, padCenterY + 20);

  ctx.beginPath();
  ctx.arc(padCenterX - 1, padCenterY - 24, 2.8, 0, Math.PI * 2);
  ctx.fillStyle = '#2a2a2a';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(padCenterX - 1, padCenterY - 24, 1.8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(80,220,120,0.85)';
  ctx.fill();

  await fs.mkdir(path.dirname(path.resolve(outputPanelPath)), { recursive: true });
  await fs.writeFile(outputPanelPath, canvas.toBuffer('image/png'));

  // --- TONEARM ---
  const tonearmCanvas = createCanvas(size, size);
  const tctx = tonearmCanvas.getContext('2d');

  const pivotX = bodyX + bodySize - bodyPad / 2;
  const pivotY = bodyY + bodyPad / 2;

  const headX = platterX + (platterSize / 2) * 0.72;
  const headY = platterY + (platterSize / 2) * 0.08;

  drawTonearm(tctx, pivotX, pivotY, headX, headY);

  await fs.writeFile(outputTonearmPath, tonearmCanvas.toBuffer('image/png'));

  return {
    outputPanelPath,
    outputTonearmPath,
    geometry: {
      size,
      pivotX,
      pivotY,
      platterX,
      platterY,
      platterR: platterSize / 2,
      outerHead: { x: headX, y: headY },
      innerHead: {
        x: platterX + (platterSize / 2) * 0.22,
        y: platterY + (platterSize / 2) * 0.05,
      },
    },
  };
}

export function drawTonearm(ctx, pivotX, pivotY, headX, headY) {
  const angle = Math.atan2(headY - pivotY, headX - pivotX);

  // Soft contour-ish shadow under arm
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  ctx.strokeStyle = '#c8c8c8';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(headX, headY);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const midX = pivotX + (headX - pivotX) * 0.55;
  const midY = pivotY + (headY - pivotY) * 0.55;
  ctx.moveTo(midX, midY);
  ctx.lineTo(headX, headY);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(pivotX, pivotY, 14, 0, Math.PI * 2);
  ctx.fillStyle = '#1e1e1e';
  ctx.fill();
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(pivotX, pivotY, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#444';
  ctx.fill();

  ctx.save();
  ctx.translate(headX, headY);
  ctx.rotate(angle + Math.PI / 2);

  ctx.fillStyle = '#3a3a3a';
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-11, -6, 22, 13, 3);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.lineTo(0, 15);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 15, 1.6, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  ctx.restore();
}

function drawKnob(ctx, x, y, r) {
  ctx.save();
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  grad.addColorStop(0, '#6a6a6a');
  grad.addColorStop(1, '#1a1a1a');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - r * 0.7);
  ctx.stroke();
}

function drawLever(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.strokeStyle = '#bbb';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 10, y - 6);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x + 10, y - 6, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ddd';
  ctx.fill();
  ctx.restore();
}
