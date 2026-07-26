/** Inlines artifact/snapshot.json into artifact/template.html → artifact/board.html */
import fs from 'node:fs';

const template = fs.readFileSync('artifact/template.html', 'utf8');
const snapshot = fs.readFileSync('artifact/snapshot.json', 'utf8');

// The payload sits inside a <script type="application/json"> island, so the
// only sequence that could break out of it is a closing script tag.
const safe = snapshot.replace(/<\/script/gi, '<\\/script');

if (!template.includes('__SNAPSHOT__')) throw new Error('placeholder missing');
fs.writeFileSync('artifact/board.html', template.replace('__SNAPSHOT__', safe));

console.log(`artifact/board.html: ${(fs.statSync('artifact/board.html').size / 1024).toFixed(0)} KB`);
