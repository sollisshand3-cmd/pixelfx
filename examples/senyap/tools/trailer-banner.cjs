// node tools/trailer-banner.cjs <en|ms|id> <out.png>: renders the 9:16 frame's top and bottom banners (transparent PNG, 1080x1920) in the game's font
const { chromium } = require('playwright');
(async () => {
  const [lang = 'ms', out = 'trailer/ms/banner.png'] = process.argv.slice(2);
  const T = {
    ms: ['SENYAP', 'HOTEL MALAM', 'PAKAI EARPHONE', 'untuk merasai pengalaman sebenar'],
    en: ['SENYAP', 'THE NIGHT HOTEL', 'WEAR EARPHONES', 'for the full experience'],
    id: ['SENYAP', 'HOTEL MALAM', 'PAKAI EARPHONE', 'untuk merasakan pengalaman sebenarnya'],
  }[lang];
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await pg.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=VT323&display=swap" rel="stylesheet">
  <style>html,body{margin:0;background:transparent;font-family:VT323,monospace;color:#d8d0c0;text-align:center}
  .top{position:absolute;top:150px;left:0;right:0}.bot{position:absolute;bottom:170px;left:0;right:0}
  h1{font-size:190px;margin:0;letter-spacing:.16em;font-weight:400;text-shadow:7px 0 #c8201c,-4px 0 #1b3a8a}
  p{margin:0}.tag{font-size:56px;color:#d8a850;letter-spacing:.45em}
  .ear{font-size:84px;letter-spacing:.12em;display:flex;gap:26px;justify-content:center;align-items:center}
  .s{font-size:44px;color:#9a9080;margin-top:10px}</style></head><body>
  <div class="top"><h1>${T[0]}</h1><p class="tag">${T[1]}</p></div>
  <div class="bot"><div class="ear"><svg viewBox="0 0 64 56" width="110" height="96"><path d="M8 34 V28 A24 24 0 0 1 56 28 V34" fill="none" stroke="#d8a850" stroke-width="5"/><rect x="4" y="32" width="12" height="20" fill="#d8a850"/><rect x="48" y="32" width="12" height="20" fill="#d8a850"/></svg><span>${T[2]}</span></div><p class="s">${T[3]}</p></div>
  </body></html>`);
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: out, omitBackground: true });
  await b.close();
})();
