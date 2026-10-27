// Palavras-chave: o que as pessoas buscam e o que os mais vendidos usam no título
// que o anúncio do vendedor ainda não tem.

const STOPWORDS = new Set(
  "a o as os de da do das dos e em no na nos nas para pra por um uma uns umas ao aos p c 1 x".split(" "),
);

/** minúsculas, sem acento, sem pontuação. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Plural simples do português: "fones" → "fone", "capas" → "capa",
 * "carregadores" → "carregador", "luzes" → "luz". ("com" e "sem" ficam: mudam o sentido, ex.: "sem fio".)
 */
const stem = (t: string) =>
  t.length > 5 && /(r|z|s)es$/.test(t) ? t.slice(0, -2) : t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t;

function titleStems(title: string) {
  return new Set(tokens(title).map(stem));
}

/** Uma busca está "coberta" quando todas as suas palavras aparecem no título. */
export function coversKeyword(title: string, keyword: string): boolean {
  const have = titleStems(title);
  const need = tokens(keyword).map(stem);
  return need.length > 0 && need.every((t) => have.has(t));
}

export interface TrendGap {
  keyword: string;
  position: number;
  missing: string[]; // palavras da busca que faltam no título
}

/**
 * Buscas em alta da categoria que o título não cobre, priorizando as que têm
 * alguma relação com o anúncio (compartilham ao menos uma palavra).
 */
export function trendGaps(title: string, trends: { keyword: string; position: number }[], limit = 8): TrendGap[] {
  const have = titleStems(title);
  return trends
    .filter((t) => !coversKeyword(title, t.keyword))
    .map((t) => {
      const words = tokens(t.keyword);
      const missing = words.filter((w) => !have.has(stem(w)));
      const related = words.length - missing.length > 0;
      return { keyword: t.keyword, position: t.position, missing, related };
    })
    .filter((t) => t.related && t.missing.length > 0)
    .sort((a, b) => a.position - b.position)
    .slice(0, limit)
    .map(({ keyword, position, missing }) => ({ keyword, position, missing }));
}

export interface TermGap {
  term: string;
  share: number; // fração dos mais vendidos que usa o termo
}

/**
 * Termos comuns nos títulos dos mais vendidos e ausentes no título do vendedor.
 * Um par de palavras ("sem fio") só entra quando as duas faltam no título e
 * aparecem sempre juntas nos concorrentes; senão vira só a palavra que falta.
 */
export function competitorTermGaps(title: string, competitorTitles: string[], minShare = 0.3, limit = 10): TermGap[] {
  if (!competitorTitles.length) return [];
  const have = titleStems(title);
  const words = new Map<string, number>();
  const pairs = new Map<string, number>();
  for (const t of competitorTitles) {
    const ws = tokens(t).map(stem);
    for (const w of new Set(ws)) words.set(w, (words.get(w) ?? 0) + 1);
    for (const p of new Set(ws.slice(1).map((w, i) => `${ws[i]} ${w}`))) pairs.set(p, (pairs.get(p) ?? 0) + 1);
  }
  const n = competitorTitles.length;
  const goodPairs = [...pairs.entries()]
    .filter(([p, c]) => {
      const [a, b] = p.split(" ");
      return (
        a !== b && !have.has(a) && !have.has(b) && c >= 2 && c / n >= Math.max(minShare, 0.4) && c === Math.min(words.get(a)!, words.get(b)!)
      );
    })
    .map(([term, c]) => ({ term, share: c / n }));
  // A palavra solta some quando sempre aparece dentro de um par já listado.
  const covered = (w: string, c: number) => goodPairs.some((p) => p.term.split(" ").includes(w) && Math.round(p.share * n) === c);
  const singles = [...words.entries()]
    .filter(([w, c]) => !have.has(w) && !covered(w, c) && c / n >= minShare)
    .map(([term, c]) => ({ term, share: c / n }));
  return [...goodPairs, ...singles].sort((a, b) => b.share - a.share || b.term.length - a.term.length).slice(0, limit);
}

export interface PricePosition {
  median: number;
  min: number;
  max: number;
  /** fração dos concorrentes com preço menor que o do vendedor */
  cheaperShare: number;
  diffFromMedian: number; // fração: 0.1 = 10% acima da mediana
}

export function pricePosition(ownPrice: number, prices: number[]): PricePosition | null {
  const ps = prices.filter((p) => p > 0).sort((a, b) => a - b);
  if (!ps.length || ownPrice <= 0) return null;
  const mid = Math.floor(ps.length / 2);
  const median = ps.length % 2 ? ps[mid] : (ps[mid - 1] + ps[mid]) / 2;
  return {
    median,
    min: ps[0],
    max: ps[ps.length - 1],
    cheaperShare: ps.filter((p) => p < ownPrice).length / ps.length,
    diffFromMedian: (ownPrice - median) / median,
  };
}

/** Extrai o código do anúncio de um link ou texto colado (MLB123..., MLB-123..., ou /p/MLB...). */
export function parseListingId(input: string, site = "MLB"): { kind: "item" | "product"; id: string } | null {
  const s = input.trim().toUpperCase();
  const product = s.match(new RegExp(`/P/(${site}\\d{5,})`));
  if (product) return { kind: "product", id: product[1] };
  const item = s.match(new RegExp(`(${site})-?(\\d{6,})`));
  return item ? { kind: "item", id: `${item[1]}${item[2]}` } : null;
}
