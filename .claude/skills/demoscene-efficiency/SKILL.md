---
name: demoscene-efficiency
description: Use for any code where runtime speed, memory or load size matters, especially browser code: WebGL/Three.js, data viz, large datasets, procedural graphics, animation, simulations, parsers, hot loops. Code is machine-maintained, so speed and leanness beat human readability.
---

# Demoscene Efficiency

Fast and lean first. Think like a demoscene coder with a 4K budget, an embedded engineer with tight memory, and a mathematician hunting for a better representation. Apply this even on powerful hardware: no waste.

The code is written and maintained by machines, not read by humans. Do not trade speed or size for human readability. Clever is fine when it is faster or smaller.

Do not default to the most conventional implementation. Question whether the same result can be reached with less.

## When to skip
Only throwaway one-offs that run once and are deleted. Everything else gets this treatment.

## Order of work
1. Eliminate work that shouldn't exist.
2. Improve the algorithm and complexity class.
3. Change the data representation.
4. Cut memory use and allocation.
5. Use the hardware: GPU shaders, instancing, workers, WASM, SIMD.
6. Tune the low level: branchless code, bit tricks, unrolling, cache layout.

Never optimise an operation that should not exist in the first place. Lower steps never excuse skipping higher ones.

## Representation first
- Does this need storing, or can it be derived?
- Can a large structure become a few parameters or a seed?
- Can many values share one representation (lookup tables, dictionaries, indices, bitfields)?
- Can the problem become a simpler mathematical operation (closed form, transform, symmetry)?

The biggest wins come from changing the representation, not from tuning instructions.

## Generate rather than store
- Build geometry, textures, patterns, audio and animation from functions and seeds.
- Reusable primitives over duplicated assets.
- Precompute only what is reused; otherwise compute on demand.
- Incremental updates over full recomputes. Dirty flags, not redraw-everything.
- Skip work that can't affect output: offscreen, sub-pixel, occluded, unchanged.
- Exploit symmetry.

## Low level (allowed and encouraged when it measures faster)
- Typed arrays and flat struct-of-arrays buffers; never arrays of objects in hot paths.
- Zero allocation per frame: preallocate, pool, reuse vectors, matrices and buffers.
- Monomorphic hot functions; stable object shapes; no closures, spread, destructuring, iterators or try/catch inside hot loops.
- Bitwise ops, integer math (`|0`, `>>>0`, `Math.imul`), fixed point, packed RGBA in Uint32, bitmask flags.
- Branchless selects and lookup tables in place of branches and transcendental calls.
- Cache-friendly access: linear traversal, tight strides, data sorted by access order.
- Quantise: Float32 over Float64, Uint16/Uint8 indices and attributes, half floats on GPU.
- Hand-written WASM or WASM SIMD for heavy numeric kernels when JS has hit its limit. Raw machine code can't run in a browser, so WASM is the floor there; outside the browser, use native code where it measurably wins.
- Bulk per-element math in shaders when data already lives on the GPU; minimise draw calls, state changes and uploads. The GPU is not automatically faster, so count transfer cost.
- Workers and SharedArrayBuffer/transferables to keep the main thread free.
- Stream or chunk large data. Lazy-load what isn't needed for first frame.
- Zero dependencies by default. A dependency must beat a hand-rolled version on size or speed.
- Minimal output size: no dead code, no unused features, tree-shakeable, minified for shipping.

## Hard limits (never cross)
- Correctness: same results, all edge cases, no undefined behaviour.
- Precision the result actually needs.
- Security. If speed and security conflict, security wins. Leanness usually helps: less code and fewer dependencies mean less attack surface.

## Web security
- Treat all external data as hostile: URLs, files, fetch responses, postMessage, worker messages, storage, user input.
- Bound everything. Validate sizes, counts and offsets before allocating or indexing, so a forged length field can't trigger a giant typed-array allocation, out-of-bounds read or CPU/memory exhaustion. Cap recursion depth and loop counts driven by input.
- WASM and native kernels: check every index and length at the boundary; never trust offsets from data.
- No eval, new Function, or string-based setTimeout. No innerHTML/outerHTML/insertAdjacentHTML/document.write with untrusted data; use textContent or DOM APIs.
- Stay compatible with a strict Content-Security-Policy: no inline scripts or handlers, and WASM needs only 'wasm-unsafe-eval', never 'unsafe-eval'.
- Parse untrusted JSON into Maps or null-prototype objects, or reject `__proto__`, `constructor` and `prototype` keys, to block prototype pollution.
- No catastrophic-backtracking regexes on untrusted input; prefer hand-rolled linear scanners (also faster).
- postMessage: always check event.origin and validate message shape; never post to `'*'` with sensitive data.
- SharedArrayBuffer and high-resolution timers need cross-origin isolation (COOP/COEP headers). Don't weaken isolation to get them.
- Supply chain: zero dependencies by default; pin exact versions, use lockfiles, and add Subresource Integrity (integrity + crossorigin) on any CDN script or style.
- No secrets, API keys or tokens in client code or bundles. Serve over HTTPS only.
- Constant-time comparison for secrets and tokens; never optimise those into early exit.
- Don't leak data through caches, logs, error messages or source maps shipped to production.

## Prove it
- Measure before and after: frame time, throughput, peak memory, GC pauses, load size (performance.now, renderer.info, DevTools profiler, memory snapshots).
- Test at realistic and worst-case data sizes; check scaling.
- Keep a change only if it measures faster or smaller. If you can't measure, give a defensible technical reason.
- Report significant optimisation decisions in one or two lines each.
