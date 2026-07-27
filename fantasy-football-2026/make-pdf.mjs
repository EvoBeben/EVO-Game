import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/user/EVO-Game/fantasy-football-2026/print.html', {waitUntil:'load'});
await p.emulateMedia({ media:'print' });
await p.pdf({
  path: '/home/user/EVO-Game/fantasy-football-2026/The-Board-2026.pdf',
  format: 'Letter',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `<div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:7pt;color:#8A8078;
      padding:0 15mm;display:flex;justify-content:space-between;">
      <span>The Board · 2026 Fantasy Football</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  margin: { top:'17mm', bottom:'15mm', left:'15mm', right:'15mm' }
});
if (errs.length) console.log('page errors:', errs.join('; '));
await b.close();
console.log('pdf written');
