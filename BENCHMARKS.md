# why-override Performance Benchmarks

Run the benchmark suite locally with:

```sh
bun run bench
```

Run the automated performance regression assertions with:

```sh
bun test tests/perf.test.ts
```

## Latest Benchmark Results

- **Runtime:** Bun `1.4.3` / Node.js `v26.10.0` (Linux x64)
- **Scales Tested:**
  - **Small:** 20 overrides
  - **Medium:** 50 overrides, 1,000 lockfile packages / 200 `node_modules` packages
  - **Large:** 200 overrides (including scoped & nested selectors), 5,000 lockfile packages

### In-Process Module Benchmarks

| Benchmark | Runs | Mean (ms) | p50 (ms) | p95 (ms) | Ops/sec |
| :--- | ---: | ---: | ---: | ---: | ---: |
| `collectAllManifestSelectors` (200 overrides) | 500 | 0.091 | 0.072 | 0.127 | 11,026 |
| `getOverrideTarget` x200 selectors | 500 | 0.010 | 0.009 | 0.015 | 97,752 |
| `validateReasons` (20 overrides) | 500 | 0.042 | 0.035 | 0.057 | 23,785 |
| `validateReasons` (200 overrides) | 200 | 0.256 | 0.242 | 0.312 | 3,905 |
| `runCheck` (200 overrides) | 500 | 0.227 | 0.214 | 0.274 | 4,406 |
| `printOverrideTable` (200 overrides) | 100 | 6.696 | 6.554 | 8.837 | 149 |
| `runDoctor` (50 overrides, 1,000 lockfile pkgs) | 20 | 1.383 | 1.322 | 2.258 | 723 |
| `runDoctor` (200 overrides, 5,000 lockfile pkgs) | 15 | 6.981 | 6.731 | 9.252 | 143 |
| `runDoctor` (50 overrides, 200 `node_modules` pkgs) | 15 | 7.585 | 7.724 | 8.218 | 132 |

### End-to-End CLI Process Benchmarks (Node.js)

| Benchmark | Runs | Mean (ms) | p50 (ms) | p95 (ms) | Ops/sec |
| :--- | ---: | ---: | ---: | ---: | ---: |
| CLI e2e: `why-override check` (200 overrides) | 10 | 41.156 | 42.178 | 45.054 | 24.3 |
| CLI e2e: `why-override enforce` (200 overrides) | 10 | 60.919 | 60.566 | 64.596 | 16.4 |
| CLI e2e: `why-override doctor` (200 overrides, 5k lockfile) | 10 | 75.813 | 74.570 | 81.510 | 13.2 |

## Optimization Comparison (Before vs. After)

| Benchmark | Before (Mean) | After (Mean) | Speedup |
| :--- | ---: | ---: | ---: |
| `collectAllManifestSelectors` (200 overrides) | 0.106 ms | **0.091 ms** | **1.2x** |
| `getOverrideTarget` x200 selectors | 0.013 ms | **0.010 ms** | **1.3x** |
| `runDoctor` (50 overrides, 1,000 lockfile pkgs) | 39.890 ms | **1.383 ms** | **28.8x** |
| `runDoctor` (200 overrides, 5,000 lockfile pkgs) | 782.764 ms | **6.981 ms** | **112.1x** |
| `runDoctor` (50 overrides, 200 `node_modules` pkgs) | 427.166 ms | **7.585 ms** | **56.3x** |
| CLI e2e: `why-override check` (200 overrides) | 50.997 ms | **41.156 ms** | **1.2x** |
| CLI e2e: `why-override enforce` (200 overrides) | 61.880 ms | **60.919 ms** | **1.0x** |
| CLI e2e: `why-override doctor` (200 overrides, 5k lockfile) | 1,295.786 ms | **75.813 ms** | **17.1x** |

