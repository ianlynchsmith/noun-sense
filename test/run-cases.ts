import { readFileSync } from 'node:fs';
import { loadNet } from '../src/load.ts';
import { CASES } from './cases.ts';

const net = loadNet();
const firstSense = (w: string) => net.sense(net.sensesOf(w)[0]);
const hit = (s: { name: string; definition?: string } | null | undefined, want: string) => !!s && `${s.name} ${s.definition ?? ''}`.toLowerCase().includes(want);
let ok = 0, base = 0;
for (const c of CASES) {
  const r = net.choose(c.word, c.passage);
  const good = hit(r.best, c.want), b = hit(firstSense(c.word), c.want);
  ok += +good; base += +b;
  console.log(`${good ? 'ok  ' : 'MISS'} ${c.word.padEnd(10)} → ${r.best?.name ?? '-'} (${r.margin.toFixed(2)}): ${(r.best?.definition ?? '').slice(0, 70)}${good ? '' : `\n       wanted "${c.want}"; top 3: ${r.ranked.slice(0, 3).map((x) => `${x.name} ${x.score.toFixed(3)} [${(x.definition ?? '').slice(0, 40)}]`).join(' | ')}`}`);
}
console.log(`\n${ok}/${CASES.length} right (always the commonest sense: ${base}/${CASES.length})`);
// (A regression gate: the hand cases scored 23/30 on 2026-10-23.)
if (ok < 22) { console.error(`hand cases fell to ${ok}/${CASES.length}`); process.exit(1); }
