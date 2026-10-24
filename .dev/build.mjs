// 构建单文件 HTML：index.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

const template = read('template.html');
const css = read('src/style.css');
let three = read('three.min.js');
three = three.replace(/\/\/# sourceMappingURL=.*$/m, '');

const parts = {
  '/*__CSS__*/': css,
  '/*__THREE__*/': three,
  '/*__UTIL__*/': read('src/util.js'),
  '/*__AUDIO__*/': read('src/audio.js'),
  '/*__WORLD__*/': read('src/world.js'),
  '/*__BLESSINGS__*/': read('src/blessings.js'),
  '/*__GAME__*/': read('src/game.js'),
  '/*__HUD__*/': read('src/hud.js'),
  '/*__COMBAT__*/': read('src/combat.js'),
};

let html = template;
for (const [marker, content] of Object.entries(parts)) {
  if (!html.includes(marker)) throw new Error('missing marker: ' + marker);
  if (content.includes('</script>')) throw new Error('script content contains </script>: ' + marker);
  html = html.replace(marker, () => content);
}
if (html.includes('/*__')) throw new Error('unreplaced marker remains');

const outPath = path.join(root, 'index.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('BUILD OK ->', outPath);
console.log('SIZE =', (html.length / 1024).toFixed(1), 'KB');
