// Bundles the game (three.js and the pixelfx effects it uses) into dist/game.js, and also into one
// self-contained page, dist/senyap.html, that runs from anywhere.
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const here = new URL(".", import.meta.url);
await mkdir(new URL("dist/", here), { recursive: true });
const out = await build({
  entryPoints: [new URL("src/main.js", here).pathname],
  bundle: true,
  format: "esm",
  minify: true,
  target: "es2020",
  write: false,
  legalComments: "none",
});
const js = out.outputFiles[0].text;
await writeFile(new URL("dist/game.js", here), js);
const html = await readFile(new URL("index.html", here), "utf8");
await writeFile(new URL("dist/index.html", here), html);
const single = html.replace('<script type="module" src="./game.js"></script>', () => `<script type="module">\n${js.replace(/<\/script/gi, "<\\/script")}\n</script>`);
await writeFile(new URL("dist/senyap.html", here), single);
// the same page without its document wrapper, for hosts that add their own (a claude.ai artifact)
const bare = single
  .replace(/<!doctype html>\s*/i, "")
  .replace(/<\/?html[^>]*>\s*/gi, "")
  .replace(/<\/?head>\s*/gi, "")
  .replace(/<\/?body>\s*/gi, "")
  .replace(/<meta (charset|name="viewport")[^>]*>\s*/gi, "");
await writeFile(new URL("dist/senyap.embed.html", here), bare);
console.log(`dist/senyap.html  ${(single.length / 1024).toFixed(0)} KB`);
