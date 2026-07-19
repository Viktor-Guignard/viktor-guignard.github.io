import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isWorkspace } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { searchFranceTravail } from "@/lib/providers/franceTravail";
import { searchAdzuna } from "@/lib/providers/adzuna";
import { searchGoogleCse } from "@/lib/providers/googleCse";
import { searchArbeitnow } from "@/lib/providers/arbeitnow";
import type { NormalizedOffer } from "@/lib/providers/types";

export async function POST(_req: NextRequest, { params }: { params: { ws: string } }) {
  if (!isWorkspace(params.ws)) return NextResponse.json({ error: "workspace inconnu" }, { status: 404 });

  const [profile, settings] = await Promise.all([
    prisma.profile.findUnique({ where: { workspace: params.ws } }),
    prisma.settings.findUnique({ where: { workspace: params.ws } }),
  ]);

  if (!profile?.poste) {
    return NextResponse.json(
      { error: "Renseigne d'abord un poste recherché dans « Mon profil »." },
      { status: 400 }
    );
  }

  const errors: string[] = [];
  const results = await Promise.allSettled([
    searchFranceTravail({
      clientId: settings?.franceTravailClientId ?? "",
      clientSecret: settings?.franceTravailSecretEnc ? decryptSecret(settings.franceTravailSecretEnc) : "",
      motsCles: profile.poste,
      localisation: profile.localisation,
    }),
    searchAdzuna({
      appId: settings?.adzunaAppId ?? "",
      appKey: settings?.adzunaAppKeyEnc ? decryptSecret(settings.adzunaAppKeyEnc) : "",
      what: profile.poste,
      where: profile.localisation,
    }),
    searchGoogleCse({
      cseId: settings?.googleCseId ?? "",
      apiKey: settings?.googleCseKeyEnc ? decryptSecret(settings.googleCseKeyEnc) : "",
      query: profile.poste,
    }),
    searchArbeitnow({ query: profile.poste }),
  ]);

  const labels = ["France Travail", "Adzuna", "Google CSE", "Arbeitnow"];
  const offers: NormalizedOffer[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") offers.push(...r.value);
    else {
      const cause = r.reason?.cause?.message ?? r.reason?.cause?.code ?? "";
      errors.push(`${labels[i]} : ${r.reason?.message ?? "erreur inconnue"}${cause ? ` (${cause})` : ""}`);
    }
  });

  for (const o of offers) {
    await prisma.offer.upsert({
      where: { workspace_externalId: { workspace: params.ws, externalId: o.externalId } },
      create: { workspace: params.ws, ...o },
      update: { ...o, workspace: params.ws },
    });
  }

  const stored = await prisma.offer.findMany({
    where: { workspace: params.ws },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  return NextResponse.json({ offers: stored, foundCount: offers.length, errors });
}
