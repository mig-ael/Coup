import { CARDS, COPIES_PER_CARD, type Card } from "@coup/shared";

/**
 * Deterministic PRNG (mulberry32). The engine carries one of these in its state so
 * that a game is fully reproducible from its seed plus the list of commands applied,
 * which is what makes rules tests deterministic and bug reports replayable.
 */
export interface Rng {
  (): number;
  /** Current position, so it can be persisted in game state and resumed later. */
  seed: number;
}

export function createRng(seed: number): Rng {
  const rng = (() => {
    rng.seed = (rng.seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(rng.seed ^ (rng.seed >>> 15), 1 | rng.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  rng.seed = seed >>> 0;
  return rng;
}

/** A fresh Court deck: three copies of each character, unshuffled. */
export function createDeck(): Card[] {
  return CARDS.flatMap((card) => Array<Card>(COPIES_PER_CARD).fill(card));
}

/** Fisher-Yates. Returns a new array; the input is left untouched. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
