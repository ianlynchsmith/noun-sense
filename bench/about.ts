// What a few news articles are about: node --experimental-strip-types bench/about.ts article.txt…
import { readFileSync } from 'node:fs';
import { loadNet } from '../src/load.ts';
const net = loadNet();
for (const f of process.argv.slice(2)) {
  const text = readFileSync(f, 'utf8');
  console.log(`\n== ${f.split('/').pop()} (${text.split(/\s+/).length} words): ${text.slice(0, 90).replace(/\s+/g, ' ')}…`);
  for (const a of net.about(text)) console.log(`  ${a.score.toFixed(2).padStart(6)}  ${a.name.padEnd(22)} [${a.lexfile}] ← ${a.words.join(', ')}`);
}
