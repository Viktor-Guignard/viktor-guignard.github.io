// Rend chaque scène image par image (animations pilotées) et écrit une liste concat ffmpeg.
// Usage : node capture.js <timeline.json> <dossier_images>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [, , timelinePath, outDir] = process.argv;
const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
const FPS = 25;
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(__dirname, 'scenes.html'));
  await page.evaluate(() => document.fonts.ready);
  const concat = [];
  let n = 0;
  for (const sc of timeline.scenes) {
    const intervals = await page.evaluate(([id, starts]) => {
      loadScene(id, starts);
      return document.getAnimations().map(a => {
        const t = a.effect.getComputedTiming();
        return [t.delay / 1000, t.endTime / 1000];
      });
    }, [sc.id, sc.starts]);
    // instants à rendre : pendant les animations à FPS, plus chaque changement de sous-titre
    const times = new Set([0]);
    for (const [a, b] of intervals) {
      for (let t = Math.max(0, a); t < Math.min(b, sc.duration) + 1 / FPS; t += 1 / FPS) times.add(+t.toFixed(3));
    }
    sc.starts.forEach(s => times.add(+s.toFixed(3)));
    const sorted = [...times].filter(t => t < sc.duration).sort((x, y) => x - y);
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const next = i + 1 < sorted.length ? sorted[i + 1] : sc.duration;
      let k = 0;
      sc.starts.forEach((s, j) => { if (t + 1e-6 >= s) k = j; });
      await page.evaluate(([tt, cap]) => setFrame(tt, cap), [t, sc.captions[k]]);
      const file = path.join(outDir, `f${String(n++).padStart(6, '0')}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
      concat.push(`file '${file}'`, `duration ${(next - t).toFixed(4)}`);
    }
    process.stdout.write(`${sc.id}: ${sorted.length} images, ${sc.duration.toFixed(1)} s\n`);
  }
  // ffmpeg concat : répéter la dernière image
  concat.push(concat[concat.length - 2]);
  fs.writeFileSync(path.join(outDir, 'concat.txt'), concat.join('\n') + '\n');
  await browser.close();
})();
