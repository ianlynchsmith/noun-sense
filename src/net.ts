/**
 * noun-sense: which sense of a noun a passage means, by where its other words' meanings converge.
 *
 * Every noun in the passage climbs its hierarchy ("a fork is a utensil, a utensil is a tool…"), each step up worth
 * less, and lights the concepts it passes. Each sense of the word in question has a signature made the same way:
 * the concepts above it, and above the nouns of its definition (a bar is "an establishment where alcoholic drinks are
 * served", so a passage about beer finds it). The sense whose signature the passage lights most is the one meant.
 *
 * The method is Ian Lynch Smith's (Vassar thesis, 1992): a hierarchy of head nouns from a dictionary, climbed for every
 * noun in a passage to see where they overlap. From later work: a concept counts by how specific it is (Resnik 1995:
 * "entity" and "object" are above everything and say nothing), a sense's definition widens its signature (Lesk 1986),
 * and a word's commoner senses come first.
 */

export interface NounData {
  source: string;
  n: number;
  names: string[];
  lexfile: string[];
  parents: number[][];
  topic: number[][];
  whole: number[][];
  desc: number[];
  defs?: string[];
  defNouns: number[][];
  lemmas: string[];
  senses: number[][];
  via: Record<string, number[]>;
}

export interface Sense { id: number; name: string; lexfile: string; definition?: string }
export interface Choice extends Sense { score: number }
export interface Ranked { word: string; best: Choice | null; ranked: Choice[]; /** How far ahead the best is, 0–1 (0: a tie or no evidence); not a confidence. */ margin: number; /** The passage said enough (the best score reaches TUNE.sure): otherwise keep the caller's default. */ confident: boolean }

type Act = Map<number, number>;

/** Each step up the hierarchy is worth this much of the one below. */
export const TUNE = {
  decay: 0.6,
  /** A topic or a part-of link is worth this much of a parent. */
  side: 0.5,
  /** A definition's noun lends its signature this much. */
  def: 0.6,
  /** How much a word's commoner senses outweigh its rarer ones in a passage: sense j counts 1/(j+1)^this. */
  prior: 2,
  /** …and among the candidates: a rarer sense needs more evidence (score × 1/(rank+1)^this). */
  candPrior: 0.6,
  /** A passage's word lights its definition's nouns too, not only what's above it (this much: 0 = climb only). */
  ctxDef: 0,
  /** A sense's score is divided by its signature's size to this power (1: a thin signature isn't helped, 0: not at all). */
  normPow: 0.6,
  /** Rounds in which the passage's own words settle their senses by agreeing with one another (0: each word keeps
   *  its commonest-first weights). The owner's point: the more nouns, the more their higher concepts agree. */
  rounds: 1,
  /** How hard a round leans on agreement (a sense's weight × agreement^this). */
  agree: 1,
  /** A passage word whose definition names the word in question lends that definition's nouns this much: a teller is
   *  "an employee of a bank who receives and pays out money", so a teller in the passage counts for money, for a bank. */
  bridge: 1,
  /** Below this best score the passage hasn't said enough: `confident` is false (measured on screenplay scenes,
   *  2026-10-23: at 1.0 or more 30/30 right, 0.05–0.2 near a coin toss). The margin between senses is not a confidence. */
  sure: 0.2,
};
const MAX_DEPTH = 14;

const STOP = new Set(('a an the of or and to in on for with by as at from that which who whom whose is are was were be been being it its this these those one ones any some ' +
  'something someone thing things kind sort type part way place time times people person man woman men women he she they them his her their him we us our you your i me my ' +
  'not no yes all each every both few many much more most other such than then there here into out up down over off again very just only also too so can could would should will ' +
  'may might must shall do does did done have has had get gets got go goes went come comes came see sees saw look looks looked back front side end top day night moment ' +
  'int ext cont continuous later same')
  .split(' '));

/** Lexicographer files that are never an answer to "what is this about". */
const NOT_ABOUT = new Set(['time', 'quantity', 'Tops', 'relation', 'shape']);

export class NounNet {
  readonly d: NounData;
  private lemmaIdx = new Map<string, number>();
  private spec: Float32Array;
  /** Forget cached signatures (after changing TUNE). */
  reset() { this.sigCache.clear(); }
  private sigCache = new Map<number, Act>();

  constructor(d: NounData) {
    this.d = d;
    d.lemmas.forEach((l, i) => this.lemmaIdx.set(l, i));
    const N = d.n, logN = Math.log(N);
    this.spec = new Float32Array(N);
    for (let i = 0; i < N; i++) this.spec[i] = Math.max(0, Math.log(N / d.desc[i]) / logN);
  }

  /** A word as the network knows it: itself, or its singular (fork, forks; city, cities; glass, glasses). */
  lemma(word: string): string | null {
    const w = word.toLowerCase();
    const ok = (x: string) => this.lemmaIdx.has(x) || x in this.d.via;
    if (ok(w)) return w;
    for (const [a, b] of [['ies', 'y'], ['ves', 'f'], ['ves', 'fe'], ['s', ''], ['es', ''], ["'s", '']] as const) if (w.endsWith(a) && ok(w.slice(0, -a.length) + b)) return w.slice(0, -a.length) + b;
    return null;
  }

  /** The noun senses of a word, commonest first; a verb or an adjective, the nouns it's made from or makes. */
  sensesOf(word: string): number[] {
    const l = this.lemma(word);
    if (l === null) return [];
    const i = this.lemmaIdx.get(l);
    return i !== undefined ? this.d.senses[i] : this.d.via[l] ?? [];
  }

  sense(id: number, withDefinition = true): Sense {
    return { id, name: this.d.names[id], lexfile: this.d.lexfile[id], ...(withDefinition && this.d.defs ? { definition: this.d.defs[id] } : {}) };
  }

  /** Climb from one concept: it and everything above it, each step worth less; a topic or a whole one step aside. */
  private climb(from: number, w0: number, out: Act) {
    const stack: [number, number, number][] = [[from, w0, 0]];
    while (stack.length) {
      const [i, w, depth] = stack.pop()!;
      if ((out.get(i) ?? 0) >= w) continue;
      out.set(i, w);
      if (depth >= MAX_DEPTH) continue;
      for (const p of this.d.parents[i]) stack.push([p, w * TUNE.decay, depth + 1]);
      if (depth < 2) for (const t of [...this.d.topic[i], ...this.d.whole[i]]) stack.push([t, w * TUNE.side, depth + 1]);
    }
  }

  /** One word's light: each of its senses climbed, the commoner ones brighter (the first counts most). */
  private wordAct(senses: number[], w = 1, withDefs = false): Act {
    const out: Act = new Map();
    const prior = senses.map((_, j) => 1 / (j + 1) ** TUNE.prior);
    const sum = prior.reduce((a, b) => a + b, 0);
    senses.forEach((s, j) => {
      const ws = (w * prior[j]) / sum;
      this.climb(s, ws, out);
      if (withDefs && TUNE.ctxDef > 0) for (const li of this.d.defNouns[s] ?? []) {
        const first = this.d.senses[li]?.[0];
        if (first !== undefined && first !== s) this.climb(first, ws * TUNE.ctxDef, out);
      }
    });
    return out;
  }

  /** The words of a passage: lowercase, two-word names first ("tennis court", "swimming pool"). */
  tokens(text: string): string[] {
    const ws = text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
    const out: string[] = [];
    for (let i = 0; i < ws.length; i++) {
      const two = i + 1 < ws.length ? `${ws[i]} ${ws[i + 1]}` : '';
      if (two && this.lemma(two)) { out.push(two); i++; continue; }
      if (!STOP.has(ws[i]) && ws[i].length > 2) out.push(ws[i]);
    }
    return out;
  }

  /** What a passage lights: every distinct word's climb, added up. */
  context(words: string[], skip: Set<string> = new Set(), targets: string[] = []): Act {
    return this.lit(words, skip, targets).total;
  }

  /** The passage's light, and each of its words' share of it. */
  lit(words: string[], skip: Set<string> = new Set(), targets: string[] = []): { total: Act; parts: { word: string; act: Act; senses: number[]; w: number[] }[] } {
    const named = targets.length && TUNE.bridge > 0 ? new RegExp(`\\b(?:${targets.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})s?\\b`, 'i') : null;
    const bridges: Act[] = [];
    // Each distinct word, its senses, and their weights (commonest first to start).
    const ws: { word: string; senses: number[]; w: number[] }[] = [];
    const seen = new Set<string>();
    for (const word of words) {
      const l = this.lemma(word);
      if (l === null || seen.has(l) || skip.has(l)) continue;
      seen.add(l);
      const senses = this.sensesOf(l);
      if (!senses.length) continue;
      const prior = senses.map((_, j) => 1 / (j + 1) ** TUNE.prior);
      const sum = prior.reduce((a, b) => a + b, 0);
      ws.push({ word: l, senses, w: prior.map((p) => p / sum) });
      // (Gated: only a sense whose definition names the word in question, so a word's first-sense gloss doesn't spray.)
      if (named) for (const sn of senses) {
        if (!named.test(this.d.defs?.[sn] ?? '')) continue;
        const a: Act = new Map();
        for (const li of this.d.defNouns[sn] ?? []) {
          if (skip.has(this.d.lemmas[li])) continue;
          const ss = this.d.senses[li];
          if (ss?.length) for (const [k, v] of this.wordAct(ss, TUNE.bridge)) a.set(k, Math.max(a.get(k) ?? 0, v));
        }
        bridges.push(a);
      }
    }
    const light = (x: { word: string; senses: number[]; w: number[] }) => { const out: Act = new Map(); x.senses.forEach((sn, j) => this.climb(sn, x.w[j], out)); return out; };
    let maps = ws.map(light);
    const sumUp = () => { const t: Act = new Map(); for (const m of [...maps, ...bridges]) for (const [k, v] of m) t.set(k, (t.get(k) ?? 0) + v); return t; };
    let total = sumUp();
    // The words settle one another: each sense is weighted by how well it fits the rest of the passage.
    for (let r = 0; r < TUNE.rounds; r++) {
      ws.forEach((x, i) => {
        if (x.senses.length < 2) return;
        const own = maps[i];
        const rest: Act = { get: (k: number) => (total.get(k) ?? 0) - (own.get(k) ?? 0) } as unknown as Act;
        const fit = x.senses.map((sn) => this.score(sn, rest));
        const nw = x.w.map((w, j) => w * (1e-3 + fit[j]) ** TUNE.agree);
        const sum = nw.reduce((a, b) => a + b, 0);
        if (sum > 0) x.w = nw.map((v) => v / sum);
      });
      maps = ws.map(light);
      total = sumUp();
    }
    return { total, parts: ws.map((x, i) => ({ word: x.word, act: maps[i], senses: x.senses, w: x.w })) };
  }

  /** A sense's signature: what's above it, and above its definition's nouns. */
  signature(id: number): Act {
    const hit = this.sigCache.get(id);
    if (hit) return hit;
    const out: Act = new Map();
    this.climb(id, 1, out);
    for (const li of this.d.defNouns[id] ?? []) {
      const senses = this.d.senses[li];
      if (!senses?.length || senses.includes(id)) continue;
      for (const [k, v] of this.wordAct(senses, TUNE.def)) out.set(k, Math.max(out.get(k) ?? 0, v));
    }
    this.sigCache.set(id, out);
    return out;
  }

  /** How much of a sense's signature the passage lights (specific concepts count most). */
  score(id: number, ctx: Act): number {
    const sig = this.signature(id);
    let dot = 0, norm = 0;
    for (const [k, v] of sig) {
      const s = this.spec[k], wv = v * s;
      norm += wv * wv;
      const c = ctx.get(k);
      if (c) dot += wv * c * s;
    }
    return norm ? dot / Math.sqrt(norm) ** TUNE.normPow : 0;
  }

  /**
   * Which sense of `word` the passage means. `among` limits the choice (sense ids, from `sensesOf` or `find`); the
   * word itself and `skip` don't count as evidence.
   */
  choose(word: string, passage: string | string[], opts: { among?: number[]; skip?: string[] } = {}): Ranked {
    const l = this.lemma(word) ?? word.toLowerCase();
    const candidates = opts.among ?? this.sensesOf(l);
    const words = Array.isArray(passage) ? passage : this.tokens(passage);
    const ctx = this.context(words, new Set([l, ...(opts.skip ?? []).map((s) => this.lemma(s) ?? s)]), [l]);
    const own = this.sensesOf(l);
    // (Commoner senses first only when choosing among all of a word's senses: WordNet's order is its texts', and a
    // caller's own candidates, a script's places, aren't ranked by it: riverbank is bank's first sense.)
    const rank = (id: number) => { if (opts.among) return 0; const j = own.indexOf(id); return j < 0 ? 0 : j; };
    const ranked = candidates.map((id) => ({ ...this.sense(id), score: this.score(id, ctx) / (rank(id) + 1) ** TUNE.candPrior })).sort((a, b) => b.score - a.score);
    const [a, b] = ranked;
    const margin = !a || a.score <= 0 ? 0 : b ? (a.score - b.score) / a.score : 1;
    return { word: l, best: a && a.score > 0 ? a : null, ranked, margin, confident: !!a && a.score >= TUNE.sure };
  }

  /**
   * What a passage is about: the concepts its nouns converge on. A concept counts by the light it gathers from
   * different words (at least `minWords` of them) times how specific it is, so "entity" never wins and neither does one
   * word's own meaning; each one taken leaves out its ancestors and descendants, so the list isn't one idea five times.
   */
  about(passage: string | string[], opts: { top?: number; minWords?: number; specPow?: number } = {}): { id: number; name: string; lexfile: string; definition?: string; score: number; words: string[] }[] {
    const top = opts.top ?? 8, specPow = opts.specPow ?? 1.5;
    const words = Array.isArray(passage) ? passage : this.tokens(passage);
    const lit = this.lit(words);
    // Each word through the sense the passage settled on (a near tie shared): company is the business here, not the
    // army's unit, so "armed forces" isn't lit by every article that says company, major and fight.
    const parts = lit.parts.map((x) => {
      const best = Math.max(...x.w), keep = x.senses.map((sn, j) => [sn, x.w[j]] as const).filter(([, w]) => w >= best * 0.8);
      const act: Act = new Map();
      for (const [sn, w] of keep) this.climb(sn, w / keep.reduce((a, [, b]) => a + b, 0), act);
      return { word: x.word, act };
    });
    const total: Act = new Map();
    for (const x of parts) for (const [k, v] of x.act) total.set(k, (total.get(k) ?? 0) + v);
    const minWords = opts.minWords ?? Math.min(3, Math.max(2, Math.round(parts.length / 40)));
    const scored: { id: number; score: number; words: [string, number][] }[] = [];
    for (const [k, v] of total) {
      const from = parts.filter((x) => (x.act.get(k) ?? 0) > 0.02).map((x) => [x.word, x.act.get(k)!] as [string, number]);
      if (from.length < minWords) continue;
      // (Dates, numbers and the top of the tree are dimensions of a passage, never what it's about.)
      if (NOT_ABOUT.has(this.d.lexfile[k])) continue;
      scored.push({ id: k, score: v * this.spec[k] ** specPow, words: from.sort((a, b) => b[1] - a[1]) });
    }
    scored.sort((a, b) => b.score - a.score);
    const above = (i: number) => { const out = new Set<number>(); const st = [i]; while (st.length) { const x = st.pop()!; for (const p of this.d.parents[x]) if (!out.has(p)) { out.add(p); st.push(p); } } return out; };
    const taken: { id: number; up: Set<number> }[] = [];
    const out = [];
    for (const c of scored) {
      if (out.length >= top) break;
      const up = above(c.id);
      if (taken.some((t) => t.up.has(c.id) || up.has(t.id))) continue;
      taken.push({ id: c.id, up });
      out.push({ ...this.sense(c.id), score: c.score, words: c.words.slice(0, 5).map(([w]) => w) });
    }
    return out;
  }

  /**
   * How close two words are, 0–1: the best pair of their senses, by how much their signatures share (specific concepts
   * counting most). sage–soup is high through the herb; sage–philosopher through the wise man.
   */
  related(a: string, b: string): { score: number; a: Sense | null; b: Sense | null } {
    let best = { score: 0, a: null as Sense | null, b: null as Sense | null };
    for (const x of this.sensesOf(a).slice(0, 8)) for (const y of this.sensesOf(b).slice(0, 8)) {
      const sx = this.signature(x), sy = this.signature(y);
      let dot = 0, nx = 0, ny = 0;
      for (const [k, v] of sx) { const s2 = this.spec[k] ** 2; nx += v * v * s2; const w = sy.get(k); if (w) dot += v * w * s2; }
      for (const [k, v] of sy) ny += v * v * this.spec[k] ** 2;
      const c = nx && ny ? dot / Math.sqrt(nx * ny) : 0;
      if (c > best.score) best = { score: c, a: this.sense(x), b: this.sense(y) };
    }
    return best;
  }

  /** Senses whose name or definition says this (for naming candidates: find('court', 'law') → the court of law). */
  find(word: string, hint = ''): number[] {
    const ids = this.sensesOf(word);
    if (!hint) return ids;
    const h = hint.toLowerCase();
    return ids.filter((id) => this.d.names[id].toLowerCase().includes(h) || (this.d.defs?.[id] ?? '').toLowerCase().includes(h));
  }
}
