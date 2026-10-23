# Seller Hub

Painel para vendedores de marketplaces. Começa pelo **Mercado Livre**. Shopee, Amazon e TikTok Shop vêm depois, usando o mesmo modelo de dados.

## O que já funciona (MVP)

| Módulo | O que faz |
|---|---|
| **Conexão com o ML** | Login oficial (OAuth). Os tokens são guardados criptografados (AES-256-GCM) e renovados sozinhos. |
| **Central ao vivo** | Vendas, cancelamentos, perguntas, anúncios pausados e alertas aparecem na hora (webhooks do ML + Supabase Realtime). |
| **Lucro real** | Desconta comissão do ML, frete pago pelo vendedor, imposto e custo do produto, por pedido e por anúncio. |
| **Funil por anúncio** | Visitas → vendas → conversão, comparadas com a mediana da sua loja. Diagnostica: pouca visita, conversão baixa, "joia escondida" (converte bem, pouca visita), ruptura de estoque, margem baixa ou negativa. |
| **Alertas** | Queda de visitas semana contra semana, reputação piorando, anúncio ativo sem estoque. |
| **Resumo diário com IA** | O Claude lê os números da semana e explica o que mudou e o que fazer, em linguagem simples. |

## Arquitetura

```
Next.js 16 (Vercel) ──► Supabase (Postgres + Auth + Realtime)
   │  ▲
   │  └── webhooks do ML: /api/ml/notifications (responde 200 na hora, processa depois)
   ├──► API do Mercado Livre (src/lib/ml)
   └──► Claude API (src/lib/ai/summary.ts)
```

- `src/lib/ml/`: cliente da API, OAuth, tokens, sincronização e notificações.
- `src/lib/analytics/`: regras de negócio puras e testadas (lucro, funil, alertas).
- `src/lib/report.ts`: monta os números de um período para as telas e para a IA.
- `supabase/migrations/`: esquema e RLS. Cada vendedor só enxerga os próprios dados; os tokens do ML ficam numa tabela que só o servidor lê.

## Como colocar no ar

1. **Supabase:** crie um projeto e rode `supabase/migrations/0001_init.sql` (SQL Editor ou `supabase db push`).
   Em Authentication → URL Configuration, coloque a URL do app.
2. **Mercado Livre** ([developers.mercadolivre.com.br](https://developers.mercadolivre.com.br) → sua aplicação):
   - *Redirect URI*: `https://SEU-DOMINIO/api/ml/callback`
   - *URL de notificações*: `https://SEU-DOMINIO/api/ml/notifications`
   - *Tópicos*: `orders_v2`, `questions`, `items`
   - *Escopos*: leitura e escrita (`read`, `write`, `offline_access`)
3. **Vercel:** importe o repositório e configure as variáveis do `.env.example`.
   Gere as chaves com `openssl rand -base64 32` (TOKEN_ENCRYPTION_KEY) e `openssl rand -hex 32` (CRON_SECRET).
4. Abra o app, crie sua conta, vá em **Configurações → Conectar Mercado Livre**.
   Depois cadastre o custo dos produtos em **Produtos e funil**.

> **Cron e plano da Vercel:** o `vercel.json` agenda o resumo diário (10h UTC = 7h em Brasília) e uma sincronização a cada 3 horas.
> No plano Hobby a Vercel só permite cron diário; nesse caso, use o `pg_cron` do Supabase para chamar `/api/cron/sync`
> com o cabeçalho `Authorization: Bearer $CRON_SECRET`. O tempo real vem dos webhooks, então a sincronização só corrige o que eles perderem.

## Desenvolvimento

```bash
cp .env.example .env.local   # preencha
npm install
npm run dev
npm test          # regras de lucro, funil, alertas, criptografia e cliente do ML
npm run typecheck
npm run lint
```

O ML só aceita redirect e webhooks em HTTPS público. Para testar localmente, use um túnel (ngrok, Cloudflare Tunnel) ou um deploy de preview.

## Próximas fases

1. **Espião e palavras-chave (ML):** mais vendidos da categoria (`/highlights`), concorrentes monitorados (preço, estoque, vendas), sugestões de título e nota do anúncio.
2. **Relatórios semanal e mensal:** PDF e envio por e-mail/WhatsApp.
3. **Product Ads (ML):** ROAS/ACOS e lucro depois do anúncio.
4. **Respostas com IA** para perguntas, **estoque unificado** e **precificação automática**.
5. **Shopee, Amazon e TikTok Shop:** um conector por marketplace, convertendo tudo para as mesmas tabelas.
6. **Para vender como serviço:** equipes (organizações), planos e cobrança, e onboarding guiado.
