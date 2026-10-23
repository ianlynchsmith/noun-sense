// Benchmark on screenplay scenes: node --experimental-strip-types bench/scenes.ts items.json
// items.json (not included: the scenes are copyrighted scripts) is [{ file, word, text, action, among, truth, group }].
import { readFileSync } from 'node:fs';
import { TUNE } from '../src/net.ts';
import { loadNet } from '../src/load.ts';
import { CASES } from '../test/cases.ts';
const net = loadNet();
type Item = { file: string; word: string; text: string; action: string; among: number[]; truth: number[]; group: string };
const items: Item[] = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const h = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const sets = { tune: items.filter((i) => h(i.file) % 2 === 0), test: items.filter((i) => h(i.file) % 2 === 1), all: items };
const hit = (s: { name: string; definition?: string } | null | undefined, want: string) => !!s && `${s.name} ${s.definition ?? ''}`.toLowerCase().includes(want);
const macro = (set: Item[]) => {
  const g = new Map<string, [number, number]>();
  for (const it of set) { const r = net.choose(it.word, process.env.ACTION ? it.action : it.text, { among: it.among }); const k = `${it.word}:${it.group}`; const t = g.get(k) ?? [0, 0]; t[1]++; if (r.best && it.truth.includes(r.best.id)) t[0]++; g.set(k, t); }
  const vals = [...g.values()].map(([a, b]) => a / b);
  return `${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3)} ${JSON.stringify(Object.fromEntries([...g].map(([k, [a, b]]) => [k, `${a}/${b}`])))}`;
};
const base = {};
for (const [rounds, agree] of [[1, 1]]) {
  Object.assign(TUNE, base, { rounds, agree }); net.reset();
  const cases = CASES.filter((c) => hit(net.choose(c.word, c.passage).best, c.want)).length;
  console.log(`rounds ${rounds} agree ${agree}: cases ${cases}/30\n  tune ${macro(sets.tune)}\n  test ${macro(sets.test)}`);
}
