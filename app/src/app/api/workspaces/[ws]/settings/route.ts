import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isWorkspace } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";

// Les secrets ne sont jamais renvoyés en clair : on expose juste un booléen
// "configuré / non configuré" pour piloter l'affichage du formulaire.
export async function GET(_req: NextRequest, { params }: { params: { ws: string } }) {
  if (!isWorkspace(params.ws)) return NextResponse.json({ error: "workspace inconnu" }, { status: 404 });

  const s = await prisma.settings.findUnique({ where: { workspace: params.ws } });
  return NextResponse.json({
    franceTravailClientId: s?.franceTravailClientId ?? "",
    franceTravailSecretSet: Boolean(s?.franceTravailSecretEnc),
    adzunaAppId: s?.adzunaAppId ?? "",
    adzunaAppKeySet: Boolean(s?.adzunaAppKeyEnc),
    googleCseId: s?.googleCseId ?? "",
    googleCseKeySet: Boolean(s?.googleCseKeyEnc),
    hunterApiKeySet: Boolean(s?.hunterApiKeyEnc),
    gmailAddress: s?.gmailAddress ?? "",
  });
}

export async function PUT(req: NextRequest, { params }: { params: { ws: string } }) {
  if (!isWorkspace(params.ws)) return NextResponse.json({ error: "workspace inconnu" }, { status: 404 });

  const body = await req.json();
  const existing = await prisma.settings.findUnique({ where: { workspace: params.ws } });

  const data = {
    franceTravailClientId: String(body.franceTravailClientId ?? "").slice(0, 200),
    franceTravailSecretEnc: body.franceTravailSecret
      ? encryptSecret(String(body.franceTravailSecret))
      : existing?.franceTravailSecretEnc ?? "",
    adzunaAppId: String(body.adzunaAppId ?? "").slice(0, 200),
    adzunaAppKeyEnc: body.adzunaAppKey
      ? encryptSecret(String(body.adzunaAppKey))
      : existing?.adzunaAppKeyEnc ?? "",
    googleCseId: String(body.googleCseId ?? "").slice(0, 200),
    googleCseKeyEnc: body.googleCseKey
      ? encryptSecret(String(body.googleCseKey))
      : existing?.googleCseKeyEnc ?? "",
    hunterApiKeyEnc: body.hunterApiKey
      ? encryptSecret(String(body.hunterApiKey))
      : existing?.hunterApiKeyEnc ?? "",
    gmailAddress: String(body.gmailAddress ?? "").slice(0, 200),
  };

  await prisma.settings.upsert({
    where: { workspace: params.ws },
    create: { workspace: params.ws, ...data },
    update: data,
  });
  return NextResponse.json({ ok: true });
}
