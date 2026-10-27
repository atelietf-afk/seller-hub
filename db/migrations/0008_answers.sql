-- Respostas às perguntas com IA.
alter table questions
  add column draft jsonb,              -- rascunho da IA: { answer, confidence, missing[] }
  add column draft_at timestamptz,
  add column answered_at timestamptz;

-- Informações da loja que a IA pode usar nas respostas (prazo de envio, garantia, trocas...).
alter table seller_settings add column store_info text;
