import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const buf = await scrypt(password, salt, KEY_LENGTH);
  return `${salt}:${buf.toString("hex")}`;
}

// Verified against when the user doesn't exist, so login timing doesn't
// reveal which emails are registered.
const DUMMY_HASH_PROMISE = hashPassword("ephemera-dummy-password");

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const effective = stored ?? (await DUMMY_HASH_PROMISE);
  const [salt, hex] = effective.split(":");
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = await scrypt(password, salt, KEY_LENGTH);
  const match = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  return match && stored !== null;
}
