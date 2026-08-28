import { describe, expect, test } from "vitest";
import { CARDS } from "@coup/shared";
import { createDeck, shuffle, createRng } from "../../src/game/deck.js";

describe("createDeck", () => {
  test("contains three copies of each of the five characters", () => {
    const deck = createDeck();

    expect(deck).toHaveLength(15);
    for (const card of CARDS) {
      expect(deck.filter((c) => c === card)).toHaveLength(3);
    }
  });
});

describe("shuffle", () => {
  test("same seed produces the same order", () => {
    const a = shuffle(createDeck(), createRng(1234));
    const b = shuffle(createDeck(), createRng(1234));

    expect(a).toEqual(b);
  });

  test("different seeds produce different orders", () => {
    const a = shuffle(createDeck(), createRng(1));
    const b = shuffle(createDeck(), createRng(2));

    expect(a).not.toEqual(b);
  });

  test("preserves the exact multiset of cards", () => {
    const shuffled = shuffle(createDeck(), createRng(99));

    expect([...shuffled].sort()).toEqual([...createDeck()].sort());
  });

  test("does not mutate the input", () => {
    const deck = createDeck();
    const before = [...deck];

    shuffle(deck, createRng(7));

    expect(deck).toEqual(before);
  });
});
