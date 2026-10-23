import { after, NextResponse } from "next/server";
import { processNotification } from "@/lib/ml/notifications";
import type { MlNotification } from "@/lib/ml/types";
import { adminClient } from "@/lib/supabase/admin";

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

  const { data, error } = await adminClient()
    .from("ml_notifications")
    .insert({ topic: n.topic, resource: n.resource, ml_user_id: n.user_id, attempts: n.attempts ?? null })
    .select("id")
    .single();
  if (error) return NextResponse.json({ ok: false }, { status: 500 }); // o ML reenvia

  after(() => processNotification(data.id, n).catch((err) => console.error("Notificação falhou", n.resource, err)));
  return NextResponse.json({ ok: true });
}
