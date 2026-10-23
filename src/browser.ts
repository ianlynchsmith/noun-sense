import { NounNet, type NounData } from './net.ts';
export { NounNet, TUNE, type NounData, type Sense, type Choice, type Ranked } from './net.ts';

/** The network in a browser (or any runtime with fetch and DecompressionStream): from the URL you serve
 *  data/nouns.json.gz at (gzipped or not). */
export async function loadNetFromUrl(url: string | URL): Promise<NounNet> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`noun-sense: ${url}: ${res.status}`);
  const gz = String(url).endsWith('.gz') && res.headers.get('content-encoding') !== 'gzip';
  const text = await new Response(gz ? res.body.pipeThrough(new DecompressionStream('gzip')) : res.body).text();
  return new NounNet(JSON.parse(text) as NounData);
}
