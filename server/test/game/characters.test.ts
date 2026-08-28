import { describe, expect, test } from "vitest";
import { CARDS, characterAbilities } from "@coup/shared";

describe("characterAbilities", () => {
  test("Duke taxes and blocks foreign aid", () => {
    expect(characterAbilities("Duke")).toEqual({ action: "tax", blocks: ["foreign_aid"] });
  });

  test("Assassin assassinates and blocks nothing", () => {
    expect(characterAbilities("Assassin")).toEqual({ action: "assassinate", blocks: [] });
  });

  test("Captain steals and blocks stealing", () => {
    expect(characterAbilities("Captain")).toEqual({ action: "steal", blocks: ["steal"] });
  });

  test("Ambassador exchanges and blocks stealing", () => {
    expect(characterAbilities("Ambassador")).toEqual({ action: "exchange", blocks: ["steal"] });
  });

  test("Contessa has no action and blocks assassination", () => {
    expect(characterAbilities("Contessa")).toEqual({ action: null, blocks: ["assassinate"] });
  });

  test("every character either acts or blocks", () => {
    for (const card of CARDS) {
      const { action, blocks } = characterAbilities(card);
      expect(action !== null || blocks.length > 0).toBe(true);
    }
  });
});
