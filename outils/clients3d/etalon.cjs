// L'étalonnage du ralentissement CDP (Emulation.setCPUThrottlingRate) : une boucle JS de coût fixe, mesurée appel par appel, à ×1 et à ×4 (0,5 / 2 / 8 ms),
// puis en longue tâche. usage : node etalon.cjs (Playwright dans NODE_PATH)
'use strict';
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage(); await page.setContent('<p>x</p>');
  const cdp = await page.context().newCDPSession(page);
  const tache = (n) => page.evaluate((n) => { const t0 = performance.now(); let x = 0; for (let i = 0; i < n; i++) x += Math.sqrt(i * 1.0001); window.__x = x; return performance.now() - t0; }, n);
  // n pour ~2 ms à ×1
  let n = 200000; for (let k = 0; k < 5; k++) { const t = await tache(n); n = Math.round(n * 2 / Math.max(0.2, t)); }
  for (const cible of [0.5, 2, 8]) {
    const nn = Math.round(n * cible / 2), r = {};
    for (const rate of [1, 4]) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate }); const v = [];
      for (let i = 0; i < 25; i++) { const t = await tache(nn); if (i >= 5) v.push(t); }
      v.sort((a, b) => a - b); r[rate] = { min: +v[0].toFixed(2), p10: +v[2].toFixed(2), med: +v[10].toFixed(2), p90: +v[18].toFixed(2) };
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log(`~${cible} ms : ×1 ${JSON.stringify(r[1])} · ×4 ${JSON.stringify(r[4])} · rapport médianes ${(r[4].med / r[1].med).toFixed(2)}`);
  }
  // une longue tâche : 30 × 2 ms d'affilée
  for (const rate of [1, 4]) { await cdp.send('Emulation.setCPUThrottlingRate', { rate }); const t = await page.evaluate((n) => { const t0 = performance.now(); for (let k = 0; k < 30; k++) { let x = 0; for (let i = 0; i < n; i++) x += Math.sqrt(i * 1.0001); window.__x = x; } return (performance.now() - t0) / 30; }, n); console.log(`longue ×${rate} : ${t.toFixed(2)} ms par tranche de ~2 ms`); }
  await browser.close();
})();
