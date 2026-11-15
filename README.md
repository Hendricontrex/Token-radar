# Token Radar — which protocol without a token would be worth the most if it launched one?

A [make.fun](https://make.fun) bounty entry (`token-radar-01`): a token launch radar built from a
sealed snapshot of every protocol DefiLlama tracks. It finds the protocols that still record no token,
ranks them by an implied value, and shows a reader how to farm each one.

## What it does

`main.ts` (Node 22, standard library only) reads the sealed snapshot, scores every pre-token protocol
with the model in `lib/model.ts`, and writes:

- `board.json` — the ranked board (200 rows: the 40-protocol watchlist plus 160 early rows below it)
- `data.js` — the same board for the dashboard
- `dashboard/` — a static page (no network): board, detail view, filters, live-token comparison
- `screenshots/` — the board, a detail view and a filtered view
- `dossier.json` — the summary the judge reads, built by `vendor/makefun-board.ts`

## The model (radar-2)

Implied value follows only from the snapshot's own figures, and no protocol name is special-cased:

```
implied = round( tvl_usd x baseMultiple x categoryFactor x chainFactor
                 x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
                 x (0.6 + min(age_days, 1095) / 1095 x 0.4) )
```

- **baseMultiple** — the median FDV/TVL of the snapshot's own live-token protocols (0.1689 here).
  A median, so one outlier cannot move it.
- **categoryFactor** — the protocol's sector median FDV/TVL over the global median, clamped to
  [0.70, 1.30]; 1.00 when its sector has fewer than 3 live-token protocols. Bridges trade rich,
  stakers trade cheap; the market prices sectors differently, and the factor carries that.
- **chainFactor** — +2% per chain beyond the first, to +10%.
- **growth** — seven-day TVL change, clamped, half-weighted.
- **maturity** — how long the protocol has run with no token (age unknown: 365 days).

Live-token protocols are set aside with their market caps shown, never mixed into the ranking.
Each row carries a six-step farm plan (action, cost, time) derived from the protocol's own record.

## Run it

```sh
# the grader mounts the sealed snapshot at /input; locally, point at a copy:
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
```

Then open `out/dashboard/index.html`. No build step, no install, no network.

## License

MIT. See `LICENSE`.
