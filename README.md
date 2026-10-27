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
| **Espião** | **Palavras-chave**: buscas em alta na categoria e termos dos mais vendidos que faltam no seu título, com títulos sugeridos pela IA (até 60 caracteres, sem inventar características). **Mais vendidos**: top 20 de cada categoria sua, com preço comparado à mediana, frete grátis e Full. **Catálogo**: se você está ganhando a vitrine e o preço para ganhar, com alerta ao perder. **Concorrentes**: cole o link de um anúncio e acompanhe preço e situação dia a dia, com alerta quando baixarem o preço. |
| **Relatórios semanal e mensal** | Gerados sozinhos (semanal toda segunda, mensal todo dia 1) ou na hora. Faturamento, vendas, ticket médio, lucro real e para onde foi o dinheiro (comissão, frete, imposto, custo, anúncios), publicidade, tráfego, produtos que mais faturaram, os que mais subiram e caíram, pontos de atenção e análise da IA. Página pronta para imprimir ou salvar em PDF. Chegam também no **WhatsApp** (API oficial da Meta) com os números principais e o link do relatório. |
| **Perguntas com IA** | Perguntas sem resposta da mais antiga para a mais nova, com o tempo de espera. A IA sugere a resposta usando o anúncio (ficha técnica, descrição, frete, estoque, garantia), as informações da loja e respostas anteriores, sem inventar: marca entre colchetes o que falta. Você revisa e envia ao ML. Bloqueia telefone, e-mail, links e redes sociais antes de enviar. |
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
   - *Permissões*: inclua **Publicidade de um produto** (leitura) para a tela de Publicidade e
     **Comunicações pré e pós-vendas** (leitura e escrita) para responder perguntas
   - *Escopos*: leitura, escrita e acesso offline
3. **Vercel:** importe o repositório e configure as variáveis do `.env.example`
   (`BETTER_AUTH_URL` = a URL do app). Gere os segredos com `openssl rand -base64 32` e `openssl rand -hex 32` (CRON_SECRET).
4. Abra o app, crie sua conta e vá em **Configurações → Conectar Mercado Livre**.
   Depois cadastre o custo dos produtos em **Produtos e funil**.

5. **WhatsApp (opcional):** no [Meta for Developers](https://developers.facebook.com), crie um app do tipo *Empresa* com o produto
   **WhatsApp** e um número só para o sistema. Em *WhatsApp Manager → Modelos de mensagem*, crie o modelo `relatorio_vendas`
   (categoria **Utilidade**, idioma **Português (BR)**):
   ```
   Seu relatório {{1}} de {{2}} está pronto.

   Faturamento: {{3}} ({{4}})
   Pedidos: {{5}}
   Lucro após anúncios: {{6}}

   Destaque: {{7}}

   Toque no botão para ver o relatório completo.
   ```
   Botão do tipo *Visitar site*, URL dinâmica `https://SEU-DOMINIO/relatorios/{{1}}` (exemplo: `weekly/2026-10-19`).
   Depois de aprovado, configure `WHATSAPP_TOKEN` (token permanente de um usuário do sistema) e `WHATSAPP_PHONE_NUMBER_ID`
   na Vercel, e cada vendedor cadastra o número dele em **Configurações**. O envio sai junto com o cron diário; se falhar,
   tenta de novo nos dias seguintes (até 3 dias) e o motivo aparece no relatório.

> **Histórico de pedidos:** a primeira sincronização traz 30 dias; depois, cada sincronização recua mais 30 dias (com limite de tempo)
> até completar 120 dias, o suficiente para o relatório mensal e sua comparação. O relatório avisa quando o histórico ainda está incompleto.

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

2. **Envio dos relatórios** por e-mail/WhatsApp.
4. **Estoque unificado** e **precificação automática**.
5. **Shopee, Amazon e TikTok Shop:** um conector por marketplace, convertendo tudo para as mesmas tabelas.
6. **Para vender como serviço:** equipes (organizações), planos e cobrança, confirmação de e-mail e recuperação de senha, onboarding guiado.

> **Limites do Mercado Livre para o espião:** desde 2025 a busca pública da API (`/sites/MLB/search`) responde 403 para aplicativos,
> então não dá para listar todos os anúncios de um termo. O ML também não divulga vendas e estoque exatos de outros vendedores.
> Por isso o espião usa tendências (`/trends`), mais vendidos (`/highlights`), disputa de catálogo (`/price_to_win`) e os anúncios que você escolhe acompanhar.
