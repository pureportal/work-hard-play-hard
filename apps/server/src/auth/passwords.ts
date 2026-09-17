import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
const KEY_LENGTH = 64;
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 3;
const MAX_MEMORY = 64 * 1024 * 1024;

export const DUMMY_PASSWORD_HASH = "scrypt$32768$8$3$an6VTKvjpN3AxoCuHjveDg$kWcLdzWAJA3Hb3V8zVSmO7L54Or46X4qEs0rLZ2AU71iDpF2qk51255vl6tnQUnF-CAnHCc_3taMf9_RNWfvnA";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt, COST, BLOCK_SIZE, PARALLELIZATION);
  return ["scrypt", COST, BLOCK_SIZE, PARALLELIZATION, salt.toString("base64url"), derivedKey.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, costSource, blockSizeSource, parallelizationSource, saltSource, hashSource] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !costSource || !blockSizeSource || !parallelizationSource || !saltSource || !hashSource) {
    return false;
  }
  const expected = Buffer.from(hashSource, "base64url");
  if (expected.length !== KEY_LENGTH) {
    return false;
  }
  const actual = await deriveKey(
    password,
    Buffer.from(saltSource, "base64url"),
    Number(costSource),
    Number(blockSizeSource),
    Number(parallelizationSource),
  );
  return timingSafeEqual(actual, expected);
}

async function deriveKey(password: string, salt: Buffer, cost: number, blockSize: number, parallelization: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: MAX_MEMORY,
    }, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}
