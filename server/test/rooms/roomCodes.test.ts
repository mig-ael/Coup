import { describe, expect, test } from "vitest";
import {
  generateRoomCode,
  isRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from "../../src/rooms/roomCodes.js";

describe("the code alphabet", () => {
  test("excludes characters that are easy to misread aloud or on screen", () => {
    for (const ambiguous of ["0", "O", "1", "I", "L"]) {
      expect(ROOM_CODE_ALPHABET).not.toContain(ambiguous);
    }
  });

  test("is uppercase letters and digits only", () => {
    expect(ROOM_CODE_ALPHABET).toMatch(/^[A-Z2-9]+$/);
  });
});

describe("generateRoomCode", () => {
  test("is the configured length and drawn from the alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      for (const char of code) expect(ROOM_CODE_ALPHABET).toContain(char);
    }
  });

  test("does not repeat itself in any practical run", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateRoomCode()));

    expect(codes.size).toBe(500);
  });
});

describe("normalizeRoomCode", () => {
  test("uppercases what the player typed", () => {
    expect(normalizeRoomCode("abcde")).toBe("ABCDE");
  });

  test("ignores surrounding whitespace", () => {
    expect(normalizeRoomCode("  abcde \n")).toBe("ABCDE");
  });
});

describe("isRoomCode", () => {
  test("accepts a freshly generated code", () => {
    expect(isRoomCode(generateRoomCode())).toBe(true);
  });

  test("accepts a lowercase code, since players will type it that way", () => {
    expect(isRoomCode("abcde")).toBe(true);
  });

  test("rejects the wrong length", () => {
    expect(isRoomCode("ABCD")).toBe(false);
    expect(isRoomCode("ABCDEF")).toBe(false);
  });

  test("rejects characters outside the alphabet", () => {
    expect(isRoomCode("ABC0E")).toBe(false);
    expect(isRoomCode("AB-DE")).toBe(false);
  });

  test("rejects an empty string", () => {
    expect(isRoomCode("")).toBe(false);
  });
});
