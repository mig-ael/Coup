import { describe, expect, test } from "vitest";
import { SlidingWindow } from "../../src/rooms/limits.js";

describe("SlidingWindow", () => {
  test("allows requests up to the limit", () => {
    const window = new SlidingWindow({ max: 3, windowMs: 1000 });

    expect(window.tryConsume("a", 0)).toBe(true);
    expect(window.tryConsume("a", 100)).toBe(true);
    expect(window.tryConsume("a", 200)).toBe(true);
  });

  test("refuses the one past the limit", () => {
    const window = new SlidingWindow({ max: 2, windowMs: 1000 });
    window.tryConsume("a", 0);
    window.tryConsume("a", 10);

    expect(window.tryConsume("a", 20)).toBe(false);
  });

  test("lets the caller through again once the window has passed", () => {
    const window = new SlidingWindow({ max: 1, windowMs: 1000 });
    window.tryConsume("a", 0);

    expect(window.tryConsume("a", 999)).toBe(false);
    expect(window.tryConsume("a", 1001)).toBe(true);
  });

  test("counts each key separately, so one caller cannot lock out another", () => {
    const window = new SlidingWindow({ max: 1, windowMs: 1000 });
    window.tryConsume("a", 0);

    expect(window.tryConsume("b", 0)).toBe(true);
  });

  test("an unknown key is always allowed", () => {
    const window = new SlidingWindow({ max: 1, windowMs: 1000 });

    expect(window.tryConsume(undefined, 0)).toBe(true);
  });

  test("forgets keys that have gone quiet, rather than growing forever", () => {
    const window = new SlidingWindow({ max: 5, windowMs: 1000 });
    for (let i = 0; i < 500; i++) window.tryConsume(`ip-${i}`, 0);
    expect(window.size).toBe(500);

    // A later call sweeps out everything whose window has expired.
    window.tryConsume("someone-else", 5000);

    expect(window.size).toBe(1);
  });

  test("does not sweep keys that are still inside their window", () => {
    const window = new SlidingWindow({ max: 5, windowMs: 1000 });
    window.tryConsume("a", 0);

    window.tryConsume("b", 500);

    expect(window.size).toBe(2);
  });
});
