import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { NounNet, type NounData } from './net.ts';

/** The network from the shipped data (data/nouns.json.gz), or from a path of your own build. */
export function loadNet(path: string | URL = new URL('../data/nouns.json.gz', import.meta.url)): NounNet {
  const raw = readFileSync(path);
  const json = String(path).endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
  return new NounNet(JSON.parse(json) as NounData);
}
