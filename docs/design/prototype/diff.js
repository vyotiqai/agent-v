// Compares two screenshot folders pixel by pixel; lists any screen that differs and by how many pixels.
// Usage: node diff.js <dirA> <dirB>
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [a, b] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const names = fs.readdirSync(a).filter((f) => f.endsWith('.png')).sort();
  let differ = 0;
  for (const n of names) {
    if (!fs.existsSync(path.join(b, n))) { console.log(`MISSING ${n}`); differ++; continue; }
    const [x, y] = [a, b].map((d) => 'data:image/png;base64,' + fs.readFileSync(path.join(d, n)).toString('base64'));
    const count = await page.evaluate(async ([x, y]) => {
      const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
      const [ix, iy] = await Promise.all([load(x), load(y)]);
      if (ix.width !== iy.width || ix.height !== iy.height) return -1;
      const data = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
      const dx = data(ix), dy = data(iy);
      let n = 0;
      for (let i = 0; i < dx.length; i += 4) if (dx[i] !== dy[i] || dx[i + 1] !== dy[i + 1] || dx[i + 2] !== dy[i + 2]) n++;
      return n;
    }, [x, y]);
    if (count !== 0) { console.log(`DIFFERS ${n}: ${count < 0 ? 'size' : count + ' pixels'}`); differ++; }
  }
  console.log(`${names.length} compared, ${differ} differ`);
  await browser.close();
})();
