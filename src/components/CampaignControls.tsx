"use client";

import { createSuggestedCampaignAction, updateCampaignAction } from "@/app/actions";
import { parseMoney } from "@/lib/format";
import { SubmitButton } from "./SubmitButton";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const x = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`;
const num = (raw: string) => parseMoney(raw.replace(/x$/i, "")) ?? 0;

/** Confirma antes de mandar ao Mercado Livre; cancela o envio se a pessoa desistir. */
function confirmSubmit(e: React.FormEvent<HTMLFormElement>, message: (form: FormData) => string | string[]) {
  const msgs = [message(new FormData(e.currentTarget))].flat();
  if (!msgs.every((m) => window.confirm(m))) e.preventDefault();
}

function roasWarning(roas: number, breakEven: number | null) {
  return breakEven !== null && roas < breakEven
    ? [`Atenção: ${x(roas)} está abaixo do equilíbrio de ${x(breakEven)}. Cada venda pelo anúncio vai dar prejuízo. Confirmar mesmo assim?`]
    : [];
}

// Ajustes de uma campanha existente: orçamento, ROAS objetivo e pausar/ativar.
export function CampaignControls({
  campaign,
  suggestBudget,
  suggestRoas,
  breakEvenRoas,
}: {
  campaign: { id: number; name: string; status: string | null; budget: number | null; roasTarget: number | null };
  suggestBudget?: number;
  suggestRoas?: number;
  breakEvenRoas: number | null;
}) {
  const active = campaign.status === "active";
  const field = "w-24 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink tabular-nums";
  return (
    <div className="flex flex-wrap items-end gap-3 text-sm">
      <form
        action={updateCampaignAction}
        onSubmit={(e) =>
          confirmSubmit(e, (f) => {
            const v = num(String(f.get("value")));
            return `Mudar o orçamento de "${campaign.name}" de ${campaign.budget != null ? brl(campaign.budget) : "—"} para ${brl(v)} por dia?\n\nO Mercado Livre pode gastar até o dobro num dia (${brl(v * 2)}) e cerca de ${brl(v * 30)} no mês.`;
          })
        }
        className="flex items-end gap-1.5"
      >
        <input type="hidden" name="campaignId" value={campaign.id} />
        <input type="hidden" name="field" value="budget" />
        <label className="text-xs text-muted">
          Orçamento/dia (R$){suggestBudget !== undefined && <span className="text-good"> · sugerido</span>}
          <input
            name="value"
            required
            inputMode="decimal"
            defaultValue={String(suggestBudget ?? campaign.budget ?? "").replace(".", ",")}
            className={`mt-0.5 block ${field}`}
          />
        </label>
        <SubmitButton pending="Aplicando…">Aplicar</SubmitButton>
      </form>

      <form
        action={updateCampaignAction}
        onSubmit={(e) =>
          confirmSubmit(e, (f) => {
            const v = num(String(f.get("value")));
            return [
              `Mudar o ROAS objetivo de "${campaign.name}" de ${campaign.roasTarget != null ? x(campaign.roasTarget) : "—"} para ${x(v)}?\n\nMenor = mais exibições e menos lucro por venda. Maior = o contrário.`,
              ...roasWarning(v, breakEvenRoas),
            ];
          })
        }
        className="flex items-end gap-1.5"
      >
        <input type="hidden" name="campaignId" value={campaign.id} />
        <input type="hidden" name="field" value="roas_target" />
        <label className="text-xs text-muted">
          ROAS objetivo{suggestRoas !== undefined && <span className="text-good"> · sugerido</span>}
          <input
            name="value"
            required
            inputMode="decimal"
            defaultValue={String(suggestRoas ?? campaign.roasTarget ?? "").replace(".", ",")}
            className={`mt-0.5 block ${field}`}
          />
        </label>
        <SubmitButton pending="Aplicando…">Aplicar</SubmitButton>
      </form>

      <form
        action={updateCampaignAction}
        onSubmit={(e) =>
          confirmSubmit(e, () =>
            active
              ? `Pausar "${campaign.name}"? Os anúncios dela param de aparecer como patrocinados.`
              : `Ativar "${campaign.name}"? Ela volta a gastar até ${campaign.budget != null ? brl(campaign.budget) : "o orçamento"} por dia.`,
          )
        }
      >
        <input type="hidden" name="campaignId" value={campaign.id} />
        <input type="hidden" name="field" value="status" />
        <input type="hidden" name="value" value={active ? "paused" : "active"} />
        <SubmitButton pending="Aplicando…">{active ? "Pausar campanha" : "Ativar campanha"}</SubmitButton>
      </form>
    </div>
  );
}

// Cria no Mercado Livre a campanha sugerida (os anúncios entram depois, no Mercado Ads).
export function CreateCampaignForm({
  kind,
  name,
  budget,
  roasTarget,
  breakEvenRoas,
}: {
  kind: string;
  name: string;
  budget: number;
  roasTarget: number;
  breakEvenRoas: number;
}) {
  const field = "w-24 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink tabular-nums";
  return (
    <form
      action={createSuggestedCampaignAction}
      onSubmit={(e) =>
        confirmSubmit(e, (f) => {
          const b = num(String(f.get("budget")));
          const r = num(String(f.get("roasTarget")));
          return [
            `Criar a campanha "${name}" no Mercado Livre com orçamento de ${brl(b)} por dia e ROAS objetivo de ${x(r)}?\n\nEla é criada ativa e sem anúncios: depois adicione os anúncios no Mercado Ads com os códigos copiados.`,
            ...roasWarning(r, breakEvenRoas),
          ];
        })
      }
      className="flex flex-wrap items-end gap-2 text-sm"
    >
      <input type="hidden" name="kind" value={kind} />
      <label className="text-xs text-muted">
        Orçamento/dia (R$)
        <input
          name="budget"
          required
          inputMode="decimal"
          defaultValue={String(budget).replace(".", ",")}
          className={`mt-0.5 block ${field}`}
        />
      </label>
      <label className="text-xs text-muted">
        ROAS objetivo
        <input
          name="roasTarget"
          required
          inputMode="decimal"
          defaultValue={String(roasTarget).replace(".", ",")}
          className={`mt-0.5 block ${field}`}
        />
      </label>
      <SubmitButton variant="primary" pending="Criando…">
        Criar no Mercado Livre
      </SubmitButton>
    </form>
  );
}
