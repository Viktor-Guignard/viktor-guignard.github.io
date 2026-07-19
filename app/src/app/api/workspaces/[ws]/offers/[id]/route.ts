import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isWorkspace } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: { ws: string; id: string } }) {
  if (!isWorkspace(params.ws)) return NextResponse.json({ error: "workspace inconnu" }, { status: 404 });

  const body = await req.json();
  const offer = await prisma.offer.findUnique({ where: { id: params.id } });
  if (!offer || offer.workspace !== params.ws) {
    return NextResponse.json({ error: "offre introuvable" }, { status: 404 });
  }

  const updated = await prisma.offer.update({
    where: { id: params.id },
    data: { selected: Boolean(body.selected) },
  });
  return NextResponse.json(updated);
}
