import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

export const DUMMY_PASSWORD_HASH = "scrypt$16384$8$1$KKLZd8YmnRg9L9LxHvqi5Q$1sNZSA5wwEBgOFFHU_vrVAEHP0uMUHlZQ-EsmEXm35DhkDdhb3Knwex_Vk4xO7XU0DVnGRVMzhv22HMVl0eR1g";
export const SEEDED_PASSWORD_HASH = "scrypt$16384$8$1$5aeMW3V8WpCSX2hvin-ijA$0oZf_HWwOW2eBmseAoGRHpyDXwxHjEKVhYDe2Ondm4F76hYYVlouqi92L20Sqjtcu5VjW7OIz0K95FwqnDFoWQ";

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
