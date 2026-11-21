// Records the trailer from the real game: node tools/record-trailer.cjs <en|ms|id> <outdir> [preview]
// Steps dist/senyap.html?trailer one fixed frame at a time, screenshots each frame, and saves the offline-rendered audio.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [lang = 'ms', out = 'trailer/ms', mode = 'full'] = process.argv.slice(2);
  fs.mkdirSync(out + '/f', { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message + ' ' + e.stack));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(`file://${require('path').resolve(__dirname, '../dist/senyap.html')}?trailer&lang=${lang}`);
  await pg.waitForTimeout(2500);
  const N = await pg.evaluate(() => __trailer.frames);
  const preview = mode === 'preview' ? new Set([700, 735, 760, 790, 840, 880, 930, 980]) : null;
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    await pg.evaluate((i) => __trailer.step(i), i);
    if (!preview || preview.has(i)) await pg.screenshot({ path: `${out}/f/${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 90 });
    if (i % 150 === 0) console.log('frame', i, ((Date.now() - t0) / 1000).toFixed(0) + 's', errs.length ? errs[0] : '');
  }
  const wav = await pg.evaluate(() => __trailer.audio());
  fs.writeFileSync(`${out}/audio.wav`, Buffer.from(wav, 'base64'));
  console.log('done', ((Date.now() - t0) / 1000).toFixed(0) + 's', errs.slice(0, 5).join('\n'));
  await b.close();
})();
