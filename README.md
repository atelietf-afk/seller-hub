# Seller Hub

Painel para vendedores de marketplaces. Começa pelo **Mercado Livre**. Shopee, Amazon e TikTok Shop vêm depois, usando o mesmo modelo de dados.

## O que já funciona (MVP)

| Módulo | O que faz |
|---|---|
| **Conexão com o ML** | Login oficial (OAuth). Os tokens são guardados criptografados (AES-256-GCM) e renovados sozinhos, sem corrida entre execuções simultâneas. |
| **Central ao vivo** | Vendas, cancelamentos, perguntas, anúncios pausados e alertas chegam pelos webhooks do ML; o painel busca novidades a cada 15 s. |
| **Lucro real** | Desconta comissão do ML, frete pago pelo vendedor, imposto e custo do produto, por pedido e por anúncio. |
| **Funil por anúncio** | Visitas → vendas → conversão, comparadas com a mediana da sua loja. Diagnostica: pouca visita, conversão baixa, "joia escondida" (converte bem, pouca visita), ruptura de estoque, margem baixa ou negativa. |
| **Alertas** | Queda de visitas semana contra semana, reputação piorando, anúncio ativo sem estoque. |
| **Publicidade (Product Ads)** | Campanhas e produtos anunciados dos últimos 30 dias: investimento, vendas, ACOS, ROAS, TACOS, CTR e CPC. Cruza com o lucro real: mostra o **lucro após anúncios** e o **ACOS de equilíbrio** de cada produto, e aponta onde o anúncio dá prejuízo, onde vale escalar e onde gasta sem vender. |
| **Resumo diário com IA** | O Claude lê os números da semana e explica o que mudou e o que fazer, em linguagem simples. |

## Arquitetura

```
Next.js 16 (Vercel) ──► Postgres (Neon) ── login: Better Auth (e-mail e senha)
   │  ▲
   │  └── webhooks do ML: /api/ml/notifications (responde 200 na hora, processa depois)
   ├──► API do Mercado Livre (src/lib/ml)
   └──► Claude API (src/lib/ai/summary.ts)
```

- `src/lib/ml/`: cliente da API, OAuth, tokens, sincronização e notificações.
- `src/lib/analytics/`: regras de negócio puras e testadas (lucro, funil, alertas).
- `src/lib/data/`: acesso aos dados. **Toda função que recebe `ownerId` filtra pelo dono**: é isso que impede um vendedor de ver ou alterar dados de outro (testado em `test/db.test.ts`).
- `src/lib/report.ts`: monta os números de um período para as telas e para a IA.
- `db/migrations/`: esquema do banco. `npm run db:migrate` aplica o que faltar.

## Como colocar no ar

1. **Banco (Neon, plano gratuito):** na Vercel, *Storage → Create Database → Neon*, ligado ao projeto
   (isso cria a variável `DATABASE_URL`). Ou crie direto em [neon.tech](https://neon.tech) e copie a connection string *pooled*.
   As tabelas são criadas sozinhas a cada deploy (script `vercel-build`); depois de ligar o banco, faça um *Redeploy*.
2. **Mercado Livre** ([developers.mercadolivre.com.br](https://developers.mercadolivre.com.br) → sua aplicação):
   - *Redirect URI*: `https://SEU-DOMINIO/api/ml/callback`
   - *URL de notificações*: `https://SEU-DOMINIO/api/ml/notifications`
   - *Tópicos*: `orders_v2`, `questions`, `items`
   - *Fluxos OAuth*: Authorization Code e **Refresh Token** (sem ele o acesso expira em 6 horas)
   - *Permissões*: inclua **Publicidade de um produto** (leitura) para a tela de Publicidade
   - *Escopos*: leitura, escrita e acesso offline
3. **Vercel:** importe o repositório e configure as variáveis do `.env.example`
   (`BETTER_AUTH_URL` = a URL do app). Gere os segredos com `openssl rand -base64 32` e `openssl rand -hex 32` (CRON_SECRET).
4. Abra o app, crie sua conta e vá em **Configurações → Conectar Mercado Livre**.
   Depois cadastre o custo dos produtos em **Produtos e funil**.

> **Cron e plano da Vercel:** o `vercel.json` agenda uma sincronização (9h UTC) e o resumo diário (10h UTC = 7h em Brasília),
> o que cabe no plano gratuito (Hobby), que só aceita tarefas diárias. Para sincronizar mais vezes, use o plano Pro (ex.: `0 */3 * * *`)
> ou um agendador externo (ex.: cron-job.org) chamando `/api/cron/sync` com o cabeçalho `Authorization: Bearer $CRON_SECRET`.
> O tempo real vem dos webhooks, então a sincronização só corrige o que eles perderem.

## Desenvolvimento

```bash
cp .env.example .env.local   # preencha
npm install
npm run db:migrate
npm run dev
npm test              # regras de negócio, criptografia e cliente do ML
TEST_DATABASE_URL=postgres://... npm test   # inclui os testes de banco (APAGA esse banco!)
npm run typecheck && npm run lint
```

O ML só aceita redirect e webhooks em HTTPS público. Para testar localmente, use um túnel (ngrok, Cloudflare Tunnel) ou um deploy de preview.

## Próximas fases

1. **Espião e palavras-chave (ML):** mais vendidos da categoria (`/highlights`), concorrentes monitorados (preço, estoque, vendas), sugestões de título e nota do anúncio.
2. **Relatórios semanal e mensal:** PDF e envio por e-mail/WhatsApp.
4. **Respostas com IA** para perguntas, **estoque unificado** e **precificação automática**.
5. **Shopee, Amazon e TikTok Shop:** um conector por marketplace, convertendo tudo para as mesmas tabelas.
6. **Para vender como serviço:** equipes (organizações), planos e cobrança, confirmação de e-mail e recuperação de senha, onboarding guiado.
