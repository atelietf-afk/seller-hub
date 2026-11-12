// Regras das fotos enviadas para o cadastro de produto.

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export function imageProblem(type: string, size: number): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(type)) return "Envie uma foto em JPG, PNG ou WEBP.";
  if (size <= 0) return "O arquivo está vazio.";
  if (size > IMAGE_MAX_BYTES) return "A foto passa de 8 MB. Reduza antes de enviar.";
  return null;
}

/** Legenda do Instagram: até 2.200 caracteres e no máximo 30 hashtags. */
export function captionProblem(caption: string): string | null {
  if (!caption.trim()) return "A legenda está vazia.";
  if (caption.length > 2200) return `A legenda passa de 2.200 caracteres (tem ${caption.length}).`;
  if ((caption.match(/#\S+/g) ?? []).length > 30) return "O Instagram aceita no máximo 30 hashtags.";
  return null;
}

/** Carrossel do Instagram: de 2 a 10 fotos. */
export function carouselProblem(count: number): string | null {
  if (count < 2) return "O carrossel precisa de pelo menos 2 fotos.";
  if (count > 10) return "O Instagram aceita no máximo 10 fotos no carrossel.";
  return null;
}
