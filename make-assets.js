// make-assets.js — generates sample assets for testing
import { prepareDisc } from './lib/prepareDisc.js';
import { createSleeve } from './lib/sleeve.js';
import { createTurntable } from './lib/turntable.js';
import fs from 'fs/promises';
import path from 'path';

const run = async () => {
  const workDir = './outputs/work';
  await fs.mkdir(workDir, { recursive: true });

  // Use assets/1.jpg if present, otherwise skip cover-dependent parts
  const coverCandidates = ['./assets/1.jpg', './cover.jpg', './assets/cover.jpg'];
  let coverPath = null;
  for (const p of coverCandidates) {
    try {
      await fs.access(p);
      coverPath = p;
      break;
    } catch {}
  }

  if (!coverPath) {
    console.warn('No cover image found (tried assets/1.jpg, cover.jpg). Skipping disc/sleeve.');
  } else {
    console.log('Using cover:', coverPath);

    // 1. Disc (circle + hole)
    await prepareDisc(coverPath, {
      size: 1080,
      style: 'circle',
      vinylColor: '#0e0e0e',
      center: 'hole',
      outputPath: path.join(workDir, 'disc.png'),
    });
    console.log('  → disc.png');

    // 2. Sleeve
    await createSleeve(coverPath, {
      size: 1080,
      sleeveSize: 900,
      outputPath: path.join(workDir, 'sleeve.png'),
    });
    console.log('  → sleeve.png');
  }

  // 3. Turntable panel + tonearm
  await createTurntable({
    size: 1080,
    platterSize: 780,
    outputPanelPath: path.join(workDir, 'panel.png'),
    outputTonearmPath: path.join(workDir, 'tonearm.png'),
  });
  console.log('  → panel.png, tonearm.png');

  console.log('Assets ready in', workDir);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
