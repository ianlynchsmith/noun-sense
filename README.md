# noun-sense

Which sense of a noun an article means, and what the article is about, by where all its nouns converge.

It's built for whole texts: a news article, a report, a chapter, a scene. The method comes from a thesis tested on news
articles, more than 90% right on homonyms. Every noun in the text is evidence, so more text is better.

```
$ noun-sense bank - < merger-story.txt
bank → bank: a financial institution that accepts deposits and channels the money into lending activities

$ noun-sense --about - < shaq-fragrance-story.txt
  0.76  name  ← name, signature
  0.45  capitalist  ← investor, owner, retailer
  0.38  business  ← partnership, restaurant
  0.23  mercantile establishment  ← release, shelf
```

A sentence works too when it has nouns enough to go on:

```
$ noun-sense sage "the sage is in the soup"
sage → sage: aromatic fresh or dried grey-green leaves used widely as seasoning for meats and fowl and game etc

$ noun-sense sage "the sage gave his disciples advice about the meaning of life"
sage → sage: a mentor in spiritual and philosophical topics who is renowned for profound wisdom
```

Small, fast, deterministic, no model and no network: a 3.6 MB data file and a few hundred lines of TypeScript. It runs
in Node or a browser.

## The method

The idea is Ian Lynch Smith's, from his Vassar thesis (1992). Its first goal was to disambiguate the homonyms in
news articles, its second to find what an article is about. Both come from the same climb:

1. **Build the hierarchy.** Take a dictionary and build a hierarchy from every noun's head noun ("a fork is a utensil,
   a utensil is a tool, a tool is an object…"). The result is a small, fast, static network over all the nouns.
2. **Climb it for every noun in the article** and see where the climbs overlap. An article set on a river climbs to
   water and terrain. One about a bar called River Dance climbs to business and alcohol.
3. **Take the sense that's most activated.** "Sage" and "soup" meet at food; a wise man and soup don't meet at all.
   The longer the article, the more its nouns' higher concepts agree. A sentence has a few nouns to go on; an
   article has hundreds.

4. **What the article is about** is where the climbs converge most: the concepts that many different nouns reach.
   A basketball star launching a cologne is a little about basketball and mostly about business and fashion
   (`about()`, below).

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

Install with `npm install github:ianlynchsmith/noun-sense` (it builds itself), or run it without installing:
`npx github:ianlynchsmith/noun-sense sage "the sage is in the soup"`. Node 22.6 or later.

### Command line

```
noun-sense <word> <passage…>              # the sense meant, and the runners-up
noun-sense <word> - < article.txt         # the passage from stdin
noun-sense court --senses                 # list a word's senses
noun-sense court "…" --among "law,game"   # choose only among senses whose name or definition has these
noun-sense --about - < article.txt        # what a passage is about
noun-sense bank "…" --json                # any of these as JSON
```

### Library

```ts
import { loadNet } from 'noun-sense';                  // Node: reads the bundled data
// import { loadNetFromUrl } from 'noun-sense/browser'; // browser: await loadNetFromUrl('/nouns.json.gz')
const net = loadNet();

net.choose('bank', text);                                // { best, ranked, margin, confident }
net.choose('pool', text, { among: [...net.find('pool', 'swimming'), ...net.find('poolroom')] });
net.about(text);                                         // [{ name, definition, score, words }] — what it converges on
net.related('sage', 'soup');                             // { score 0–1, a, b } — the closest pair of senses (rough)
net.sensesOf('court');                                   // sense ids, commonest first
net.sense(id);                                           // { id, name, lexfile, definition }
net.find('court', 'law');                                // senses whose name or definition has "law"
net.lemma('glasses');                                    // the word as the network knows it
```

- **`choose`.** `best` is the sense with its `score`. `confident` is false when the passage said too little: keep your
  own default then. `margin` (how far ahead the best is) is not a confidence.
- **`among`.** A caller choosing between its own readings (rooms, places, products) does best to give the concepts it
  means as `among`: the place, not the activity ("poolroom", not "pocket billiards"). With `among`, WordNet's
  commonest-first order isn't applied, since it's the order of WordNet's own texts, not yours.
- **Tuning.** `TUNE` holds the weights. The defaults were tuned on half of a set of screenplay scenes and checked on
  the other half.

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

### What a news article is about

`about()` climbs every noun of an article and reports the concepts that several different nouns converge on. Each word
counts through the sense the article settled for it, and dates and numbers are left out. Ten articles, fetched
2026-10-23, with the top concepts it found (the words behind each in brackets):

| article | what it found |
|---|---|
| [Shaquille O'Neal launches a signature fragrance at JCPenney](https://mr-mag.com/shaquille-oneal-launches-first-signature-fragrance-available-only-at-jcpenney/) (98 words) | capitalist (investor, owner, retailer); business (partnership, restaurant); mercantile establishment; commodity. **Business, not basketball.** |
| [Jayson Tatum, the face of Coach's men's fragrance](https://www.hollywoodreporter.com/lifestyle/style/jayson-tatum-boston-celtics-coach-fragrance-interview-1236193242/) (1,183) | odour (smell, scent, fragrance); leather; wood (woody, cedar), the scent's notes; armed forces (fight, war, strategy), his playoff metaphors |
| [Two Upper Peninsula banks sign a merger agreement](https://www.wnmufm.org/business/2026-06-25/two-up-banks-sign-merger-agreement) (148) | bank; administrator (executive, director); merging; enterprise (corporation, bank) |
| [Holiday airfares soar with jet fuel near a record](https://text.npr.org/nx-s1-6009506) (688) | cost (expense, fare, airfare); travel (trip, flying); dealing (deal, trade, industry). Also armed forces (prepared, major, pass), a miss. |
| [Europe's heat claims 50,000 lives](https://text.npr.org/g-s1-149498) (923) | degree (intense, extreme, high); environment; temperature change (climate change, warming); math (equation, statistics) |
| [Tom Skerritt, who played dads, cops and commanding officers, has died](https://text.npr.org/981035400) (240) | armed forces (commanding officer, captain, veteran); film (movie); military personnel; law officer (sheriff, cop) |
| [Your guide to stain removal](https://text.npr.org/789172148) (626) | condiment (vinegar, salad dressing, mayonnaise); liquid (ink, ammonia, red wine); edible fruit (berry, grape); stain; colour; garment (shirt, sleeve) |
| [Brazil's runoff: Lula's legacy vs. Bolsonaro's dynasty](https://text.npr.org/nx-s1-6004277) (630) | triumph (victory, win, sweep); difference (inequality, gap); competition (race, campaign). Also armed forces (major, fight, division), a miss. |
| [Hacking attempts rise after flaws found in a program used by 70% of websites](https://text.npr.org/g-s1-149503) (445) | computer science (programming language, software, website, hacker, internet); difficulty (severe, crisis, urgent); organisation (government) |
| [See how Big Tech is transforming Spain's landscape](https://text.npr.org/nx-s1-5991641) (1,568) | economic system (economy, capitalism); people (population, public); air current (wind, thermal); bird of prey (vulture, osprey, golden eagle), the article's wildlife on the plains |

It gets the gist of most of them. Most clearly, the basketball stars' fragrance launches come out as business and
fragrance, not sport. The misses are of two kinds:
- **Common words' rare senses.** Major, fight, pass and division are all military; "armed forces" turns up in three
  articles.
- **The body's parts** in long articles.

Limits:

- It chooses among a word's senses. A name (a bar called River Dance) isn't one.
- WordNet's senses are finer than homonyms. Give `among` when only some readings matter.
- `related()` is a rough measure: court–tennis comes out through the law court.

## Data

`data/nouns.json.gz` is built from Open English WordNet 2025 by `npm run data -- english-wordnet-2025.xml.gz` (LMF XML
from https://github.com/globalwordnet/english-wordnet/releases). Code is MIT; the data is CC BY 4.0 with the WordNet
notice, see [NOTICE](NOTICE).

## Credits

- **The method:** Ian Lynch Smith, Vassar College thesis, 1992.
- **Engine:** written with Claude (Anthropic), including the build fixes, the gated bridge and the confidence rule.
- **Data:** Open English WordNet, McCrae et al. (2019).
