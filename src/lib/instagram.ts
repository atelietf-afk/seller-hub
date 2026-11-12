import "server-only";
import { env } from "@/lib/env";

// Publicação no Instagram pela Graph API. Duas etapas: cria o contêiner com a foto e depois publica.
// Usa IG_USER_ID e META_ACCESS_TOKEN (variáveis da Vercel). A Meta baixa a foto pelo link público.

const GRAPH = "https://graph.facebook.com/v21.0";

export function instagramConfigured() {
  return !!(process.env.IG_USER_ID && process.env.META_ACCESS_TOKEN);
}

/** Endereço público da foto, como a Meta precisa para baixá-la. */
export function publicImageUrl(imageId: string) {
  return `${env("BETTER_AUTH_URL").replace(/\/$/, "")}/api/imagens/${imageId}`;
}

async function graph(path: string, body: Record<string, string>) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, access_token: process.env.META_ACCESS_TOKEN ?? "" }).toString(),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) throw new Error(json.error?.message ?? `Meta respondeu ${res.status}`);
  return json.id;
}

export async function publishPhoto(imageUrl: string, caption: string): Promise<string> {
  const igUser = process.env.IG_USER_ID ?? "";
  const creationId = await graph(`${igUser}/media`, { image_url: imageUrl, caption });
  return graph(`${igUser}/media_publish`, { creation_id: creationId });
}
