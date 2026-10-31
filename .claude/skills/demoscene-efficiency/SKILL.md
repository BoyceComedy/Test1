---
name: demoscene-efficiency
description: Use when building performance-sensitive browser code: WebGL/Three.js scenes, data viz, large datasets, procedural graphics or animation. Skip for small scripts and one-off tools.
---

# Demoscene Efficiency

Achieve more with less. Think like a demoscene coder with a 4K budget, an embedded engineer with tight memory, and a mathematician hunting for a better representation. Apply this even on powerful hardware: the goal is not minimal resources at any cost, it is no waste.

Do not default to the most conventional implementation. Question whether the same result can be reached with less.

## When to skip
Small scripts, one-off tools, and quick prototypes where writing speed matters more than runtime. Don't over-engineer.

## Order of work
1. Eliminate work that shouldn't exist.
2. Improve the algorithm.
3. Change the data representation.
4. Cut memory use and allocation.
5. Use the hardware (GPU, instancing, workers).
6. Tune implementation details.

Never optimise an operation that should not exist in the first place.

## Representation first
Before writing code, ask:
- Does this need storing, or can it be derived?
- Can a large structure become a few parameters or a seed?
- Can many values share one representation (lookup tables, dictionaries, indices)?
- Can the problem become a simpler mathematical operation?

The biggest wins usually come from changing the representation, not from tuning instructions.

## Generate rather than store
- Build geometry, textures, patterns and animation from functions and seeds.
- Use reusable primitives instead of duplicated assets.
- Precompute only results that are reused; otherwise compute on demand.
- Prefer incremental updates to full recomputes.
- Skip work that can't affect the output (offscreen, sub-pixel, unchanged).
- Exploit symmetry.

## Browser specifics
- For large collections, use typed arrays and flat buffers instead of arrays of objects.
- Use shared geometry and material with InstancedMesh instead of many separate meshes.
- Reuse vectors, matrices and buffers in hot loops; no allocations per frame.
- Move bulk math to shaders when the data already lives on the GPU. Count upload and setup cost, because the GPU is not automatically faster.
- Quantise where precision allows: Float32 over Float64, Uint16 indices, packed colours.
- Stream or chunk large data instead of loading everything at once.
- Add a framework or dependency only when it earns its weight.

## Guardrails
- Readability over cleverness. No code golf, obscure bit tricks, or micro-optimisation without a measured win.
- Use established libraries where they are already efficient.
- Don't drop precision the result needs.
- Never trade away correctness or security.

## Prove it
- Measure before and after: frame time, peak memory, load size (performance.now, renderer.info, DevTools).
- Test with realistic data sizes and check how it scales.
- If you can't measure, give a defensible technical explanation. Never claim a win without one or the other.
- Briefly explain significant optimisation decisions in your reply.
