import { describe, expect, test } from "vitest";
import { legalActions } from "../../src/game/rules.js";
import { startedGame } from "../helpers.js";

describe("legalActions", () => {
  test("a player with 2 coins may take any action except coup or assassinate", () => {
    const state = startedGame({ coins: { alice: 2 } });

    expect(legalActions(state, "alice").map((a) => a.action)).toEqual([
      "income",
      "foreign_aid",
      "tax",
      "steal",
      "exchange",
    ]);
  });

  test("assassinate unlocks at 3 coins", () => {
    const state = startedGame({ coins: { alice: 3 } });

    expect(legalActions(state, "alice").map((a) => a.action)).toContain("assassinate");
  });

  test("coup unlocks at 7 coins", () => {
    const poor = startedGame({ coins: { alice: 6 } });
    const rich = startedGame({ coins: { alice: 7 } });

    expect(legalActions(poor, "alice").map((a) => a.action)).not.toContain("coup");
    expect(legalActions(rich, "alice").map((a) => a.action)).toContain("coup");
  });

  test("a player holding 10 coins may only coup", () => {
    const state = startedGame({ coins: { alice: 10 } });

    expect(legalActions(state, "alice").map((a) => a.action)).toEqual(["coup"]);
  });

  test("the forced coup still applies above 10 coins", () => {
    const state = startedGame({ coins: { alice: 12 } });

    expect(legalActions(state, "alice").map((a) => a.action)).toEqual(["coup"]);
  });

  test("a player who is not on turn has no legal actions", () => {
    const state = startedGame({});

    expect(legalActions(state, "bob")).toEqual([]);
  });

  test("targeted actions list every living opponent as a target", () => {
    const state = startedGame({ coins: { alice: 7 } });

    const coup = legalActions(state, "alice").find((a) => a.action === "coup");

    expect(coup?.targets).toEqual(["bob", "carol"]);
  });

  test("untargeted actions carry no targets", () => {
    const state = startedGame({});

    const income = legalActions(state, "alice").find((a) => a.action === "income");

    expect(income?.targets).toBeUndefined();
  });

  test("eliminated players are not valid targets", () => {
    const state = startedGame({ coins: { alice: 7 }, eliminated: ["bob"] });

    const coup = legalActions(state, "alice").find((a) => a.action === "coup");

    expect(coup?.targets).toEqual(["carol"]);
  });

  test("steal cannot target a player holding no coins", () => {
    const state = startedGame({ coins: { bob: 0 } });

    const steal = legalActions(state, "alice").find((a) => a.action === "steal");

    expect(steal?.targets).toEqual(["carol"]);
  });

  test("steal is not offered when no opponent has coins", () => {
    const state = startedGame({ coins: { bob: 0, carol: 0 } });

    expect(legalActions(state, "alice").map((a) => a.action)).not.toContain("steal");
  });

  test("a targeted action with no valid targets is not offered", () => {
    const state = startedGame({ coins: { alice: 7 }, eliminated: ["bob", "carol"] });

    expect(legalActions(state, "alice").map((a) => a.action)).not.toContain("coup");
  });
});
