# Política de segurança e plano de resposta a incidentes — Seller Hub

Empresa: Ateliê Toque Final · Responsável: atelietf@gmail.com
Versão 1 — 28/10/2026 · Próxima revisão: 28/04/2027 (a cada 6 meses)

## 1. Papéis

| Papel | Quem | O que faz |
|---|---|---|
| Responsável de segurança | Dona da empresa (atelietf@gmail.com) | Decide, comunica marketplaces e autoridades, aprova o encerramento do incidente |
| Operação técnica | Responsável de segurança, com apoio do desenvolvedor contratado quando houver | Contém o incidente, troca credenciais, analisa logs, corrige a falha |

Contatos externos: Amazon — security@amazon.com · Mercado Livre e Shopee — canais de suporte ao desenvolvedor · ANPD — quando houver dado pessoal envolvido (LGPD).

## 2. Senhas e acesso

- **Seller Hub:** senha com no mínimo 12 caracteres, com letra, número e caractere especial; vence em 365 dias e o sistema
  obriga a troca; verificação em duas etapas (aplicativo autenticador) obrigatória para todos os usuários; perfis de equipe
  (gerente, operador, leitura) limitam o que cada pessoa pode fazer.
- **Contas de administração** (Vercel, GitHub, Neon, Google, Central do Vendedor da Amazon, Mercado Livre, Shopee, Meta):
  mesma regra de senha, verificação em duas etapas ligada e troca de senha uma vez por ano.
- Acesso ao servidor e ao banco só para o responsável de segurança. Ninguém compartilha senha.

## 3. Credenciais do sistema

- Ficam só nas variáveis de ambiente protegidas da Vercel. Nunca no código, no repositório, em e-mail ou em mensagens.
- Tokens dos marketplaces são gravados criptografados (AES-256-GCM, chave `TOKEN_ENCRYPTION_KEY`) e nunca saem do servidor.
- Troca anual (registrar a data na tabela do item 7): `ML_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `WHATSAPP_TOKEN`,
  `SHOPEE_PARTNER_KEY` (a Shopee exige a cada 180 dias) e `AMAZON_LWA_CLIENT_SECRET` (a Amazon exige a cada 180 dias).
- `BETTER_AUTH_SECRET` e `TOKEN_ENCRYPTION_KEY` são trocadas em caso de suspeita de vazamento (a troca encerra todas as
  sessões e exige reconectar as lojas).

## 4. Proteção dos dados

- Todo tráfego com HTTPS (navegador, APIs dos marketplaces e banco de dados).
- Hospedagem na Vercel e banco na Neon, com firewall e rede isolada dos provedores.
- Não guardamos dados pessoais de compradores (nome, endereço, telefone, documento).
- Cada vendedor só vê os dados das próprias lojas (filtro por dono em todas as consultas, com testes automáticos).
- Computadores usados para administrar o sistema com antivírus ativo e sistema atualizado.

## 5. Como detectamos um incidente

- Logs da Vercel (erros e acessos), alertas de segurança do GitHub e dos provedores.
- Avisos de Amazon, Mercado Livre, Shopee ou Meta.
- Atividade estranha: login não reconhecido, alteração não feita por nós, sincronização com dados inesperados.

## 6. O que fazer em um incidente

Incidente = qualquer suspeita de acesso não autorizado, vazamento ou perda de dados, inclusive dados da Amazon.

1. **Conter (imediato):** desconectar as lojas afetadas em Configurações (apaga os tokens), trocar as senhas e as credenciais
   envolvidas (item 3), revogar o acesso do app na Central do Vendedor / Mercado Livre / Shopee se preciso, pausar o projeto na
   Vercel se o servidor estiver comprometido.
2. **Comunicar (em até 24 horas da detecção):**
   - **Amazon:** e-mail para **security@amazon.com** sempre que envolver dados da Amazon, com o que aconteceu, quando, quais
     dados e o que já foi feito.
   - Mercado Livre e Shopee pelos canais de desenvolvedor, quando envolver dados deles.
   - Usuários afetados e, se houver dado pessoal, a ANPD, nos prazos da LGPD.
3. **Investigar:** logs da Vercel, histórico do GitHub, acessos às contas de administração. Registrar tudo na tabela do item 8.
4. **Corrigir:** fechar a falha, publicar a correção, reconectar as lojas com credenciais novas.
5. **Encerrar e aprender:** registrar causa, impacto e o que muda para não repetir; atualizar este documento.

## 7. Revisões e trocas

Este plano é revisado a cada 6 meses e depois de qualquer incidente.

| Data | O que foi feito | Por |
|---|---|---|
| 28/10/2026 | Versão 1 do plano; senha de 12 caracteres, validade de 365 dias e duas etapas obrigatórias no Seller Hub | Responsável de segurança |

## 8. Registro de incidentes

| Data/hora da detecção | Descrição | Dados envolvidos | Comunicado a (data/hora) | Ações | Encerrado em |
|---|---|---|---|---|---|
| — | Nenhum até agora | — | — | — | — |
