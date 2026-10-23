import { readFileSync } from 'node:fs';
import { TUNE } from '../src/net.ts';
import { loadNet } from '../src/load.ts';
const net = loadNet();
type Item = { file: string; word: string; text: string; action: string; among: number[]; truth: number[]; group: string };
const items: Item[] = JSON.parse(readFileSync(process.argv[2], 'utf8'));
// One "article" per script and kind of place: every scene of it put together.
const sets = new Map<string, Item>();
for (const it of items) {
  const k = `${it.file}|${it.word}|${it.group}`;
  const s = sets.get(k);
  if (s) { s.text += ' ' + it.text; s.action += ' ' + it.action; } else sets.set(k, { ...it });
}
for (const field of ['text', 'action'] as const) {
  let ok = 0, n = 0; const g = new Map<string, [number, number]>();
  for (const it of sets.values()) {
    const r = net.choose(it.word, it[field], { among: it.among });
    const good = !!r.best && it.truth.includes(r.best.id);
    n++; ok += +good;
    const k = `${it.word}:${it.group}`; const t = g.get(k) ?? [0, 0]; t[1]++; t[0] += +good; g.set(k, t);
    if (!good) console.log(`  miss ${k} ${it.file} (${it[field].split(/\s+/).length} words, margin ${r.margin.toFixed(2)})`);
  }
  console.log(`${field === 'text' ? 'action + dialogue' : 'action only'}: ${ok}/${n} sets right  ${JSON.stringify(Object.fromEntries([...g].map(([k, [a, b]]) => [k, `${a}/${b}`])))}`);
}
console.log(`(scenes one at a time, all scripts: see rounds.ts)`);
