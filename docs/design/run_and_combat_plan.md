# Social Roguelike: Run, Stages, and Auto-Battle Plan

Author: Cascade
Date: 2025-11-13

## Vision Summary
- Player starts a run with their equipped items (or none).
- A seeded generator defines the run structure: number of stages per biome and their types.
- Player advances through endless stages across biomes.
- Stage types:
  - Combat stage: weighted random of single, multi, mini-boss, boss.
  - Choice stage: curated random options with costs/risks.
  - Unique event stage: bespoke scenarios (future work).
- Combat is auto-resolved. The player character is not directly controlled nor shown. You see the enemy sprite and the battle unfolds via rolls (hit/dodge/block/crit/status/items).

## Core Systems

### 1) Seeded Run & Progression
- PRNG: Deterministic per-run using a `seed` (e.g., string or number) -> use a stable PRNG (e.g., mulberry32 or xorshift128+).
- Run structure derived from seed:
  - Biomes list (cyclic or seeded roll per segment).
  - Stage counts per biome.
  - Stage types per stage with weights.
- Progression index: `(biomeIndex, stageIndex, runStageNumber)` tracked and persisted.
- Restart/resume: loading the same seed + indices recreates the same content.

### 2) Stage Types & Weights
- Stage types: `combat | choice | unique`.
- Combat subtypes: `single | multi | miniboss | boss`.
- Weighted rolls (seeded):
  - Example defaults: single 60%, multi 25%, miniboss 10%, boss 5% (tunable per biome and stage depth).
- Choice stage generator:
  - Build a curated pool then sample by tags (risk/reward, economy, tradeoffs), always respecting seed.
- Unique events: placeholder registry; future content packs can extend.

### 3) Auto-Battle Combat Model
- No player movement or aiming.
- Entities: PlayerParty (implicit single actor for now) vs EnemyParty (1+ enemies).
- Turn or tick-based resolution:
  - Initiative per tick, or strict turn order.
  - Rolls: hit chance, dodge, block, crit, damage range.
  - Status effects: poison, burn, stun, slow, bleed, shield, etc.
  - Item hooks: pre-roll, on-hit, on-dodge, on-damage, on-kill, turn-start/end.
- Output log: battle feed for UX; animations tied to events (later).

### 4) Items
- Equippable outside run; snapshot into run as `run_items` at start.
- Data model: id, name, tier, tags, passive/active effects, hooks.
- Effect system: composable functions invoked by battle engine hooks.

### 5) Persistence (Supabase)
- Tables (conceptual; SQL added separately via SQL editor):
  - `runs` (id, user_id, seed, biome_index, stage_index, stage_count_map, created_at, updated_at, status: active/abandoned/won/lost)
  - `run_items` (run_id, item_id, stacks, meta)
  - `run_log` (optional, recent entries or summary for resume)
- Autosave on:
  - Start run
  - After resolving stage (combat/choice)
  - After rewards applied
- Resume on app load if `runs.status = 'active'` exists.
- RLS: Standard per-user access via `user_id = auth.uid()`.

### 6) State Management
- Central `GameManager` service (non-UI) to orchestrate run lifecycle.
- State machine (high level):
  - idle -> starting_run -> at_stage -> resolving_stage -> applying_rewards -> advancing -> completed/failed
- BattleManager state (sub-machine):
  - idle -> setup -> resolving -> concluded
- React UI reads from managers via a light adapter; no logic in components.

## Data & DTOs (App Layer)
- `RunDTO`: { id, user_id, seed, biomeIndex, stageIndex, stagePlan, status }
- `StagePlan`: { biomeId, index, type: 'combat'|'choice'|'unique', combatType?: 'single'|'multi'|'miniboss'|'boss' }
- `BattleResult`: { outcome: 'win'|'loss', rewards, log[] }
- `ChoiceOption`: { id, label, description, apply(run): RunDelta, risk?: number }

## Implementation Roadmap

1. PRNG & Seeding (High)
   - Add `lib/rng.ts` with deterministic PRNG and helpers: `pickWeighted`, `shuffle`, `int`, `float`.
   - Unit tests to lock behavior.

2. Run Bootstrap (High)
   - `services/GameManager` with `startRun(seed?)`, `resumeRun()`, `advance()`, `getCurrentStage()`.
   - Persist run start to Supabase; snapshot equipped items to `run_items`.

3. Stage Generation (High)
   - Given seed + indices, generate StagePlan for current stage.
   - Implement weights for combat subtypes per biome.

4. BattleManager + Single Combat (High)
   - Minimal engine: single enemy, tick-based rolls, item hooks empty.
   - Deterministic using PRNG seeded with (runSeed + stageNumber).
   - Return BattleResult + reward stub.

5. Choice Stage Scaffolding (High)
   - Registry of options and a sampler using PRNG.
   - Apply deltas to run (HP, items, gold) and autosave.

6. Unique Event Scaffold (Medium)
   - Event registry; display stub UI; no-op outcomes for now.

7. Persistence & Resume (High)
   - Autosave at key points; `resumeRun()` picks up active run.
   - Test RLS and error handling.

8. Items (High)
   - Basic item definitions and stubbed hooks.
   - Read-only integration to BattleManager (effects not fully implemented yet).

## UX Notes
- Show only enemy sprites and a battle log during combat stages.
- Smooth transitions between stages with a short summary card.
- Non-blocking autosave with inline feedback (icon/spinner) when saving.

## Testing
- Unit tests for RNG determinism and weighted picks.
- Battle sim deterministic test with known seed.
- GameManager stage progression tests.

## Risks & Mitigations
- PRNG drift: keep a single source of random and pass explicitly.
- Async persistence failures: retry with backoff; keep local shadow until confirmed.
- Overcomplex item hooks: start minimal, add composition utilities.
