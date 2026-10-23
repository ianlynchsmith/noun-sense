// Build data/nouns.json.gz from Open English WordNet (LMF XML): the noun hierarchy, each synset's
// definition nouns (its signature), topic and part links, and words of other parts of speech
// mapped onto nouns through derivation. Run: node scripts/build.mjs path/to/english-wordnet-YYYY.xml.gz
import { createReadStream, writeFileSync } from 'node:fs';
import { createGunzip, gzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';

const src = process.argv[2];
if (!src) { console.error('usage: node scripts/build.mjs english-wordnet-2025.xml.gz'); process.exit(1); }

const unesc = (s) => s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const entries = []; // { lemma, pos, senses: [{ id, synset, derivs: [senseId] }] }
const synsets = new Map(); // id -> { pos, lexfile, def, hyper: [], topic: [], whole: [], members }
let entry = null, sense = null, syn = null;
const rl = createInterface({ input: createReadStream(src).pipe(createGunzip()), crlfDelay: Infinity });
for await (const line of rl) {
  let m;
  if ((m = line.match(/<LexicalEntry id="([^"]+)"/))) { entry = { lemma: '', pos: '', senses: [] }; entries.push(entry); continue; }
  if (entry && (m = line.match(/<Lemma writtenForm="([^"]+)" partOfSpeech="(\w)"/))) { entry.lemma = unesc(m[1]); entry.pos = m[2]; continue; }
  if (entry && (m = line.match(/<Sense id="([^"]+)" synset="([^"]+)"/))) { sense = { id: m[1], synset: m[2], derivs: [] }; entry.senses.push(sense); if (/\/>\s*$/.test(line)) sense = null; continue; }
  if (sense && (m = line.match(/<SenseRelation relType="(derivation|pertainym)" target="([^"]+)"/))) { sense.derivs.push(m[2]); continue; }
  if (/<\/Sense>/.test(line)) { sense = null; continue; }
  if (/<\/LexicalEntry>/.test(line)) { entry = null; continue; }
  if ((m = line.match(/<Synset id="([^"]+)"[^>]*partOfSpeech="(\w)"[^>]*lexfile="([^"]+)"/))) { syn = { pos: m[2], lexfile: m[3], def: '', hyper: [], topic: [], whole: [] }; synsets.set(m[1], syn); continue; }
  if (syn && (m = line.match(/<Definition>(.*)<\/Definition>/))) { if (!syn.def) syn.def = unesc(m[1]); continue; }
  if (syn && (m = line.match(/<SynsetRelation relType="([a-z_]+)" target="([^"]+)"/))) {
    const [, rel, t] = m;
    if (rel === 'hypernym' || rel === 'instance_hypernym') syn.hyper.push(t);
    // (A member's topic is its domain_topic, an up link: a verdict's is law. has_domain_topic is the domain's list of
    // its members, a down link; kept, law spread through every legal term.)
    else if (rel === 'domain_topic') syn.topic.push(t);
    else if (rel === 'holo_part' || rel === 'holo_member' || rel === 'holo_substance') syn.whole.push(t);
    continue;
  }
  if (/<\/Synset>/.test(line)) syn = null;
}

// Nouns only in the network; index them.
const nounIds = [...synsets].filter(([, s]) => s.pos === 'n').map(([id]) => id);
const idx = new Map(nounIds.map((id, i) => [id, i]));
const nouns = nounIds.map((id) => synsets.get(id));

// Lemma -> noun synsets in sense order; a sense id -> its synset (for derivations).
const senseSyn = new Map();
for (const e of entries) for (const s of e.senses) senseSyn.set(s.id, s.synset);
const lex = Object.create(null); // lemma (lowercase) -> [noun idx...]
const via = Object.create(null); // a verb's or an adjective's lemma -> the nouns it derives from or to
const firstName = new Array(nouns.length).fill('');
for (const e of entries) {
  const key = e.lemma.toLowerCase();
  if (e.pos === 'n') {
    for (const s of e.senses) { const i = idx.get(s.synset); if (i === undefined) continue; (lex[key] ??= []).includes(i) || lex[key].push(i); if (!firstName[i]) firstName[i] = e.lemma; }
  } else {
    for (const s of e.senses) for (const d of s.derivs) { const i = idx.get(senseSyn.get(d)); if (i !== undefined) { (via[key] ??= []); if (!via[key].includes(i)) via[key].push(i); } }
  }
}
// Descendant counts (for specificity), over hypernym links.
const parents = nouns.map((s) => s.hyper.map((h) => idx.get(h)).filter((x) => x !== undefined));
const children = nouns.map(() => []);
parents.forEach((ps, i) => ps.forEach((p) => children[p].push(i)));
const desc = new Array(nouns.length).fill(0);
const seen = new Uint8Array(nouns.length);
const count = (i) => { if (seen[i]) return desc[i]; seen[i] = 1; let n = 1; for (const c of children[i]) n += count(c); desc[i] = n; return n; };
for (let i = 0; i < nouns.length; i++) count(i);

// A definition's nouns: words of the definition that are noun lemmas (singular), stop words out.
const STOP = new Set('a an the of or and to in on for with by as at from that which who is are be it its this one any some something someone thing things kind sort type part used use using especially usually often made make form way place act state quality person people being having has have not no more most other such than into out up over'.split(' '));
// (s before es: games is game, not gam.)
const sing = (w) => (lex[w] ? w : w.endsWith('ies') && lex[w.slice(0, -3) + 'y'] ? w.slice(0, -3) + 'y' : w.endsWith('s') && lex[w.slice(0, -1)] ? w.slice(0, -1) : w.endsWith('es') && lex[w.slice(0, -2)] ? w.slice(0, -2) : null);
const lemmaList = Object.keys(lex);
const lemmaIdx = new Map(lemmaList.map((l, i) => [l, i]));
const defNouns = nouns.map((s) => {
  const out = [];
  // Three- and two-word names whole ("body of water", "law court", "pool table"): split, body was the human body.
  const ws = s.def.toLowerCase().match(/[a-z][a-z'-]+/g) ?? [];
  const add = (l) => { const i = lemmaIdx.get(l); if (i !== undefined && !out.includes(i)) out.push(i); };
  for (let i = 0; i < ws.length; i++) {
    const three = i + 2 < ws.length ? `${ws[i]} ${ws[i + 1]} ${ws[i + 2]}` : '', two = i + 1 < ws.length ? `${ws[i]} ${ws[i + 1]}` : '';
    if (three && lex[three]) { add(three); i += 2; continue; }
    if (two && lex[two]) { add(two); i++; continue; }
    if (STOP.has(ws[i])) continue;
    const l = sing(ws[i]); if (l !== null) add(l);
  }
  return out;
});

const data = {
  source: 'Open English WordNet 2025 (CC BY 4.0), https://github.com/globalwordnet/english-wordnet',
  n: nouns.length,
  names: firstName,
  lexfile: nouns.map((s) => s.lexfile.replace('noun.', '')),
  parents,
  topic: nouns.map((s) => s.topic.map((t) => idx.get(t)).filter((x) => x !== undefined)),
  whole: nouns.map((s) => s.whole.map((t) => idx.get(t)).filter((x) => x !== undefined)),
  desc,
  defs: nouns.map((s) => s.def),
  defNouns,
  lemmas: lemmaList,
  senses: lemmaList.map((l) => lex[l]),
  via: Object.fromEntries(Object.entries(via).filter(([k]) => !lex[k])),
};
writeFileSync(new URL('../data/nouns.json.gz', import.meta.url), gzipSync(JSON.stringify(data), { level: 9 }));
console.log(`noun synsets ${nouns.length}, noun lemmas ${lemmaList.length}, other words via derivation ${Object.keys(data.via).length}`);
