import { cookies } from "next/headers";
import Link from "next/link";
import { changeMemberRole, disconnectAccount, inviteMember, removeMemberAction, revokeInviteAction, saveSettings } from "../../actions";
import { CopyButton } from "@/components/CopyButton";
import { can, ROLE_HINT, ROLE_LABEL, type MemberRole } from "@/lib/analytics/team";
import { pendingInvites, teamOf } from "@/lib/data/team";
import { env } from "@/lib/env";
import { CONNECT_PATH, MARKETPLACE_LABEL } from "@/lib/marketplaces";
import { dateOnly } from "@/lib/format";
import { SubmitButton } from "@/components/SubmitButton";
import { formatWhatsappPhone } from "@/lib/analytics/whatsapp";
import { settingsOf } from "@/lib/data/accounts";
import { currentAccount, INVITE_COOKIE } from "@/lib/session";
import { amazonConfigured } from "@/lib/amazon/config";
import { shopeeConfigured } from "@/lib/shopee/config";
import { whatsappConfigured } from "@/lib/whatsapp";

const ML_MSG: Record<string, string> = {
  "estado-invalido": "A conexão expirou ou foi interrompida. Tente de novo.",
  "conta-ja-vinculada": "Essa conta do Mercado Livre já está ligada a outro usuário do Seller Hub.",
  "autorizacao-negada": "A autorização foi cancelada no Mercado Livre. Clique em Conectar para tentar de novo.",
  "codigo-invalido": "O link de autorização expirou ou já foi usado. Clique em Conectar para começar de novo.",
  "contato-na-loja":
    "As informações da loja não foram salvas: tire telefone, e-mail, links ou redes sociais (o Mercado Livre proíbe nas respostas).",
  "whatsapp-invalido": "As configurações não foram salvas: o número de WhatsApp não parece válido. Use DDD + número, ex.: (11) 98765-4321.",
  "amazon-desligada": "A conexão com a Amazon ainda não foi ativada no servidor (faltam as credenciais do app na Central do Vendedor).",
  "shopee-desligada": "A conexão com a Shopee ainda não foi ativada no servidor (faltam as credenciais do app na Shopee Open Platform).",
  "sem-acesso-offline":
    "O app no Mercado Livre está sem a permissão de acesso offline (offline_access). Ative-a no DevCenter e conecte de novo.",
};

const TEAM_MSG: Record<string, { ok: boolean; text: string }> = {
  convidado: {
    ok: true,
    text: "Convite criado. Copie o link abaixo e mande para a pessoa (vale 7 dias e só funciona para o e-mail convidado).",
  },
  invalido: { ok: false, text: "Confira o e-mail e o perfil do convite." },
  proprio: { ok: false, text: "Esse é o seu próprio e-mail." },
};
const MEMBER_ROLES: MemberRole[] = ["gerente", "operador", "leitura"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ml?: string; equipe?: string }> }) {
  const { user, accounts, ownerId, role, ownerEmails } = await currentAccount();
  const { ml, equipe } = await searchParams;
  const s = await settingsOf(ownerId);
  const ownAccounts = accounts.filter((a) => a.owner_id === user.id);
  const isOwner = role === "dono";
  const canManage = can(role, "gerenciar");
  const [team, invites] = isOwner ? await Promise.all([teamOf(user.id), pendingInvites(user.id)]) : [[], []];
  const inviteToken = isOwner ? (await cookies()).get(INVITE_COOKIE)?.value : undefined;
  const inviteLink = inviteToken ? new URL(`/convite/${inviteToken}`, env("BETTER_AUTH_URL")).toString() : null;
  const teamMsg = equipe ? TEAM_MSG[equipe] : undefined;
  const num = (v: number) => String(Math.round(v * 10000) / 100);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Configurações</h1>
      {ml && ML_MSG[ml] && <p className="rounded-md bg-critical/10 p-3 text-sm text-critical">{ML_MSG[ml]}</p>}
      {!isOwner && (
        <p className="rounded-md bg-ink/5 p-3 text-sm">
          Você está vendo a loja da equipe de <strong>{ownerEmails.get(ownerId) ?? "outro usuário"}</strong> com o perfil{" "}
          <strong>{ROLE_LABEL[role]}</strong>. Para ver as suas próprias lojas, troque no seletor do topo.
        </p>
      )}

      <section className="flex items-center justify-between rounded-xl border border-line bg-surface p-5">
        <div>
          <h2 className="font-semibold">Segurança da conta</h2>
          <p className="text-sm text-ink-2">Senha e verificação em duas etapas.</p>
        </div>
        <Link href="/seguranca" className="rounded-md border border-line px-3 py-1.5 text-sm font-medium">
          Abrir
        </Link>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Suas lojas conectadas</h2>
        {!ownAccounts.length && <p className="mt-2 text-sm text-ink-2">Nenhuma loja sua conectada ainda.</p>}
        <ul className="mt-3 divide-y divide-line text-sm">
          {ownAccounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <span className="rounded bg-bg px-1.5 py-0.5 text-xs">{MARKETPLACE_LABEL[a.marketplace]}</span>
              <span className="font-medium">{a.nickname}</span>
              <span className="text-muted">ID {a.external_id ?? a.ml_user_id}</span>
              {!a.connected && (
                <Link
                  href={CONNECT_PATH[a.marketplace]}
                  className="text-xs font-medium text-critical underline"
                >
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link href="/api/ml/connect" className="inline-block rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">
            Conectar Mercado Livre
          </Link>
          {shopeeConfigured() ? (
            <Link href="/api/shopee/connect" className="inline-block rounded-md border border-line px-3 py-1.5 text-sm font-medium">
              Conectar Shopee
            </Link>
          ) : (
            <span className="text-xs text-muted">Shopee: aguardando a aprovação do app na Shopee Open Platform.</span>
          )}
          {amazonConfigured() ? (
            <Link href="/api/amazon/connect" className="inline-block rounded-md border border-line px-3 py-1.5 text-sm font-medium">
              Conectar Amazon
            </Link>
          ) : (
            <span className="text-xs text-muted">Amazon: aguardando o cadastro do app na Central do Vendedor.</span>
          )}
        </div>
      </section>

      <form action={saveSettings} className="rounded-xl border border-line bg-surface p-5">
        <fieldset disabled={!canManage} className="space-y-4">
          <h2 className="font-semibold">Cálculo de lucro e alertas</h2>
          {!canManage && <p className="text-xs text-muted">Só o dono ou um gerente da equipe pode mudar estas configurações.</p>}
          <Field
            name="taxRate"
            label="Imposto sobre o faturamento (%)"
            hint="Ex.: Simples Nacional, alíquota efetiva."
            value={num(s.tax_rate)}
          />
          <Field
            name="minMargin"
            label="Margem mínima aceitável (%)"
            hint="Abaixo disso o produto aparece como margem baixa."
            value={num(s.min_margin)}
          />
          <Field
            name="visitsDrop"
            label="Alerta de queda de visitas (%)"
            hint="Semana atual contra a anterior."
            value={num(s.visits_drop_alert)}
          />
          <Field
            name="lowStockDays"
            label="Alerta de estoque (dias)"
            hint="Avisa quando o estoque cobre menos dias que isso."
            value={String(s.low_stock_days)}
          />
          <label className="block text-sm">
            <span className="font-medium">Informações da loja para as respostas com IA</span>
            <textarea
              name="storeInfo"
              rows={6}
              maxLength={3000}
              defaultValue={s.store_info ?? ""}
              placeholder={
                "Ex.: Enviamos em até 24h úteis após o pagamento.\nTodos os produtos têm nota fiscal.\nGarantia de 90 dias contra defeito de fabricação.\nTrocas em até 7 dias pelo próprio Mercado Livre."
              }
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
              O relatório semanal (segunda) e o mensal (dia 1) chegam neste número, com o link para ver completo. Deixe em branco para não
              receber.
              {!whatsappConfigured() && " O envio por WhatsApp ainda não foi ativado no servidor."}
            </span>
          </label>
          {canManage && <SubmitButton pending="Salvando…">Salvar</SubmitButton>}
        </fieldset>
      </form>

      {isOwner && (
        <section id="equipe" className="scroll-mt-4 space-y-4 rounded-xl border border-line bg-surface p-5">
          <div>
            <h2 className="font-semibold">Equipe</h2>
            <p className="text-sm text-ink-2">
              Convide quem trabalha com você. Cada pessoa entra com o próprio e-mail e senha e vê as suas lojas com o perfil escolhido.
            </p>
          </div>
          {teamMsg && (
            <p className={`rounded-md p-3 text-sm ${teamMsg.ok ? "bg-good/10 text-good" : "bg-critical/10 text-critical"}`}>
              {teamMsg.text}
            </p>
          )}
          {inviteLink && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-bg p-3 text-sm">
              <code className="min-w-0 flex-1 truncate">{inviteLink}</code>
              <CopyButton text={inviteLink} label="Copiar link do convite" />
            </div>
          )}

          <ul className="divide-y divide-line text-sm">
            <li className="flex flex-wrap items-center gap-2 py-2">
              <span className="font-medium">{user.email}</span>
              <span className="rounded bg-bg px-1.5 py-0.5 text-xs">{ROLE_LABEL.dono}</span>
            </li>
            {team.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-medium">{m.email}</span>
                <form action={changeMemberRole} className="flex items-center gap-1">
                  <input type="hidden" name="userId" value={m.user_id} />
                  <select name="role" defaultValue={m.role} className="rounded-md border border-line bg-surface px-2 py-1 text-xs">
                    {MEMBER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <button className="text-xs text-accent">Salvar</button>
                </form>
                <form action={removeMemberAction} className="ml-auto">
                  <input type="hidden" name="userId" value={m.user_id} />
                  <button className="text-xs text-critical">Remover</button>
                </form>
              </li>
            ))}
            {invites.map((i) => (
              <li key={i.token_hash} className="flex flex-wrap items-center gap-2 py-2 text-ink-2">
                <span>{i.email}</span>
                <span className="rounded bg-warning/25 px-1.5 py-0.5 text-xs">
                  Convite pendente · {ROLE_LABEL[i.role]} · até {dateOnly(i.expires_at)}
                </span>
                <form action={revokeInviteAction} className="ml-auto">
                  <input type="hidden" name="invite" value={i.token_hash} />
                  <button className="text-xs text-critical">Cancelar</button>
                </form>
              </li>
            ))}
          </ul>

          <form action={inviteMember} className="flex flex-wrap items-end gap-2 text-sm">
            <label className="block">
              <span className="text-xs text-muted">E-mail</span>
              <input name="email" type="email" required className="mt-0.5 block w-64 rounded-md border border-line bg-bg px-3 py-1.5" />
            </label>
            <label className="block">
              <span className="text-xs text-muted">Perfil</span>
              <select name="role" defaultValue="operador" className="mt-0.5 block rounded-md border border-line bg-surface px-2 py-1.5">
                {MEMBER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <SubmitButton variant="primary" pending="Criando…">
              Convidar
            </SubmitButton>
          </form>
          <ul className="space-y-0.5 text-xs text-muted">
            {MEMBER_ROLES.map((r) => (
              <li key={r}>
                <strong>{ROLE_LABEL[r]}</strong>: {ROLE_HINT[r]}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Field({ name, label, hint, value }: { name: string; label: string; hint: string; value: string }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        defaultValue={value}
        inputMode="decimal"
        className="mt-1 block w-32 rounded-md border border-line bg-bg px-3 py-1.5"
      />
      <span className="text-xs text-muted">{hint}</span>
    </label>
  );
}
