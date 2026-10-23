import { after, NextResponse } from "next/server";
import { one } from "@/lib/db";
import { processNotification } from "@/lib/ml/notifications";
import type { MlNotification } from "@/lib/ml/types";

export const maxDuration = 60;

// Webhook do Mercado Livre. O ML exige resposta 200 rápida; o processamento vem depois.
export async function POST(request: Request) {
  let n: MlNotification;
  try {
    n = (await request.json()) as MlNotification;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (String(n.application_id) !== process.env.ML_CLIENT_ID || !n.resource || !n.topic || !n.user_id) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const row = await one<{ id: string }>(
    "insert into ml_notifications (topic, resource, ml_user_id, attempts) values ($1, $2, $3, $4) returning id",
    [n.topic, n.resource, n.user_id, n.attempts ?? null],
  ).catch(() => null);
  if (!row) return NextResponse.json({ ok: false }, { status: 500 }); // o ML reenvia

  after(() => processNotification(row.id, n).catch((err) => console.error("Notificação falhou", n.resource, err)));
  return NextResponse.json({ ok: true });
}
