# Wabi T05 acceptance — 2026-10-23

**Result: PASS with explicit evidence boundaries.** The four integrated slices were assessed at candidate `2af47c99a729b7aeb3df9e35f7182bb8c24272c9`. The 37 story outcomes below map to the [acceptance plan](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/ACCEPTANCE-PLAN.md#story-to-evidence-map); detailed per-story assertions are retained there rather than duplicated here.

## Inputs and verification

| Input | Recorded value |
| --- | --- |
| Branch / candidate | `codex/wabi-62` / `2af47c99a729b7aeb3df9e35f7182bb8c24272c9` |
| Source tree | `768c56ba8082f957c1434a0edb403e2b445a3410` |
| Test tree | `977c9fee912c41eef972cae156c52e871c1d3f73` |
| Fixture | `tests/fixtures/juya-content.html`, SHA-256 `e0e2414941ff60096630d11eca3a0114e4969abe53eaf29466386ecbf9f8f810`; matches the immutable before audit and controller verify input |
| Runtime | Node `v24.18.0`, Windows x64, Playwright `1.62.1`; matrix viewport height 900, DPR 1, zoom 100%/120% |

`npm run build:dir` completed with exit 0 at the integrated candidate. These exact ticket-worktree commands also exited 0: `node out/wabi-ticket/acceptance-20261023/after3/audit.mjs pilot`, `matrix`, `edges`, `responsive-edges`, and `interactions`; `node out/wabi-ticket/acceptance-20261023/after3/native.mjs`; `node out/wabi-ticket/acceptance-20261023/after3/supplement.mjs`; `node out/wabi-ticket/acceptance-20261023/after3/static/contrast-audit-token-aware.mjs`; `node out/wabi-ticket/acceptance-20261023/after3/contrast-pixels.mjs`; `node out/wabi-ticket/acceptance-20261023/after3/contrast-surfaces-v2.mjs`; and bundled Python `C:\Users\Einn Tzai\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe` on `analyze.py`, `texture-compare.py`, and `contrast-surfaces-v2-analysis.py`. Their per-run exits and sample records are in [the after3 evidence bundle](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/).

The primary matrix contains 40 light/dark × reader/feed × viewport × zoom states; responsive boundaries add 24 samples at 520/640/641px. The run also recorded 26 content/layout edge samples, eight interaction states, and 110 screenshot records. Analysis found zero page overflow, internal clipping, or page errors; recorded screenshot hashes match. Actual Chinese glyph reports show Noto Serif SC for headings and Noto Sans SC for body text. The exact matrix and measurements are in [analysis.json](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/analysis.json), [progress.ndjson](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/progress.ndjson), and [sample records](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/samples/).

The controller ran `npm run verify` once on the same candidate and fixture: exit 0, 574 unit tests, 176 E2E tests, and five archive checks. See [results.json](../out/wabi-implementation-2026-10-23/verify-after-token-fix/results.json) and [verify.log](../out/wabi-implementation-2026-10-23/verify-after-token-fix/verify.log). This ticket did not duplicate that full run.

## Story outcomes

| # | Outcome and evidence |
| ---: | --- |
| 1 | PASS — Wabi identity in both themes and views; [matrix](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/analysis.json). |
| 2 | PASS — paper surface has no card fill/border/shadow; before/after captures and [paper E2E](../tests/e2e/wabi-paper.spec.ts). |
| 3 | PASS — entry text axes remain stable; geometry captures and [figures E2E](../tests/e2e/wabi-figures.spec.ts). |
| 4 | PASS — asymmetric figure and index treatments retain their intended geometry; [figures E2E](../tests/e2e/wabi-figures.spec.ts). |
| 5 | PASS — actual heading/body glyph families recorded as Noto Serif SC and Noto Sans SC; [sample records](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/samples/). |
| 6 | PASS — body is 16px with 1.85 line-height ratio; [paper E2E](../tests/e2e/wabi-paper.spec.ts). |
| 7 | PASS — no first-line indent and paragraph spacing remains positive; [paper E2E](../tests/e2e/wabi-paper.spec.ts). |
| 8 | PASS — masthead, section, title, lead, and body hierarchy verified in screenshots and E2E. |
| 9 | PASS — lead uses lighter treatment and rule without a panel; actual text contrast included in [surface assay](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/contrast-surfaces-v2-results.json). |
| 10 | PASS — lead/body content retained; [paper E2E](../tests/e2e/wabi-paper.spec.ts). |
| 11 | PASS for supported parsed block order and interleaved figure samples; pre-existing raw mixed-`<p>` text/image loss in the shared parser is outside these style slices and unchanged. See [review](../out/wabi-implementation-2026-10-23/reviews/REVIEW.md). |
| 12 | PASS — source text and figures appear once; [figures E2E](../tests/e2e/wabi-figures.spec.ts). |
| 13 | PASS — landscape figures use the available reading width; [figures E2E](../tests/e2e/wabi-figures.spec.ts). |
| 14 | PASS — portrait figures preserve aspect and avoid an empty companion column; [edge samples](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/progress.ndjson). |
| 15 | PASS — figures collapse to one column at narrow widths and 120% zoom; matrix and edge samples. |
| 16 | PASS — captions remain attached and readable; light/dark minimum pixel contrast 5.295:1 / 5.805:1 in [surface assay](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/contrast-surfaces-v2-results.json). |
| 17 | PASS — missing optional fields produce natural flow without empty decoration; [paper E2E](../tests/e2e/wabi-paper.spec.ts). |
| 18 | PASS — 32-item wide overview is two-column; [overview E2E](../tests/e2e/wabi-overview.spec.ts). |
| 19 | PASS — narrow overview is single-column; [overview E2E](../tests/e2e/wabi-overview.spec.ts). |
| 20 | PASS — all 32 items retain visual, DOM, and Tab order; [overview E2E](../tests/e2e/wabi-overview.spec.ts). |
| 21 | PASS — long URLs and titles wrap without clipping in both themes at 720px/120%; [paper E2E](../tests/e2e/wabi-paper.spec.ts). |
| 22 | PASS — final-background text, badge, caption, metadata, and renderer focus pixel assays exceed their applicable 4.5:1 / 3:1 thresholds; [token-aware results](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/contrast-surfaces-v2-results.json). Scrollbar values are computed thumb/theme pairs (4.150:1 light, 4.548:1 dark) over a transparent track, not physical-slot pixel proof. |
| 23 | PASS — same 35,000-pixel crop: dark luminance standard deviation fell from 0.00090052 to 0.00047054 (47.75% lower); light crop unchanged. See [texture comparison](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/texture-comparison.json). |
| 24 | PASS — date/title hierarchy in grid, compact, and magazine cases; [feed E2E](../tests/e2e/wabi-feed.spec.ts). |
| 25 | PASS — ordinary grid covers use 16:9; [feed E2E](../tests/e2e/wabi-feed.spec.ts). |
| 26 | PASS — compact thumbnail and magazine featured exceptions retained; [feed E2E](../tests/e2e/wabi-feed.spec.ts). |
| 27 | PASS — selected columns and display-field gates retain existing semantics; [feed E2E](../tests/e2e/wabi-feed.spec.ts). |
| 28 | PASS — date/source text stays readable in narrow four-column cards; pixel minima 5.843:1 light and 5.534:1 dark; [surface assay](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/contrast-surfaces-v2-results.json). |
| 29 | PASS — four-column empty state remains within the full content grid in both themes; [analysis geometry](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/analysis.json). |
| 30 | PASS — single, missing-cover, mixed-cover, and damaged-image cases retain surrounding layout; [figures E2E](../tests/e2e/wabi-figures.spec.ts) and edge samples. |
| 31 | PASS — open issue, read state, and favorites filtering remain functional; [feed E2E](../tests/e2e/wabi-feed.spec.ts) and hidden-native IPC records. |
| 32 | PASS in renderer: keyboard focus is visible and focus-ring pixels exceed 3:1 (light feed/reader 3.363/3.634, dark 6.434/5.823). Hidden Electron confirms DOM focus and IPC only; its computed outline is transparent, so native visual focus and OS-front focus are **unproven**. See [surface assay](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/contrast-surfaces-v2-results.json) and [native report](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/native-report.json). |
| 33 | PASS — text links dispatch through `openExternal` without in-page navigation; [interaction records](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/analysis.json). |
| 34 | PASS — default and hover transforms remain `none`; [interaction records](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/analysis.json). |
| 35 | PASS — reduced-motion states retain focus behavior without entry/hover movement; [interaction records](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/analysis.json). |
| 36 | PASS — 40 primary and 24 breakpoint states; hidden native also covered default/minimum bounds and 120% zoom; [native report](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/native-report.json). |
| 37 | PASS — 22 generic-off/editorial feed-reader assertions pass with no Wabi classes or page errors; limited controls do not claim byte equality for every style. See [negative controls](../out/wabi-implementation-2026-10-23/negative-controls/negative-controls.json). |

## Contrast, native, and scope boundaries

Actual-text and focus pixel results are separate from static token calculations. Root-text minimums on the observed paper texture were 7.809:1 light and 8.121:1 dark. Badge glyph minima were 6.209:1 and 6.747:1. The decorative card-border reference is 1.412:1 / 1.346:1 and is classified as decorative, not a functional non-text indicator. The token-aware report is [here](../out/wabi-implementation-2026-10-23/tickets/62/acceptance-20261023/after3/static/contrast-report-token-aware.md).

Hidden Electron used real main/preload/IPC with isolated userData/sessionData, all measured windows hidden, default profile stats unchanged, and ten samples without errors. Default window bounds were 1102×722 at viewport 1099×721/DPR 1.75; minimum-window bounds were 723×482 at viewport 720×481/DPR 1.75, with 120% CSS zoom. The probe cleared Electron launch environment variables. No OS foreground, physical keyboard/mouse, or native visible-focus claim is made. Real saved RSS is supplemental; deterministic inline SVGs carry image-layout assertions, since some lazy below-fold network images did not load in that supplement.

Initial harness failures remain preserved: the first pilot stopped before browser launch when esbuild could not write its helper; the corrected `write:false` probe passed in the fresh `after3` directory. The initial generic static contrast pass used the accent token as badge text and produced false positives; the token-aware calculation and rendered-pixel assay are the reported evidence. Early negative-control harness attempts are retained alongside the final passing run. These are recorded harness/calculation corrections, not product failures; no raw attempt was overwritten. The shared mixed raw-`<p>` parser boundary noted for story 11 was present at baseline and was classified out of scope by review.

This ticket adds only this acceptance report to the tracked tree. The copied dirty reference documents and ignored raw evidence are preserved as received.
