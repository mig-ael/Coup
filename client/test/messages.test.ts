import { describe, expect, test } from "vitest";
import { errorText } from "../src/messages.js";

describe("errorText", () => {
  test("puts a known server code into plain words", () => {
    expect(errorText("not_host")).toBe("Only the host can do that.");
    expect(errorText("room_not_found")).toBe("No game with that code.");
  });

  test("shows an unrecognised message rather than swallowing it", () => {
    // A failure we have no mapping for must still reach the player, or a deployment
    // problem is indistinguishable from a bug.
    expect(errorText("Failed to fetch")).toBe("Failed to fetch");
    expect(errorText("getaddrinfo ENOTFOUND example.com")).toContain("ENOTFOUND");
  });

  test("falls back only when there is genuinely nothing to say", () => {
    expect(errorText("")).toBe("Something went wrong.");
  });
});
