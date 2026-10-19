// server/index.js
import express from 'express';
import multer from 'multer';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { prepareDisc } from '../lib/prepareDisc.js';
import { createSleeve } from '../lib/sleeve.js';
import { createTurntable, drawTonearm } from '../lib/turntable.js';
import { createCanvas } from 'canvas';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads');
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 },
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const getAudioDuration = (filePath) =>
  new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    let out = '';
    ffprobe.stdout.on('data', (d) => (out += d.toString()));
    ffprobe.on('close', (code) => {
      if (code === 0) resolve(parseFloat(out.trim()));
      else reject(new Error('ffprobe failed — is ffmpeg installed?'));
    });
  });

const runFfmpeg = (args) =>
  new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', args);
    let stderr = '';
    ff.stderr.on('data', (d) => {
      stderr += d.toString();
      process.stderr.write(d);
    });
    ff.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr.slice(-800)}`));
    });
  });

function smootherstep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

async function generateTonearmSequence(geo, frames, workDir) {
  const { size, pivotX, pivotY, outerHead, innerHead } = geo;
  const paths = [];

  for (let i = 0; i < frames; i++) {
    const t = frames <= 1 ? 0 : i / (frames - 1);
    const ease = smootherstep(t);
    const hx = outerHead.x + (innerHead.x - outerHead.x) * ease;
    const hy = outerHead.y + (innerHead.y - outerHead.y) * ease;

    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    drawTonearm(ctx, pivotX, pivotY, hx, hy);

    const p = path.join(workDir, `tonearm_f${String(i).padStart(4, '0')}.png`);
    await fs.writeFile(p, canvas.toBuffer('image/png'));
    paths.push(p);
  }
  return paths;
}

function isTruthy(v) {
  return v === '1' || v === 'true' || v === true || v === 1;
}

app.post(
  '/generate',
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
    { name: 'background', maxCount: 1 },
    { name: 'vinylSample', maxCount: 1 },
  ]),
  async (req, res) => {
    const cleanup = [];
    try {
      const audioFile = req.files?.['audio']?.[0];
      const coverFile = req.files?.['cover']?.[0];
      const bgFile = req.files?.['background']?.[0];
      const vinylSampleFile = req.files?.['vinylSample']?.[0];

      if (!audioFile || !coverFile) {
        return res.status(400).json({ error: 'Audio and cover are required' });
      }
      cleanup.push(audioFile.path, coverFile.path);
      if (bgFile) cleanup.push(bgFile.path);
      if (vinylSampleFile) cleanup.push(vinylSampleFile.path);

      const {
        scene = 'turntable',
        style = 'circle',
        aspect = '1:1',
        resolution = '1080p',
        rpm = '33.333',
        startTime = '0',
        endTime = '',
        fadeIn = '2',
        fadeOut = '3',
        vinylColor = '#0e0e0e',
        center = 'hole',
        bgColor = '#1a1a1a',
        mode = 'loop',
        vinylNoise = '0',
        noiseLevel = '35',
        filmGrain = '0',
        grainLevel = '20',
        shadowEnabled = '1',
        shadowColor = '#000000',
        shadowIntensity = '65',
        trackVolume = '100',
        audioBitrate = '320',
        grooveIntensity = '100',
        scratches = '0',
        scratchAmount = '40',
        bgBlur = '0',
        bgDim = '0',
        position = 'center',  // top | center | bottom
        postFx = 'none',     // none | vignette | sepia | bw | warm | cool | contrast
        postFxAmount = '50',
      } = req.body;

      const workDir = path.join(__dirname, '../outputs/work', `job_${Date.now()}`);
      await fs.mkdir(workDir, { recursive: true });

      const audioDuration = await getAudioDuration(audioFile.path);
      const start = Math.max(0, parseFloat(startTime) || 0);

      let end;
      if (endTime !== '' && endTime != null && !Number.isNaN(parseFloat(endTime))) {
        end = parseFloat(endTime);
      } else {
        end = audioDuration;
      }

      if (start >= audioDuration) {
        return res.status(400).json({ error: 'Start time exceeds audio duration' });
      }
      if (end <= start) {
        return res.status(400).json({ error: 'End time must be greater than start time' });
      }
      if (end > audioDuration) end = audioDuration;

      let segmentDuration = end - start;

      let rpmVal = parseFloat(rpm) || 33.333;
      const isSingle = mode === 'single';
      if (isSingle) {
        rpmVal = 1;
        segmentDuration = 60;
      }

      const useVinylNoise = isTruthy(vinylNoise);
      const noiseAmt = Math.max(0, Math.min(100, parseFloat(noiseLevel) || 35)) / 100;
      const useGrain = isTruthy(filmGrain);
      const grainAmt = Math.max(0, Math.min(100, parseFloat(grainLevel) || 20)) / 100;
      const useShadow = isTruthy(shadowEnabled);
      const shadowCol = shadowColor || '#000000';
      const shadowAmt = Math.max(0, Math.min(100, parseFloat(shadowIntensity) || 65)) / 100;
      const trackVol = Math.max(0, Math.min(200, parseFloat(trackVolume) || 100)) / 100;
      const audioBr = ['128', '192', '256', '320'].includes(String(audioBitrate))
        ? String(audioBitrate)
        : '320';
      const grooveAmt = Math.max(0, Math.min(200, parseFloat(grooveIntensity) || 100)) / 100;
      const useScratches = isTruthy(scratches);
      const scratchAmt = Math.max(0, Math.min(100, parseFloat(scratchAmount) || 40)) / 100;
      const bgBlurAmt = Math.max(0, Math.min(50, parseFloat(bgBlur) || 0));
      const bgDimAmt = Math.max(0, Math.min(80, parseFloat(bgDim) || 0)) / 100;
      const fx = String(postFx || 'none');
      const fxAmt = Math.max(0, Math.min(100, parseFloat(postFxAmount) || 50)) / 100;

      const resBase = resolution === '720p' ? 720 : 1080;
      let W, H;
      switch (aspect) {
        case '16:9': W = (resBase * 16) / 9; H = resBase; break;
        case '9:16': W = resBase; H = (resBase * 16) / 9; break;
        case '4:5':  W = resBase; H = (resBase * 5) / 4; break;
        default:     W = resBase; H = resBase; break;
      }
      W = Math.round(W / 2) * 2;
      H = Math.round(H / 2) * 2;

      // Sleeve needs horizontal room for the protruding disc
      const contentSize =
        scene === 'sleeve'
          ? Math.min(W, H) * 0.44
          : scene === 'plain'
            ? Math.min(W, H) * 0.84
            : Math.min(W, H) * 0.68;

      // Vertical placement of the main object(s)
      const pos = ['top', 'center', 'bottom'].includes(position) ? position : 'center';
      // margin fraction from edge when top/bottom
      const edgeMargin = 0.04;
      const vAlign = (label) => {
        // returns overlay Y expression for a layer of height h inside frame H
        if (pos === 'top') return `H*${edgeMargin}`;
        if (pos === 'bottom') return `H-h-H*${edgeMargin}`;
        return '(H-h)/2';
      };


      const discPath = path.join(workDir, 'disc.png');
      await prepareDisc(coverFile.path, {
        size: Math.round(contentSize),
        style,
        vinylColor,
        center,
        holeRatio: 0.012,
        outputPath: discPath,
        shadowEnabled: useShadow,
        shadowColor: shadowCol,
        shadowIntensity: shadowAmt,
        grooveIntensity: grooveAmt,
        scratches: useScratches,
        scratchAmount: scratchAmt,
      });

      let sleevePath = null;
      let panelPath = null;
      let tonearmPath = null;
      let tonearmFrames = null;

      const useTurntable = scene === 'turntable' || isSingle;

      if (scene === 'sleeve') {
        sleevePath = path.join(workDir, 'sleeve.png');
        // Case slightly larger than disc so top/bottom edges never peek out
        await createSleeve(coverFile.path, {
          size: Math.min(W, H),
          sleeveSize: Math.round(contentSize * 1.03),
          outputPath: sleevePath,
          shadowEnabled: useShadow,
          shadowColor: shadowCol,
          shadowIntensity: shadowAmt,
        });
      }

      if (useTurntable) {
        panelPath = path.join(workDir, 'panel.png');
        tonearmPath = path.join(workDir, 'tonearm.png');
        const tt = await createTurntable({
          size: Math.min(W, H),
          platterSize: Math.round(contentSize),
          outputPanelPath: panelPath,
          outputTonearmPath: tonearmPath,
          shadowEnabled: useShadow,
          shadowColor: shadowCol,
          shadowIntensity: shadowAmt,
        });

        const fps = 20;
        const frames = Math.max(24, Math.min(240, Math.round(segmentDuration * fps)));
        tonearmFrames = await generateTonearmSequence(tt.geometry, frames, workDir);
      }

      // ---------- ffmpeg ----------
      const ffmpegArgs = [];
      let inputIdx = 0;

      let isBgVideo = false;
      let isBgImage = false;
      if (bgFile) {
        const name = (bgFile.originalname || '').toLowerCase();
        isBgVideo = /\.(mp4|mov|webm|mkv|m4v|gif)$/i.test(name);
        isBgImage = !isBgVideo;
        if (isBgVideo) {
          ffmpegArgs.push('-stream_loop', '-1', '-i', bgFile.path);
        } else {
          ffmpegArgs.push('-loop', '1', '-i', bgFile.path);
        }
      } else {
        const hexColor = bgColor.replace('#', '0x');
        ffmpegArgs.push('-f', 'lavfi', '-i', `color=c=${hexColor}:s=${W}x${H}:d=1`);
      }
      const bgIdx = inputIdx++;

      ffmpegArgs.push('-loop', '1', '-i', discPath);
      const discIdx = inputIdx++;

      let sleeveIdx = -1, panelIdx = -1, tonearmIdx = -1;
      if (sleevePath) {
        ffmpegArgs.push('-loop', '1', '-i', sleevePath);
        sleeveIdx = inputIdx++;
      }
      if (panelPath) {
        ffmpegArgs.push('-loop', '1', '-i', panelPath);
        panelIdx = inputIdx++;
      }

      if (tonearmFrames && tonearmFrames.length) {
        const pattern = path.join(workDir, 'tonearm_f%04d.png');
        const armFps = tonearmFrames.length / segmentDuration;
        ffmpegArgs.push('-framerate', armFps.toFixed(4), '-i', pattern);
        tonearmIdx = inputIdx++;
      } else if (tonearmPath) {
        ffmpegArgs.push('-loop', '1', '-i', tonearmPath);
        tonearmIdx = inputIdx++;
      }

      ffmpegArgs.push('-ss', start.toString(), '-i', audioFile.path);
      const audioIdx = inputIdx++;

      // Vinyl crackle: user sample or built-in assets/vinyl_crackle.wav
      let crackleIdx = -1;
      if (useVinylNoise && noiseAmt > 0) {
        const cracklePath = vinylSampleFile
          ? vinylSampleFile.path
          : path.join(__dirname, '../assets/vinyl_crackle.wav');
        ffmpegArgs.push('-stream_loop', '-1', '-i', cracklePath);
        crackleIdx = inputIdx++;
      }

      // ----- video filter -----
      let filter = '';
      const rotationSpeed = (2 * Math.PI * rpmVal) / 60;

      if (isBgVideo || isBgImage) {
        let bgChain = `[${bgIdx}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30`;
        if (bgBlurAmt > 0) bgChain += `,boxblur=${Math.round(bgBlurAmt)}:${Math.round(bgBlurAmt)}`;
        if (bgDimAmt > 0) bgChain += `,eq=brightness=-${bgDimAmt.toFixed(2)}`;
        filter += `${bgChain}[bg];`;
      } else {
        let bgChain = `[${bgIdx}:v]scale=${W}:${H},setsar=1`;
        if (bgDimAmt > 0) bgChain += `,eq=brightness=-${bgDimAmt.toFixed(2)}`;
        filter += `${bgChain}[bg];`;
      }
      let lastV = '[bg]';

      if (panelIdx >= 0) {
        filter += `${lastV}[${panelIdx}:v]overlay=(W-w)/2:${vAlign('panel')}[v_panel];`;
        lastV = '[v_panel]';
      }

      filter += `[${discIdx}:v]rotate=${rotationSpeed}*t:fillcolor=none:ow=iw:oh=ih[disc_rot];`;

      // Sleeve layout: disc slides out to the right; whole group roughly centered
      let discOffsetX = 0;
      let sleeveOffsetX = 0;
      if (scene === 'sleeve') {
        // Relative: hole sits just past the sleeve edge.
        // Whole group shifted left so the protruding disc stays on screen.
        const protrude = contentSize * 0.48;   // disc vs sleeve
        const sleeveRel = -contentSize * 0.08;
        const groupShift = -contentSize * 0.16; // slide construction left
        discOffsetX = Math.round(protrude + groupShift);
        sleeveOffsetX = Math.round(sleeveRel + groupShift);
      }

      filter += `${lastV}[disc_rot]overlay=(W-w)/2+${discOffsetX}:${vAlign('disc')}[v_disc];`;
      lastV = '[v_disc]';

      if (sleeveIdx >= 0) {
        // Sleeve on top of disc so the case covers the part still "inside"
        filter += `${lastV}[${sleeveIdx}:v]overlay=(W-w)/2+${sleeveOffsetX}:${vAlign('sleeve')}[v_sleeve];`;
        lastV = '[v_sleeve]';
      }

      if (tonearmIdx >= 0) {
        filter += `${lastV}[${tonearmIdx}:v]overlay=(W-w)/2:${vAlign('tonearm')}[v_tonearm];`;
        lastV = '[v_tonearm]';
      }

      // Film grain — separate toggle
      if (useGrain && grainAmt > 0) {
        const grainS = (4 + grainAmt * 28).toFixed(1);
        filter += `${lastV}noise=alls=${grainS}:allf=t[v_grain];`;
        lastV = '[v_grain]';
      }

      // Post-processing (whole frame)
      if (fx && fx !== 'none' && fxAmt > 0) {
        if (fx === 'vignette') {
          // angle ~ PI/4..PI/2-ish; higher amount = stronger dark edges
          const angle = (Math.PI * 0.25 + fxAmt * Math.PI * 0.35).toFixed(4);
          filter += `${lastV}vignette=angle=${angle}:mode=forward[v_fx];`;
          lastV = '[v_fx]';
        } else if (fx === 'sepia') {
          // mix original with sepia color matrix
          const m = fxAmt.toFixed(3);
          filter += (
            `${lastV}split[v_a][v_b];` +
            `[v_b]colorchannelmixer=` +
            `rr=0.393:rg=0.769:rb=0.189:` +
            `gr=0.349:gg=0.686:gb=0.168:` +
            `br=0.272:bg=0.534:bb=0.131[v_sep];` +
            `[v_a][v_sep]blend=all_expr='A*(1-${m})+B*${m}'[v_fx];`
          );
          lastV = '[v_fx]';
        } else if (fx === 'bw') {
          const m = fxAmt.toFixed(3);
          filter += (
            `${lastV}split[v_a][v_b];` +
            `[v_b]hue=s=0[v_bw];` +
            `[v_a][v_bw]blend=all_expr='A*(1-${m})+B*${m}'[v_fx];`
          );
          lastV = '[v_fx]';
        } else if (fx === 'warm') {
          const s = (1 + fxAmt * 0.35).toFixed(3);
          const b = (fxAmt * 0.06).toFixed(3);
          filter += `${lastV}eq=saturation=${s}:brightness=${b},colorbalance=rs=${(fxAmt*0.25).toFixed(3)}:gs=0:bs=-${(fxAmt*0.2).toFixed(3)}[v_fx];`;
          lastV = '[v_fx]';
        } else if (fx === 'cool') {
          const s = (1 + fxAmt * 0.2).toFixed(3);
          filter += `${lastV}eq=saturation=${s},colorbalance=rs=-${(fxAmt*0.2).toFixed(3)}:gs=0:bs=${(fxAmt*0.25).toFixed(3)}[v_fx];`;
          lastV = '[v_fx]';
        } else if (fx === 'contrast') {
          const c = (1 + fxAmt * 0.6).toFixed(3);
          const s = (1 + fxAmt * 0.25).toFixed(3);
          filter += `${lastV}eq=contrast=${c}:saturation=${s}[v_fx];`;
          lastV = '[v_fx]';
        }
      }

      // ----- audio filter -----
      const fi = parseFloat(fadeIn) || 0;
      const fo = parseFloat(fadeOut) || 0;

      let audioFilter = `[${audioIdx}:a]atrim=end=${segmentDuration},asetpts=PTS-STARTPTS`;
      if (fi > 0) audioFilter += `,afade=t=in:st=0:d=${Math.min(fi, segmentDuration)}`;
      if (fo > 0) {
        const fadeOutStart = Math.max(0, segmentDuration - fo);
        audioFilter += `,afade=t=out:st=${fadeOutStart}:d=${Math.min(fo, segmentDuration)}`;
      }
      audioFilter += `[a_main];`;

      if (crackleIdx >= 0) {
        const vol = (0.12 + noiseAmt * 0.55).toFixed(3);
        audioFilter +=
          `[${crackleIdx}:a]volume=${vol},atrim=end=${segmentDuration},asetpts=PTS-STARTPTS[a_vinyl];` +
          `[a_main]volume=${trackVol.toFixed(3)}[a_trk];` +
          `[a_trk][a_vinyl]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[a];`;
      } else {
        audioFilter += `[a_main]volume=${trackVol.toFixed(3)}[a];`;
      }

      filter += audioFilter;

      const outputName = `out_${Date.now()}.mp4`;
      const outputPath = path.join(__dirname, '../outputs/work', outputName);

      ffmpegArgs.push(
        '-filter_complex', filter,
        '-map', lastV,
        '-map', '[a]',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '17',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', `${audioBr}k`,
        '-t', segmentDuration.toFixed(3),
        '-movflags', '+faststart',
        '-y',
        outputPath
      );

      console.log(
        `ffmpeg  dur=${segmentDuration.toFixed(2)}s rpm=${rpmVal} scene=${scene} ` +
        `vinylNoise=${useVinylNoise ? noiseAmt : 0} grain=${useGrain ? grainAmt : 0}`
      );
      await runFfmpeg(ffmpegArgs);
      console.log('Done →', outputName);

      try {
        const files = await fs.readdir(workDir);
        for (const f of files) await fs.unlink(path.join(workDir, f)).catch(() => {});
        await fs.rmdir(workDir).catch(() => {});
      } catch {}

      res.json({
        success: true,
        videoUrl: `/outputs/work/${outputName}`,
        duration: segmentDuration,
        start,
        end: start + segmentDuration,
        rpm: rpmVal,
        mode: isSingle ? 'single' : 'loop',
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || String(err) });
    } finally {
      for (const p of cleanup) {
        if (typeof p === 'string' && p.includes('uploads')) {
          fs.unlink(p).catch(() => {});
        }
      }
    }
  }
);

app.use('/outputs', express.static(path.join(__dirname, '../outputs')));

app.listen(port, () => {
  console.log(`Vinyl server → http://localhost:${port}`);
});
