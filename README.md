# noun-sense

Which sense of a noun a passage means, by where the passage's other nouns converge.

```
$ noun-sense sage "the sage is in the soup"
sage → sage: aromatic fresh or dried grey-green leaves used widely as seasoning for meats and fowl and game etc

$ noun-sense sage "the sage gave his disciples advice about the meaning of life"
sage → sage: a mentor in spiritual and philosophical topics who is renowned for profound wisdom

$ noun-sense bank "she hands the teller her deposit slip and counts the cash"
bank → bank: a financial institution that accepts deposits and channels the money into lending activities
```

Small, fast, deterministic, no model and no network: a 3.6 MB data file and a few hundred lines of TypeScript. It runs
in Node or a browser.

## The method

The idea is Ian Lynch Smith's, from his Vassar thesis (1992):

1. **Build the hierarchy.** Take a dictionary and build a hierarchy from every noun's head noun ("a fork is a utensil,
   a utensil is a tool, a tool is an object…"). The result is a small, fast, static network over all the nouns.
2. **Climb it for every noun in the passage** and see where the climbs overlap. A paragraph set on a river climbs to
   water and terrain. One about a bar called River Dance climbs to business and alcohol.
3. **Take the sense that's most activated.** "Sage" and "soup" meet at food; a wise man and soup don't meet at all.
   The longer the passage, the more the nouns' higher concepts agree.

The hierarchy here is Open English WordNet's (71,864 noun concepts), so step 1 comes ready made. The scoring adds what
the later literature learnt:

- **Specificity.** A concept counts by how specific it is. "Entity" and "object" are above everything and say
  nothing (cf. Resnik 1995).
- **Signatures from definitions.** A sense's signature includes what's above the nouns of its definition, the thesis's
  head-noun idea used directly. A bar is "an establishment where alcoholic drinks are served", so a passage about beer
  finds it (cf. Lesk 1986).
- **A gated bridge.** A passage word whose definition names the word in question lends its definition. A teller is "an
  employee of a bank who receives and pays out money", so a teller counts for a bank.
- **Mutual agreement.** One gentle round in which the passage's own words settle their senses by agreeing with one
  another.
- **Sense order.** A word's commoner senses count first when the choice is open. A caller's own candidates aren't
  ranked by WordNet's order.

## Use

```
npm install -g noun-sense          # or: npx noun-sense …
noun-sense <word> <passage…>       # the sense meant, and the runners-up
noun-sense <word> - < article.txt  # the passage from stdin
noun-sense court --senses          # list a word's senses
noun-sense court "…" --among "law,game"   # choose only among senses whose name or definition has these
noun-sense bank "…" --json
```

```ts
import { loadNet } from 'noun-sense';
const net = loadNet();
const r = net.choose('pool', sceneText, { among: [...net.find('pool', 'swimming'), ...net.find('poolroom')] });
r.best;       // the sense: { id, name, lexfile, definition, score }
r.confident;  // the passage said enough; otherwise keep your own default
```

`net.find(word, hint)` names candidates. A caller choosing between its own readings (rooms, places, products) does best
to give the concepts it means as `among`: the place, not the activity ("poolroom", not "pocket billiards").

## How well it works

Measured on screenplay scenes (2026-10-23). The heading's qualifier was hidden ("TENNIS COURT", "POOL HALL",
"RECORDING STUDIO", "FIRST NATIONAL BANK"), leaving only the bare word and the scene's own text:

| | right |
|---|---|
| each place from all its scenes together | 52 / 57 (91%) |
| the same, action lines only (no dialogue) | 50 / 57 |
| one scene at a time, held-out scripts | 83% averaged over the readings |
| always taking WordNet's commonest sense | 0% for bank, studio and pool hall |

Thirty hand-written passages: 23 / 30 (commonest sense: 11 / 30). `npm test` runs them.

More text is better: scenes with 10–20 content words were right 97% of the time, and fewer than 10 words 81%.
Dialogue is a noisier context than reportage. `confident` is false when the best score is under 0.2; there it's close
to a coin toss. The margin between senses is not a confidence.

Limits:

- It chooses among a word's senses. A name (a bar called River Dance) isn't one.
- WordNet's senses are finer than homonyms. Give `among` when only some readings matter.

## Data

`data/nouns.json.gz` is built from Open English WordNet 2025 by `npm run data -- english-wordnet-2025.xml.gz` (LMF XML
from https://github.com/globalwordnet/english-wordnet/releases). Code is MIT; the data is CC BY 4.0 with the WordNet
notice, see [NOTICE](NOTICE).

## Credits

- **The method:** Ian Lynch Smith, Vassar College thesis, 1992.
- **Engine:** written with Claude (Anthropic), including the build fixes, the gated bridge and the confidence rule.
- **Data:** Open English WordNet, McCrae et al. (2019).
