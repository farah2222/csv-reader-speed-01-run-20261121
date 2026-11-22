# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/farah2222/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/farah2222/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

**A fast, dependency-free drop-in for csv-reader 1.0.0** — it answers exactly as csv-reader does on every case, in about a fifth of the CPU time. Entry for the [make.fun bounty](https://make.fun/c/csv-reader-speed-01-run-20261121) "Read broken CSV files faster" ($100).

## Approach

`solve.js` exports `run(input)`, returning `{columns, rows, errors}` for `{text, header}` with csv-reader 1.0.0's exact semantics: BOM dropped, records end at LF or CRLF, blank lines are no record, lone CRs outside quotes are dropped (`stray_cr`), quoted fields run to the next non-doubled quote with `""` collapsing to one quote and every line break inside quotes read as LF, junk after a closing quote is appended (`quote_junk`), a quote that never closes is a literal character and the rest is re-read as unquoted (`unterminated_quote`), and rows are padded (`short_row`) or cut (`long_row`) to the first record's width.

Speed comes from never walking the text one character at a time:

- **Unquoted fields** are located with `String.indexOf` over the next `,` or `\n`, and a clean field is taken with a single `String.slice`. Only a field that actually holds a lone CR takes a slow path (a fraction of a percent of the data), where the CRs are stripped and each reported.
- **Quoted fields** find their closing quote with `indexOf`, skipping `""` pairs, and only run a regex when the content really needs unescaping or line-break normalising (doubled quotes, embedded LF/CRLF/lone CR).
- No per-field closures in the hot path, no allocations beyond the field strings themselves, and the driver (`main.ts`, the house driver verbatim) keeps V8's incremental marking off.

## Measured speed

On the kit's practice set (6 cases, 10.19 MB of CSV), Node 24, this machine, CPU time of `run()` only, 7 timed passes after a warm-up:

| | mean | median | range |
|---|---|---|---|
| **this entry** | **0.137 s** | 0.131 s | 0.110–0.178 s |
| csv-reader 1.0.0 (house baseline) | 0.743 s | 0.734 s | 0.667–0.879 s |

**≈ 5.4× faster than the house baseline** (the kit's own reference numbers put the public tools at 0.72–0.78 s on their box against a 1.38 s baseline — this entry is well under that too).

## Correctness evidence

- **Practice set: 6/6 cases byte-identical** to `practice/reference/expected.json` (deep-compared, not just string-compared).
- **Fresh generator seeds: 18/18 cases identical** — three sets drawn with the kit's own generator from new random seeds, each compared against the oracle's expected answers.
- **Edge cases: 79/79 match csv-reader 1.0.0** in a direct differential test (empty text, BOM-only, CRLF/LF/lone-CR line endings, trailing commas, unterminated quotes, quote junk in every published flavour, embedded newlines in quotes, short/long rows, stray-CR-only lines, header with no records).
- **Deterministic:** two full runs on the practice set produce byte-identical `answers.json`.

## Run it

```sh
MAKEFUN_INPUT_DIR=<dir with cases.json> MAKEFUN_OUTPUT_DIR=<output dir> node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or `MAKEFUN_INPUT_DIR`), answers each with `run`, and writes `/output/answers.json` (or `MAKEFUN_OUTPUT_DIR`). Node 22+; no dependencies, no network, no build step. Repository is ~10 KB, far under the 1 MiB cap.

## License

MIT — see [LICENSE](LICENSE).
