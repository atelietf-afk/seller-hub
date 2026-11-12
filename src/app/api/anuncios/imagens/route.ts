import { NextResponse } from "next/server";
import { imageProblem } from "@/lib/analytics/images";
import { addImage } from "@/lib/data/images";
import { can } from "@/lib/analytics/team";
import { currentAccount } from "@/lib/session";

// Envio de foto de um produto: POST com o campo "productId" e o arquivo "file".
export async function POST(request: Request) {
  const { ownerId, role } = await currentAccount();
  if (!can(role, "operar")) return NextResponse.json({ erro: "Sem permissão para enviar fotos." }, { status: 403 });
  const form = await request.formData();
  const productId = String(form.get("productId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ erro: "Escolha uma foto." }, { status: 400 });
  const problem = imageProblem(file.type, file.size);
  if (problem) return NextResponse.json({ erro: problem }, { status: 400 });
  try {
    const id = await addImage(ownerId, productId, file.type, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 });
  }
}
