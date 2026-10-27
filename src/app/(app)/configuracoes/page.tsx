import Link from "next/link";
import { disconnectAccount, saveSettings } from "../../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { formatWhatsappPhone } from "@/lib/analytics/whatsapp";
import { settingsOf } from "@/lib/data/accounts";
import { currentAccount } from "@/lib/session";
import { whatsappConfigured } from "@/lib/whatsapp";

const ML_MSG: Record<string, string> = {
  "estado-invalido": "A conexão expirou ou foi interrompida. Tente de novo.",
  "conta-ja-vinculada": "Essa conta do Mercado Livre já está ligada a outro usuário do Seller Hub.",
  "autorizacao-negada": "A autorização foi cancelada no Mercado Livre. Clique em Conectar para tentar de novo.",
  "codigo-invalido": "O link de autorização expirou ou já foi usado. Clique em Conectar para começar de novo.",
  "contato-na-loja":
    "As informações da loja não foram salvas: tire telefone, e-mail, links ou redes sociais (o Mercado Livre proíbe nas respostas).",
  "whatsapp-invalido": "As configurações não foram salvas: o número de WhatsApp não parece válido. Use DDD + número, ex.: (11) 98765-4321.",
  "sem-acesso-offline":
    "O app no Mercado Livre está sem a permissão de acesso offline (offline_access). Ative-a no DevCenter e conecte de novo.",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ml?: string }> }) {
  const { user, accounts } = await currentAccount();
  const { ml } = await searchParams;
  const s = await settingsOf(user.id);
  const num = (v: number) => String(Math.round(v * 10000) / 100);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Configurações</h1>
      {ml && ML_MSG[ml] && <p className="rounded-md bg-critical/10 p-3 text-sm text-critical">{ML_MSG[ml]}</p>}

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Contas do Mercado Livre</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <span className="font-medium">{a.nickname}</span>
              <span className="text-muted">ID {a.ml_user_id}</span>
              {!a.connected && (
                <Link href="/api/ml/connect" className="text-xs font-medium text-critical underline">
                  Conexão incompleta: reconectar
                </Link>
              )}
              <form action={disconnectAccount} className="ml-auto">
                <input type="hidden" name="accountId" value={a.id} />
                <button className="text-xs text-critical">Desconectar</button>
              </form>
            </li>
          ))}
        </ul>
        <Link href="/api/ml/connect" className="mt-3 inline-block rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">
          {accounts.length ? "Conectar outra conta" : "Conectar Mercado Livre"}
        </Link>
      </section>

      <form action={saveSettings} className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Cálculo de lucro e alertas</h2>
        <Field name="taxRate" label="Imposto sobre o faturamento (%)" hint="Ex.: Simples Nacional, alíquota efetiva." value={num(s.tax_rate)} />
        <Field name="minMargin" label="Margem mínima aceitável (%)" hint="Abaixo disso o produto aparece como margem baixa." value={num(s.min_margin)} />
        <Field name="visitsDrop" label="Alerta de queda de visitas (%)" hint="Semana atual contra a anterior." value={num(s.visits_drop_alert)} />
        <Field name="lowStockDays" label="Alerta de estoque (dias)" hint="Avisa quando o estoque cobre menos dias que isso." value={String(s.low_stock_days)} />
        <label className="block text-sm">
          <span className="font-medium">Informações da loja para as respostas com IA</span>
          <textarea
            name="storeInfo"
            rows={6}
            maxLength={3000}
            defaultValue={s.store_info ?? ""}
            placeholder={"Ex.: Enviamos em até 24h úteis após o pagamento.\nTodos os produtos têm nota fiscal.\nGarantia de 90 dias contra defeito de fabricação.\nTrocas em até 7 dias pelo próprio Mercado Livre."}
            className="mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2"
          />
          <span className="text-xs text-muted">
            A IA usa isso para responder sobre prazo, garantia, nota fiscal e trocas. Não coloque telefone, e-mail ou links.
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium">WhatsApp para os relatórios</span>
          <input
            name="whatsappPhone"
            type="tel"
            autoComplete="tel"
            defaultValue={s.whatsapp_phone ? formatWhatsappPhone(s.whatsapp_phone) : ""}
            placeholder="(11) 98765-4321"
            className="mt-1 block w-56 rounded-md border border-line bg-bg px-3 py-1.5"
          />
          <span className="text-xs text-muted">
            O relatório semanal (segunda) e o mensal (dia 1) chegam neste número, com o link para ver completo. Deixe em branco para
            não receber.
            {!whatsappConfigured() && " O envio por WhatsApp ainda não foi ativado no servidor."}
          </span>
        </label>
        <SubmitButton pending="Salvando…">Salvar</SubmitButton>
      </form>
    </div>
  );
}

function Field({ name, label, hint, value }: { name: string; label: string; hint: string; value: string }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input name={name} defaultValue={value} inputMode="decimal" className="mt-1 block w-32 rounded-md border border-line bg-bg px-3 py-1.5" />
      <span className="text-xs text-muted">{hint}</span>
    </label>
  );
}
