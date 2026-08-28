import { randomInt } from "node:crypto";

/**
 * Uppercase alphanumerics minus the characters players confuse when reading a code
 * off a screen or hearing it over voice chat: O/0, I/1/L.
 */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const ROOM_CODE_LENGTH = 5;

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** Players type codes however they like; treat them case- and whitespace-insensitively. */
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isRoomCode(input: string): boolean {
  const code = normalizeRoomCode(input);
  if (code.length !== ROOM_CODE_LENGTH) return false;
  return [...code].every((char) => ROOM_CODE_ALPHABET.includes(char));
}
