import { publicImage } from "@/lib/data/images";

// Foto pública do produto. O endereço tem um código aleatório (UUID), que é o que protege a imagem.
// A extensão no fim (.jpg, .png, .webp) é só para os serviços que exigem o formato no endereço.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = raw.replace(/\.(jpe?g|png|webp)$/i, "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Não encontrada", { status: 404 });
  const image = await publicImage(id);
  if (!image) return new Response("Não encontrada", { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: { "Content-Type": image.content_type, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
