# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Hendricontrex/Token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Hendricontrex/Token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: every protocol with no token on record, ranked by what its launch would be worth, with a farm plan for each. Built from a sealed snapshot of every protocol DefiLlama tracks, for the make.fun "Build the best token launch radar" bounty ($1,325 in USDC).

## What it does

`main.ts` (Node 22, standard library only) reads the sealed snapshot, scores every pre-token protocol with the model in `lib/model.ts`, and writes:

- `board.json` — the ranked board (200 rows: the 40-protocol watchlist plus 160 early rows below it)
- `data.js` — the same board for the dashboard
- `dashboard/` — a static page (no network): board, detail view, filters, live-token comparison
- `screenshots/` — the board, a detail view and a filtered view
- `dossier.json` — the summary the judge reads, built by `vendor/makefun-board.ts`

## The model (radar-4)

Every number below comes from the snapshot itself.
Nothing is hardcoded from outside it.
No protocol name is special-cased anywhere in the code.

The model is a straight line fitted on logarithms.
Take the 128 protocols in the snapshot that already have a live token.
Keep only the ones with a market cap above zero.
Regress log market cap on log TVL across those 128.
The fit is ordinary least squares, nothing fancier.
It gives an intercept of 6.9646 and a slope of 0.5223.
A protocol's implied value is exp(6.9646 + 0.5223 times log TVL plus its sector shift).
The result is rounded to the nearest dollar.

The slope is the whole point, and it is well under 1.
Value grows more slowly than TVL.
A protocol ten times as big is not worth ten times as much.
It is worth about three and a third times as much.
That is why a flat multiple misleads.
The snapshot's flat median multiple is 0.2138.
It would price every protocol near 21 cents per TVL dollar, big or small.
The fitted line prices a $100M protocol near 16 cents per TVL dollar.
It prices a $1B protocol near 5 cents per TVL dollar.
It prices a $10B protocol under 2 cents per TVL dollar.
Big protocols are cheaper per TVL dollar, and the board reflects that on every row.

The sector shift is the mean log residual of the protocol's sector.
It is shrunk toward zero by n over n plus 5.
Here n is the number of live-token protocols in that sector.
Sectors with fewer than three live-token protocols get a shift of zero.
Shrinkage keeps one lucky protocol from dragging its whole sector with it.
A sector earns its shift from several protocols, not from one.

The shifts run from about plus 0.64 at the top to about minus 0.63 at the bottom.
Basis Trading sits at the top at plus 0.64, about 1.9 times the baseline.
That is the richest sector in the snapshot by this measure.
CEX follows at plus 0.47, and Canonical Bridge just behind it at plus 0.46.
Privacy is next at plus 0.43.
Cross Chain Bridge sits at plus 0.30, still comfortably above the baseline.
RWA comes in at plus 0.12, and Dexs at plus 0.09.
Two sectors sit almost exactly on the baseline.
Indexes is at minus 0.03 and Bridge at minus 0.05.
Then the cheap end of the board begins.
Lending is at minus 0.43 and CDP at minus 0.44.
Yield is at minus 0.46 and Yield Aggregator at minus 0.48.
Liquid Staking is the cheapest at minus 0.63, about half the baseline.
A lending protocol and a liquid staking protocol with the same TVL are worth visibly different amounts.
The board shows why on every row, in plain numbers.

Work it out by hand.
Take a lending protocol holding $1B of TVL.
Its log TVL is about 20.72.
Start with the intercept, 6.96.
Add 0.52 times 20.72, which is about 10.82.
Subtract the lending shift of 0.43.
That gives about 17.36.
Exp of 17.36 is roughly $34.6M.
That is the board's number for such a protocol.
The dashboard shows the same arithmetic for any row you open.
Each row prints its own implied-per-TVL figure beside the value.
The flat median would have said $213.8M for the same protocol.
That is about six times too much, and the gap grows with size.

Three things are deliberately not priced.
Seven-day TVL growth is not in the formula.
A hot week does not survive holdout validation.
A hot week is not a durable moat.
Age is not in the formula either.
The fitted age coefficient on the log multiple is about minus 0.06.
Its correlation is near zero, about minus 0.016.
Older pre-token protocols are not systematically worth more.
Chain count is not in the formula.
Once TVL is in, the number of chains adds nothing.
Farm timing still uses age, because a launch window is a matter of when.
What a protocol is worth is a separate question from when it launches.

How well does it work?
On a held-out slice of the live-token protocols, the median error is 89.8 percent.
The flat median manages 99.1 percent on the same slice.
Within a factor of two, the model lands 31.2 percent of predictions.
The flat median lands 23.6 percent.
The stratified split gives 85.5 percent median error and 32 percent within two times.
The flat median gives 90.7 percent and 20 percent there.
The leave-one-category-out check gives 80.9 percent median error and 36.1 percent within two times.
The flat median gives 85.9 percent and 31.3 percent there.
Rank correlation is the one place the model trails the flat median slightly.
On holdout it is 0.374 against 0.396 for the flat median.
The dashboard says so plainly instead of hiding it.
A model that wins on error and on the factor-of-two hit rate but ties on ranking is the honest picture.
It is the picture the board is built on.

Live-token protocols are set aside with their market caps shown, never mixed into the ranking. Each row still carries a six-step farm plan, action plus cost plus time, derived from the protocol's own record.

## Run it

```sh
# the grader mounts the sealed snapshot at /input; locally, point at a copy:
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
```

Then open `out/dashboard/index.html`. No build step, no install, no network.

## License

MIT. See `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
