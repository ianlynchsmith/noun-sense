// The public API's promises, checked: node --experimental-strip-types test/api.ts
import assert from 'node:assert/strict';
import { loadNet } from '../src/load.ts';
const net = loadNet();
const sage = (t: string) => net.choose('sage', t).best?.definition ?? '';
assert.match(sage('the sage is in the soup'), /seasoning/);
assert.match(sage('the sage gave his disciples advice about the meaning of life'), /wisdom/);
assert.ok(net.related('sage', 'soup').score > net.related('sage', 'bicycle').score, 'sage is nearer soup than a bicycle');
assert.match(net.related('sage', 'philosopher').a?.definition ?? '', /wisdom/);
const court = net.choose('court', 'The judge enters and the jury rises; the defendant sits beside his lawyer.', { among: [...net.find('court', 'law'), ...net.find('court', 'game')] });
assert.match(court.best?.definition ?? '', /judg|law/);
assert.equal(net.lemma('games'), 'game');
assert.equal(net.lemma('glasses'), 'glasses');
const about = net.about('The bank agreed to merge with a rival lender; shareholders, regulators and the board of directors approved the deal and its executives.');
assert.ok(about.some((a) => /bank|enterprise|business|financ/.test(`${a.name} ${a.definition}`)), 'a bank merger is about banking');
console.log('api: ok');
