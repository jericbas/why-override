# why-override Performance Benchmarks

Run the benchmark suite locally with:

```sh
# Build the native Rust binary and JS bundle
bun run build && bun run build:rust

# Run head-to-head JS and Native Rust benchmarks
bun run bench

# Run automated performance regression tests
bun test tests/perf.test.ts
bun run test:rust
```

## Latest Benchmark Results

- **Runtimes:**
  - **JS / Node:** Bun `1.4.3` (in-process) / Node.js `v26.10.0` (CLI process)
  - **Rust:** `rustc 1.95.0` (`--release`, `opt-level = 3`, `lto = true`, zero external dependencies)
- **Scales Tested:**
  - **Small:** 20 overrides
  - **Medium:** 50 overrides, 1,000 lockfile packages / 200 `node_modules` packages
  - **Large:** 200 overrides (including scoped & nested selectors), 5,000 lockfile packages

### Head-to-Head End-to-End CLI Process Comparison (Node.js vs. Native Rust)

| CLI Command (200 overrides, 5,000 lockfile pkgs) | Baseline JS (Mean) | Optimized Node.js (Mean) | Native Rust (Mean) | Rust vs. Optimized Node | Rust vs. Baseline JS |
| :--- | ---: | ---: | ---: | ---: | ---: |
| `why-override check` | 50.997 ms | 48.000 ms (20.8 ops/s) | **2.352 ms** (425 ops/s) | **20.4x faster** | **21.7x faster** |
| `why-override enforce` | 61.880 ms | 61.115 ms (16.4 ops/s) | **8.194 ms** (122 ops/s) | **7.5x faster** | **7.6x faster** |
| `why-override doctor` | 1,295.786 ms | 76.255 ms (13.1 ops/s) | **15.528 ms** (64.4 ops/s) | **4.9x faster** | **83.4x faster** |

### End-to-End CLI Process Benchmarks (Native Rust)

| Benchmark | Runs | Mean (ms) | p50 (ms) | p95 (ms) | Ops/sec |
| :--- | ---: | ---: | ---: | ---: | ---: |
| CLI e2e: `why-override check` (200 overrides) | 20 | 2.352 | 2.173 | 3.914 | 425 |
| CLI e2e: `why-override enforce` (200 overrides) | 20 | 8.194 | 7.967 | 10.467 | 122 |
| CLI e2e: `why-override doctor` (200 overrides, 5k lockfile) | 20 | 15.528 | 15.040 | 22.925 | 64.4 |

### End-to-End CLI Process Benchmarks (Node.js)

| Benchmark | Runs | Mean (ms) | p50 (ms) | p95 (ms) | Ops/sec |
| :--- | ---: | ---: | ---: | ---: | ---: |
| CLI e2e: `why-override check` (200 overrides) | 10 | 48.000 | 49.128 | 54.599 | 20.8 |
| CLI e2e: `why-override enforce` (200 overrides) | 10 | 61.115 | 61.613 | 69.063 | 16.4 |
| CLI e2e: `why-override doctor` (200 overrides, 5k lockfile) | 10 | 76.255 | 77.300 | 82.235 | 13.1 |

### In-Process Module Benchmarks (JS)

| Benchmark | Runs | Mean (ms) | p50 (ms) | p95 (ms) | Ops/sec |
| :--- | ---: | ---: | ---: | ---: | ---: |
| `collectAllManifestSelectors` (200 overrides) | 500 | 0.089 | 0.068 | 0.137 | 11,264 |
| `getOverrideTarget` x200 selectors | 500 | 0.012 | 0.008 | 0.022 | 81,890 |
| `validateReasons` (20 overrides) | 500 | 0.042 | 0.034 | 0.064 | 23,862 |
| `validateReasons` (200 overrides) | 200 | 0.212 | 0.188 | 0.326 | 4,723 |
| `runCheck` (200 overrides) | 500 | 0.179 | 0.164 | 0.216 | 5,602 |
| `printOverrideTable` (200 overrides) | 100 | 7.065 | 6.818 | 9.325 | 142 |
| `runDoctor` (50 overrides, 1,000 lockfile pkgs) | 20 | 1.382 | 1.318 | 2.882 | 724 |
| `runDoctor` (200 overrides, 5,000 lockfile pkgs) | 15 | 6.339 | 6.379 | 10.081 | 158 |
| `runDoctor` (50 overrides, 200 `node_modules` pkgs) | 15 | 9.143 | 9.050 | 10.402 | 109 |
