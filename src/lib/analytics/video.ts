// Regras de vídeo por loja. Os valores são conservadores e precisam ser conferidos na
// documentação de cada loja antes de publicar (elas mudam essas regras com frequência).

export const VIDEO_PLATFORMS = ["mercadolivre", "shopee", "amazon", "loja_integrada"] as const;
export type VideoPlatform = (typeof VIDEO_PLATFORMS)[number];

export interface VideoSpec {
  label: string;
  aspect: [number, number];
  maxSeconds: number;
  maxMB: number;
  toConfirm: string;
}

export const VIDEO_SPECS: Record<VideoPlatform, VideoSpec> = {
  mercadolivre: {
    label: "Mercado Livre",
    aspect: [1, 1],
    maxSeconds: 60,
    maxMB: 50,
    toConfirm: "proporção e duração máxima do vídeo do anúncio",
  },
  shopee: { label: "Shopee", aspect: [1, 1], maxSeconds: 60, maxMB: 30, toConfirm: "proporção e tamanho máximo do vídeo do produto" },
  amazon: { label: "Amazon", aspect: [1, 1], maxSeconds: 60, maxMB: 50, toConfirm: "requisitos de vídeo do listing da categoria" },
  loja_integrada: { label: "Loja Integrada", aspect: [4, 5], maxSeconds: 60, maxMB: 50, toConfirm: "formato aceito pelo tema do seu site" },
};

export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

export function videoProblem(type: string, sizeMB: number): string | null {
  if (!(VIDEO_TYPES as readonly string[]).includes(type)) return "Envie um vídeo em MP4, MOV ou WEBM.";
  if (sizeMB > 500) return "O vídeo passa de 500 MB. Corte ou comprima antes de enviar.";
  return null;
}

/** Janela de corte: começa no início escolhido e não passa do máximo da loja. */
export function clipWindow(duration: number, start: number, maxSeconds: number) {
  const from = Math.max(0, Math.min(start, Math.max(0, duration - 1)));
  const length = Math.min(maxSeconds, duration - from);
  return { from: round(from), length: round(length) };
}

/** Recorte centralizado na proporção da loja (sem esticar a imagem). */
export function centerCrop(width: number, height: number, [aw, ah]: [number, number]) {
  const target = aw / ah;
  if (width / height > target) {
    const w = Math.round(height * target);
    return { x: Math.round((width - w) / 2), y: 0, w, h: height };
  }
  const h = Math.round(width / target);
  return { x: 0, y: Math.round((height - h) / 2), w: width, h };
}

/** Tamanho de saída: lado menor de no máximo 1080 px, com número par (exigência do H.264). */
export function outputSize(aspect: [number, number], maxSide = 1080) {
  const [aw, ah] = aspect;
  const scale = aw >= ah ? maxSide / ah : maxSide / aw;
  const even = (n: number) => Math.round(n / 2) * 2;
  return { w: even(aw * scale), h: even(ah * scale) };
}

const round = (n: number) => Math.round(n * 100) / 100;
