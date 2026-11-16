import { pushEvents } from "@/lib/ml/store";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { PUSH_CHAT, verifyPushSignature } from "@/lib/shopee/push";
import { shopeeConfig } from "@/lib/shopee/config";

// Avisos da Shopee. Sempre responde 2xx com corpo vazio (exigência da Shopee, senão ela repete o aviso).
export async function POST(request: Request) {
  const body = await request.text();
  const url = `${env("BETTER_AUTH_URL").replace(/\/$/, "")}/api/shopee/push`;
  if (!verifyPushSignature(url, body, shopeeConfig().partnerKey, request.headers.get("authorization"))) {
    return new Response(null, { status: 401 });
  }
  const data = JSON.parse(body || "{}") as { shop_id?: number; code?: number };
  if (data.code === PUSH_CHAT && data.shop_id) {
    const accounts = await query<{ id: string }>("select id from ml_accounts where marketplace = 'shopee' and ml_user_id = $1", [
      data.shop_id,
    ]);
    for (const a of accounts) {
      await pushEvents(a.id, [
        {
          kind: "alert",
          severity: "info",
          title: "Nova mensagem de cliente na Shopee",
          body: "Abra o chat da Shopee para responder.",
          dedupeKey: `shopee-chat:${data.shop_id}:${Date.now()}`,
        },
      ]);
    }
  }
  return new Response(null, { status: 200 });
}
