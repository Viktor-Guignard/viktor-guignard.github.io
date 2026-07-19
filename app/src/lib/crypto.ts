import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY manquante ou invalide (attendu: 64 caractères hex / 32 octets)");
  }
  return Buffer.from(hex, "hex");
}

// Stocke iv + tag + ciphertext en un seul champ base64, séparés par ":"
export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  if (!stored) return "";
  const [ivB64, tagB64, dataB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !dataB64) return "";
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return plain.toString("utf8");
}
