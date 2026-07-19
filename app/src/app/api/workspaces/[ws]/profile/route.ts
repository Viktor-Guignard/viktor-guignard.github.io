import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isWorkspace } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: { ws: string } }) {
  if (!isWorkspace(params.ws)) return NextResponse.json({ error: "workspace inconnu" }, { status: 404 });

  const profile = await prisma.profile.findUnique({ where: { workspace: params.ws } });
  return NextResponse.json(
    profile ?? { workspace: params.ws, poste: "", localisation: "", experience: "", secteurs: "" }
  );
}

export async function PUT(req: NextRequest, { params }: { params: { ws: string } }) {
  if (!isWorkspace(params.ws)) return NextResponse.json({ error: "workspace inconnu" }, { status: 404 });

  const body = await req.json();
  const data = {
    poste: String(body.poste ?? "").slice(0, 200),
    localisation: String(body.localisation ?? "").slice(0, 200),
    experience: String(body.experience ?? "").slice(0, 200),
    secteurs: String(body.secteurs ?? "").slice(0, 200),
  };

  const profile = await prisma.profile.upsert({
    where: { workspace: params.ws },
    create: { workspace: params.ws, ...data },
    update: data,
  });
  return NextResponse.json(profile);
}
