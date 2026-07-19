// Utilise Web Crypto (SubtleCrypto) plutôt que le module "crypto" de Node,
// car ce fichier est importé par le middleware qui tourne en Edge runtime.

export const SESSION_COOKIE = "elomty_didi_session";

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET manquante");
  return s;
}

async function hmacHex(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Cookie = "<expiryTimestamp>.<hmacHex>" — pas de session en base, juste une preuve
// que le porteur connaissait SITE_PASSWORD au moment de l'émission.
export async function createSessionCookieValue(): Promise<string> {
  const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 jours
  const hmac = await hmacHex(String(expiry));
  return `${expiry}.${hmac}`;
}

export async function isValidSessionCookieValue(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [expiryStr, hmac] = value.split(".");
  if (!expiryStr || !hmac) return false;
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;

  const expected = await hmacHex(expiryStr);
  return timingSafeEqualStr(hmac, expected);
}

export function checkSitePassword(candidate: string): boolean {
  const real = process.env.SITE_PASSWORD;
  if (!real) return false;
  return timingSafeEqualStr(candidate, real);
}

export const WORKSPACES = ["elomty", "didi"] as const;
export type Workspace = (typeof WORKSPACES)[number];

export function isWorkspace(value: string): value is Workspace {
  return (WORKSPACES as readonly string[]).includes(value);
}
