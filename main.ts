// Token Radar (radar-3): the program the grader runs.
//
// It reads the sealed snapshot, ranks every pre-token protocol with the model in lib/model.ts,
// tests that model on the live-token protocols it never fit on, and writes the board, the
// dashboard's data, the dashboard itself, the screenshots and the dossier the judge reads.
//
//   node main.ts --input <snapshot.json|directory> [--output <dir>]
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// Outside the grader's container the output directory comes from --output, else from
// MAKEFUN_OUTPUT_DIR, else /output. The snapshot defaults to /input/snapshot.json. Node 22,
// standard library only: no install step, no network, nothing but the snapshot's own bytes in.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** Where this file lives, so the dashboard and screenshots copy from beside it. */
const ROOT = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the dossier's bytes, the rest refuse. */
const TEXT_CAP_BYTES = 65_536;
const SHOT_CAPS = { max: 4, max_bytes: 524_288 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };

/** One `--name <value>` or `--name=<value>` argument, else the fallback. */
function cliFlag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const joined = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (joined !== undefined) return joined.slice(name.length + 3);
  return fallback;
}

/** The snapshot file: --input names a file or a directory holding snapshot.json. */
function resolveInput(): string {
  const given = cliFlag('input', '/input');
  return given.endsWith('.json') ? given : join(given, 'snapshot.json');
}

/** The output directory: --output, then MAKEFUN_OUTPUT_DIR, then /output. */
function resolveOut(): string {
  return cliFlag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
}

/** Die with a message on stderr and a code the grader reads. */
function die(message: string, code: number): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

/** Copy one directory's regular files into `to`, skipping dotfiles; returns the names copied. */
function copyTree(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    names.push(name);
  }
  return names;
}

/** The screenshots the gate takes: 3 or 4 whole images with dossier-safe names. */
function checkShots(names: string[]): void {
  if (names.length < 3) {
    die(`screenshots/ holds ${names.length} image${names.length === 1 ? '' : 's'}: hand in 4 — the board, a detail view, a filtered view and the validation`, 1);
  }
  if (names.length > 4) die(`screenshots/ holds ${names.length} images: the gate takes at most 4`, 1);
  for (const name of names) {
    if (!SHOT_NAME.test(name)) {
      die(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
    }
  }
}

function run(): void {
  const inputFile = resolveInput();
  if (!existsSync(inputFile)) {
    die(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
  }
  const outDir = resolveOut();

  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) die(`the model wrote a board the gate refuses: ${issue}`, 1);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board, validation: radar.validation })}\n`);
  writeFileSync(join(outDir, 'data.js'), dataScript(radar));

  copyTree(join(ROOT, 'dashboard'), join(outDir, 'dashboard'));
  const shots = copyTree(join(ROOT, 'screenshots'), join(outDir, 'screenshots'));
  checkShots(shots);

  // The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
  writeFileSync(
    join(outDir, 'dossier.json'),
    buildDossier(outDir, { text_max_bytes: TEXT_CAP_BYTES, screenshots: SHOT_CAPS, dashboard: DASHBOARD_CAPS }),
  );

  const v = radar.validation;
  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
      `token radar: validation — holdout ${v.holdout.test_count} held out of ${v.holdout.fit_count + v.holdout.test_count} live, median error ${v.holdout.median_abs_pct_error}%, ${Math.round(v.holdout.within_2x_share * 100)}% within 2x, spearman ${v.holdout.spearman} (flat-multiple baseline: median error ${v.holdout.baseline_median_abs_pct_error}%, spearman ${v.holdout.baseline_spearman}); leave-one-category-out overall median error ${v.overall_median_abs_pct_error}%, ${Math.round(v.overall_within_2x_share * 100)}% within 2x\n` +
      `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (3 files), ${join(outDir, 'screenshots')} (${shots.length} images) and ${join(outDir, 'dossier.json')}\n`,
  );
}

run();
