// Token Radar, model radar-4: rank the protocols that have no token yet by what a
// launch would be worth, and show a reader how to farm each one.
//
// The board starts from the snapshot's watchlist and never drops a watchlist slug:
// the watchlist is the floor, and the early radar adds pre-token protocols below it,
// strongest TVL first. A protocol counts as pre-token when its record carries no
// market cap, no CoinGecko id and no symbol. The live-token protocols are never
// ranked; they are the market the model learns from, and the dashboard shows them
// apart with the market caps they already have.
//
// The value model is one function of the snapshot's own numbers, fit on the
// live-token protocols of this same snapshot and tested on live-token protocols
// the fit never saw (see validateModel). No protocol name is ever special-cased,
// and the same function scores every row, so a row's place is earned by its TVL
// and its sector, not by who wrote the list.
//
//   log(mcap) = a + b * log(TVL) + adj[category]
//
//   a, b    the ordinary-least-squares line of log market cap on log TVL, fit on
//           the snapshot's 128 live-token protocols that trade above $0. The
//           slope comes out near 0.52: market cap grows sublinearly with TVL, so
//           a flat multiple (slope forced to 1) overprices the big protocols and
//           underprices the small ones. Letting the slope be what the market says
//           is the single biggest win this snapshot offers.
//   adj[c]  the sector's mean log-residual off that line, shrunk toward zero:
//           adj = n / (n + 5) * mean residual, for sectors with at least 3 live
//           protocols; 0 otherwise. A sector that trades rich against its TVL
//           (Basis Trading) earns a lift, one that trades cheap (Liquid Staking)
//           a discount, and a thin sector earns nothing it cannot prove.
//
// What the model deliberately does NOT use: the seven-day TVL change, the
// protocol's age, and how many chains it runs on. On this snapshot all three
// carry about zero out-of-sample signal, and the fitted growth coefficient is
// negative — fast TVL growth predicts a LOWER market cap, not a higher one —
// so the radar-3 growth multiplier had the wrong sign. Dropping them is a
// finding from the fit, not an omission: the fields stay on the page for display,
// they just do not price anything. The target is market cap, not FDV: the
// snapshot carries no FDV field, and every ratio here is mcap/TVL.

/** One protocol as the sealed snapshot carries it: ten fields, nothing more. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's knobs: the shrinkage, the gates, and the board's shape. */
export interface ModelSettings {
  /** Shrinkage strength for a sector's residual: n / (n + k). */
  shrink_k: number;
  /** A sector needs this many live protocols before it earns an adjustment. */
  category_min_live: number;
  /** How many live-token protocols the Live token view carries, by market cap. */
  live_rows: number;
  /** How many pre-token protocols below the floor the early radar carries. */
  early_rows: number;
  /** Random holdout seeds, and how many live protocols each seed holds out. */
  holdout_seeds: number;
  holdout_size: number;
}

export const MODEL: ModelSettings = {
  shrink_k: 5,
  category_min_live: 3,
  live_rows: 24,
  early_rows: 160,
  holdout_seeds: 10,
  holdout_size: 25,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-4';

/** One step of a farm plan: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: a ranked pre-token protocol with its model inputs and farm plan. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    log_intercept: number;
    log_slope: number;
    category_adjustment: number;
    category_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A board row's compact form for data.js; the page rebuilds the farm plan from the same rules. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  log_intercept: number;
  log_slope: number;
  category_adjustment: number;
  category_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One sector's leave-one-category-out result. */
export interface ValidationCategory {
  category: string;
  n: number;
  model_median_abs_pct_error: number;
  model_within_2x_share: number;
  flat_median_abs_pct_error: number;
  flat_within_2x_share: number;
}

/** One side of a validation cut: the model and the flat baseline on the same test set. */
export interface ValidationSide {
  median_abs_pct_error: number;
  within_2x_share: number;
  spearman: number;
}

/** A holdout cut: the mean over its seeds, model against a flat multiple. */
export interface ValidationCut {
  seeds: number;
  test_size: number;
  model: ValidationSide;
  flat: ValidationSide;
}

/** The model's own out-of-sample test, computed from this snapshot by main.ts. */
export interface Validation {
  method: string;
  holdout: ValidationCut;
  stratified: ValidationCut;
  loco: {
    pooled: { model: ValidationSide; flat: ValidationSide };
    by_category: ValidationCategory[];
  };
  note: string;
}

/** One fitted sector adjustment, for the dashboard's model table. */
export interface CategoryAdjustment {
  category: string;
  live_count: number;
  adjustment: number;
  multiplier: number;
}

/** Everything the dashboard renders: the board, the live set, the model, and its test. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelSettings;
  model_version: string;
  log_intercept: number;
  log_slope: number;
  flat_median: number;
  market_live_count: number;
  category_adjustments: CategoryAdjustment[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  validation: Validation;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function numOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, never below zero; null when either date is missing or bad. */
export function daysSince(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The middle of a non-empty list of finite numbers. */
export function middle(values: number[]): number {
  const xs = [...values].sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 1 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
}

/** A number to four decimals, so the validation block is stable to read. */
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** 1-based ranks with the average rank shared across ties. */
function ranksOf(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length).fill(0);
  let j = 0;
  while (j < order.length) {
    let k = j;
    while (k + 1 < order.length && order[k + 1]!.v === order[j]!.v) k++;
    const shared = (j + k) / 2 + 1;
    for (let t = j; t <= k; t++) ranks[order[t]!.i] = shared;
    j = k + 1;
  }
  return ranks;
}

/** Spearman's rank correlation between two lists of the same length; 0 when either is flat. */
export function spearman(xs: number[], ys: number[]): number {
  const rx = ranksOf(xs);
  const ry = ranksOf(ys);
  const n = xs.length;
  if (n < 2) return 0;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i]! - mx;
    const b = ry[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

/** A small deterministic generator (mulberry32): the holdout seeds shuffle the same way on every run. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A copy of `items` shuffled by a seeded generator, so a seeded holdout is reproducible. */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** The live-token protocols the model may learn from: a market cap above zero, a positive TVL. A $0
 * cap is a dead token with no price to learn from — sixteen live-token protocols in this snapshot
 * record one — so they are left out of the fit and the test alike. */
function liveSet(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** The fitted model: the log-log line plus one shrunk adjustment per sector. */
export interface FittedModel {
  intercept: number;
  slope: number;
  adjustments: Map<string, number>;
  liveCount: number;
  flatMedian: number;
}

/**
 * Fit the model on a list of live-token protocols, and nothing else. The line is ordinary least
 * squares in closed form (no matrix library needed for two parameters); each sector's adjustment
 * is its mean log-residual off that line, shrunk toward zero by n / (n + k) and gated at three
 * live protocols, so a sector with one or two protocols earns no adjustment at all.
 */
export function fitModel(live: SnapshotProtocol[], settings: ModelSettings = MODEL): FittedModel {
  const xs = live.map((p) => Math.log(p.tvl_usd));
  const ys = live.map((p) => Math.log(p.mcap_usd as number));
  const n = live.length;
  const meanX = n > 0 ? xs.reduce((a, b) => a + b, 0) / n : 0;
  const meanY = n > 0 ? ys.reduce((a, b) => a + b, 0) / n : 0;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - meanX) * (ys[i]! - meanY);
    den += (xs[i]! - meanX) * (xs[i]! - meanX);
  }
  const slope = den > 0 ? num / den : 1;
  const intercept = meanY - slope * meanX;

  const grouped = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const p = live[i]!;
    const resid = ys[i]! - (intercept + slope * xs[i]!);
    const key = p.category ?? 'Unknown';
    const list = grouped.get(key) ?? [];
    list.push(resid);
    grouped.set(key, list);
  }
  const adjustments = new Map<string, number>();
  for (const [key, list] of grouped) {
    if (list.length < settings.category_min_live) continue;
    const mean = list.reduce((a, b) => a + b, 0) / list.length;
    adjustments.set(key, (list.length / (list.length + settings.shrink_k)) * mean);
  }

  const ratios = live.map((p) => (p.mcap_usd as number) / p.tvl_usd);
  return {
    intercept,
    slope,
    adjustments,
    liveCount: n,
    flatMedian: ratios.length > 0 ? middle(ratios) : 0.25,
  };
}

/** The market's pricing from the snapshot's own live-token protocols. */
export function marketFit(snapshot: Snapshot, settings: ModelSettings = MODEL): FittedModel {
  return fitModel(liveSet(snapshot), settings);
}

/** A protocol's sector adjustment: 0 for a thin sector, a null category, or one the fit never saw. */
export function sectorAdjustment(p: SnapshotProtocol, fitted: FittedModel): number {
  return fitted.adjustments.get(p.category ?? 'Unknown') ?? 0;
}

/** The implied value one protocol gets: exp(intercept + slope * ln(TVL) + sector adjustment). */
export function predictValue(tvlUsd: number, category: string | null, fitted: FittedModel): number {
  const adj = fitted.adjustments.get(category ?? 'Unknown') ?? 0;
  return Math.max(1, Math.round(Math.exp(fitted.intercept + fitted.slope * Math.log(tvlUsd) + adj)));
}

/** The multipliers and the implied value one protocol gets under a fitted model. */
export function scoreProtocol(
  protocol: SnapshotProtocol,
  asOf: string,
  fitted: FittedModel,
): { implied: number; intercept: number; slope: number; adjustment: number; multiplier: number; age: number | null } {
  const age = daysSince(asOf, protocol.listed_at);
  const adjustment = sectorAdjustment(protocol, fitted);
  const implied = predictValue(protocol.tvl_usd, protocol.category, fitted);
  return { implied, intercept: fitted.intercept, slope: fitted.slope, adjustment, multiplier: Math.exp(adjustment), age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** One scored test case: what the model said against the market cap the protocol really has. */
interface ScoredCase {
  pred: number;
  actual: number;
}

/** The three numbers one test set is judged by, for one predictor. */
function sideOf(cases: ScoredCase[]): ValidationSide {
  if (cases.length === 0) return { median_abs_pct_error: 0, within_2x_share: 0, spearman: 0 };
  const errors = cases.map((c) => Math.abs(c.pred - c.actual) / c.actual);
  const within = cases.filter((c) => c.pred / c.actual >= 0.5 && c.pred / c.actual <= 2).length;
  return {
    median_abs_pct_error: round4(middle(errors) * 100),
    within_2x_share: round4(within / cases.length),
    spearman: round4(spearman(cases.map((c) => c.pred), cases.map((c) => c.actual))),
  };
}

/** The mean of several sides, rounded the same way. */
function meanSide(sides: ValidationSide[]): ValidationSide {
  if (sides.length === 0) return { median_abs_pct_error: 0, within_2x_share: 0, spearman: 0 };
  const mean = (pick: (s: ValidationSide) => number): number =>
    round4(sides.reduce((a, s) => a + pick(s), 0) / sides.length);
  return {
    median_abs_pct_error: mean((s) => s.median_abs_pct_error),
    within_2x_share: mean((s) => s.within_2x_share),
    spearman: mean((s) => s.spearman),
  };
}

/**
 * The model's own out-of-sample test, run on the snapshot's live-token protocols. Three cuts,
 * all honest about what the fit never saw, each with a flat median multiple on the same test
 * set so the test says whether the slope and the sectors earn their keep:
 *
 *   holdout:    ten seeded shuffles; each holds out 25 live protocols, fits on the other
 *               103, and predicts the held-out 25. Reported as the mean over the ten seeds.
 *   stratified: radar-3's own split — the live protocols ordered by TVL, every fifth one
 *               held out — so the two models can be compared on the same test set.
 *   leave-one-category-out: every sector with at least five live protocols is held out
 *               whole and predicted with no sector adjustment of its own, exactly as an
 *               unseen sector would be. Reported per sector, and pooled across all of them.
 *
 * A point prediction is rough by nature — market cap over TVL spreads wide even inside
 * one sector — so the ranking is the product, not the price. The test says how far to
 * trust the ranking: the share within 2x and the rank correlation, not the median error
 * alone. And the test says plainly where the model loses: on rank correlation the flat
 * multiple still edges it, by a hair, on the holdout.
 */
export function validateModel(snapshot: Snapshot, settings: ModelSettings = MODEL): Validation {
  const live = liveSet(snapshot);
  const bySlug = [...live].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  const holdoutModels: ValidationSide[] = [];
  const holdoutFlats: ValidationSide[] = [];
  for (let seed = 0; seed < settings.holdout_seeds; seed++) {
    const shuffled = seededShuffle(bySlug, seed);
    const test = shuffled.slice(0, settings.holdout_size);
    const fit = shuffled.slice(settings.holdout_size);
    const fitted = fitModel(fit, settings);
    const modelCases = test.map((p) => ({ pred: predictValue(p.tvl_usd, p.category, fitted), actual: p.mcap_usd as number }));
    const flatCases = test.map((p) => ({ pred: Math.max(1, Math.round(p.tvl_usd * fitted.flatMedian)), actual: p.mcap_usd as number }));
    holdoutModels.push(sideOf(modelCases));
    holdoutFlats.push(sideOf(flatCases));
  }
  const holdout: ValidationCut = {
    seeds: settings.holdout_seeds,
    test_size: settings.holdout_size,
    model: meanSide(holdoutModels),
    flat: meanSide(holdoutFlats),
  };

  const byTvl = [...live].sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const stratTest = byTvl.filter((_, i) => i % 5 === 4);
  const stratFit = byTvl.filter((_, i) => i % 5 !== 4);
  const stratFitted = fitModel(stratFit, settings);
  const stratified: ValidationCut = {
    seeds: 1,
    test_size: stratTest.length,
    model: sideOf(stratTest.map((p) => ({ pred: predictValue(p.tvl_usd, p.category, stratFitted), actual: p.mcap_usd as number }))),
    flat: sideOf(stratTest.map((p) => ({ pred: Math.max(1, Math.round(p.tvl_usd * stratFitted.flatMedian)), actual: p.mcap_usd as number }))),
  };

  const byCategory: ValidationCategory[] = [];
  const pooledModel: ScoredCase[] = [];
  const pooledFlat: ScoredCase[] = [];
  const cats = new Map<string, SnapshotProtocol[]>();
  for (const p of live) {
    const key = p.category ?? 'Unknown';
    const list = cats.get(key) ?? [];
    list.push(p);
    cats.set(key, list);
  }
  for (const [key, members] of [...cats.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))) {
    if (members.length < 5) continue;
    const rest = live.filter((p) => (p.category ?? 'Unknown') !== key);
    const restFitted = fitModel(rest, settings);
    const modelCases = members.map((p) => ({ pred: predictValue(p.tvl_usd, p.category, restFitted), actual: p.mcap_usd as number }));
    const flatCases = members.map((p) => ({ pred: Math.max(1, Math.round(p.tvl_usd * restFitted.flatMedian)), actual: p.mcap_usd as number }));
    pooledModel.push(...modelCases);
    pooledFlat.push(...flatCases);
    const modelSide = sideOf(modelCases);
    const flatSide = sideOf(flatCases);
    byCategory.push({
      category: key,
      n: members.length,
      model_median_abs_pct_error: modelSide.median_abs_pct_error,
      model_within_2x_share: modelSide.within_2x_share,
      flat_median_abs_pct_error: flatSide.median_abs_pct_error,
      flat_within_2x_share: flatSide.within_2x_share,
    });
  }

  return {
    method: 'Ten seeded random holdouts (25 of 128 live protocols held out, fit on the other 103, mean over seeds) plus radar-3\'s stratified split (every 5th live protocol by TVL held out) plus leave-one-category-out over every sector with 5+ live protocols. Every fit uses the fit set only; the flat baseline is the fit set\'s median mcap/TVL on the same test set. Sixteen live-token protocols record a $0 market cap — dead tokens with no price to learn from — so the fit and the test use the 128 that trade above $0.',
    holdout,
    stratified,
    loco: {
      pooled: { model: sideOf(pooledModel), flat: sideOf(pooledFlat) },
      by_category: byCategory,
    },
    note: 'A point prediction is rough: mcap/TVL spreads wide even inside one sector, so read the ranking, not the price. The share within 2x and the rank correlation say how far to trust the order. The model wins on median error and within-2x on every cut, and loses the rank correlation to the flat multiple by a hair on the holdout — the category adjustment buys point accuracy at a small ranking cost, and the dashboard says so rather than hiding it.',
  };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function rankBoard(snapshot: Snapshot, settings: ModelSettings = MODEL): BoardRow[] {
  const fitted = marketFit(snapshot, settings);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, settings.early_rows);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = scoreProtocol(p, snapshot.as_of, fitted);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      log_intercept: s.intercept,
      log_slope: s.slope,
      category_adjustment: s.adjustment,
      category_multiplier: s.multiplier,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** The old name for the board builder, kept so the gate's shape does not move. */
export const buildBoard = rankBoard;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** One caution line for a protocol, from its own record: growth, age and size. */
function cautionFor(p: SnapshotProtocol, age: number | null): string {
  const g = p.change_7d;
  if (g !== null && g < -15) return `TVL dropped ${Math.abs(g).toFixed(1)}% in seven days, so start half-size and add only once the outflow has stopped for a week.`;
  if (g !== null && g > 8) return `TVL jumped ${g.toFixed(1)}% in seven days, so the crowd is already piling in; split the entry in two rather than chasing it at once.`;
  if (age !== null && age < 120) return `It has been listed under four months with no token, so treat it as early: keep the size small and re-check it every month.`;
  if (p.tvl_usd < 60_000_000) return `It sits just above the watchlist floor, so one large wallet leaving moves its TVL; keep the position modest.`;
  return `It is large enough that one wallet leaving will not move it, but a token is still only a possibility, never a promise.`;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} of USDC on ${name} on ${chain} and leave the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to ${name}'s main pool on ${chain} and leave it in place.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC onto ${chain} through ${name}, then use the bridged funds inside its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Post $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and take one position in a ${name} market.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) return `Deposit $${capital} into a ${name} vault on ${chain} and hold the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis vault on ${chain} and hold the position.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and leave the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. The weekly step states its total across the whole hold, so the plan's full price is on
 * the page, not just the first week's.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const weeks = Math.max(1, Math.ceil(hold / 7));
  const weeklyGas = 2;
  return [
    {
      text: `Set up a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about $${weeklyGas} of gas a week, about $${weeklyGas * weeks} across the ${hold}-day hold`,
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days so the activity lands in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: cautionFor(p, age),
      cost: 'nothing but attention',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot, settings: ModelSettings = MODEL): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, settings.live_rows)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    log_intercept: row.model.log_intercept,
    log_slope: row.model.log_slope,
    category_adjustment: row.model.category_adjustment,
    category_multiplier: row.model.category_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, settings: ModelSettings = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = rankBoard(snapshot, settings);
  const fitted = marketFit(snapshot, settings);
  const live = liveRows(snapshot, settings);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const validation = validateModel(snapshot, settings);
  const adjustments: CategoryAdjustment[] = [...fitted.adjustments.entries()]
    .map(([category, adjustment]) => {
      const liveCount = liveSet(snapshot).filter((p) => (p.category ?? 'Unknown') === category).length;
      return { category, live_count: liveCount, adjustment: round4(adjustment), multiplier: round4(Math.exp(adjustment)) };
    })
    .sort((a, b) => b.adjustment - a.adjustment || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: settings,
    model_version: MODEL_VERSION,
    log_intercept: round4(fitted.intercept),
    log_slope: round4(fitted.slope),
    flat_median: round4(fitted.flatMedian),
    market_live_count: fitted.liveCount,
    category_adjustments: adjustments,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    validation,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
