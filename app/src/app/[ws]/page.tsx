import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isWorkspace, Workspace } from "@/lib/auth";
import Workspace_ from "./Workspace";

const LABELS: Record<Workspace, { name: string; tag: string }> = {
  elomty: { name: "Elomty", tag: "Indonésie" },
  didi: { name: "Didi", tag: "Berbère" },
};

export default async function WorkspacePage({ params }: { params: { ws: string } }) {
  if (!isWorkspace(params.ws)) notFound();
  const ws = params.ws;

  const [profile, settings, offers] = await Promise.all([
    prisma.profile.findUnique({ where: { workspace: ws } }),
    prisma.settings.findUnique({ where: { workspace: ws } }),
    prisma.offer.findMany({ where: { workspace: ws }, orderBy: { createdAt: "desc" }, take: 60 }),
  ]);

  return (
    <Workspace_
      ws={ws}
      label={LABELS[ws]}
      initialProfile={
        profile ?? { workspace: ws, poste: "", localisation: "", experience: "", secteurs: "" }
      }
      initialSettings={{
        franceTravailClientId: settings?.franceTravailClientId ?? "",
        franceTravailSecretSet: Boolean(settings?.franceTravailSecretEnc),
        adzunaAppId: settings?.adzunaAppId ?? "",
        adzunaAppKeySet: Boolean(settings?.adzunaAppKeyEnc),
        googleCseId: settings?.googleCseId ?? "",
        googleCseKeySet: Boolean(settings?.googleCseKeyEnc),
        gmailAddress: settings?.gmailAddress ?? "",
      }}
      initialOffers={offers.map((o) => ({
        id: o.id,
        titre: o.titre,
        entreprise: o.entreprise,
        lieu: o.lieu,
        contact: o.contact,
        exigences: o.exigences,
        source: o.source,
        url: o.url,
        selected: o.selected,
      }))}
    />
  );
}
