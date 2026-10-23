#!/usr/bin/env node
/**
 * noun-sense <word> <passage…>     which sense of <word> the passage means
 *   --among "hint1,hint2"          choose only among senses whose name or definition has one of these (e.g. "law,game")
 *   --senses                       list the word's senses and stop
 *   --json                         machine-readable output
 *   -                              read the passage from stdin
 */
import { readFileSync } from 'node:fs';
import { loadNet } from './load.ts';

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const has = (name: string) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const json = has('--json'), list = has('--senses'), among = flag('--among');
const [word, ...rest] = args;
if (!word || word === '-h' || word === '--help') {
  console.log('usage: noun-sense <word> <passage…> [--among "hint,hint"] [--senses] [--json]   (passage "-" reads stdin)');
  process.exit(word ? 0 : 1);
}
const net = loadNet();
if (list) {
  const senses = net.sensesOf(word).map((id) => net.sense(id));
  if (json) console.log(JSON.stringify(senses, null, 2));
  else senses.forEach((s, i) => console.log(`${i + 1}. ${s.name} (${s.lexfile}): ${s.definition}`));
  process.exit(0);
}
const passage = rest.length === 1 && rest[0] === '-' ? readFileSync(0, 'utf8') : rest.join(' ');
if (!passage.trim()) { console.error('noun-sense: give a passage (or "-" for stdin)'); process.exit(1); }
const ids = among ? among.split(',').flatMap((h) => net.find(word, h.trim())) : undefined;
const r = net.choose(word, passage, ids?.length ? { among: [...new Set(ids)] } : {});
if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
if (!r.best) { console.log(`${word}: the passage says nothing about it`); process.exit(0); }
// (A short sentence scores low however clear it is: "not sure" only when it's low and the next sense is close.)
console.log(`${word} → ${r.best.name}: ${r.best.definition}${r.confident || r.margin >= 0.5 ? '' : '   (not sure: little to go on)'}`);
for (const x of r.ranked.slice(1, 4)) console.log(`   then ${x.name} (${x.score.toFixed(3)}): ${(x.definition ?? '').slice(0, 80)}`);
