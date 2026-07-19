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

  const data: { selected?: boolean; applied?: boolean; appliedAt?: Date | null } = {};
  if ("selected" in body) data.selected = Boolean(body.selected);
  if ("applied" in body) {
    data.applied = Boolean(body.applied);
    data.appliedAt = data.applied ? new Date() : null;
  }

  const updated = await prisma.offer.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}
