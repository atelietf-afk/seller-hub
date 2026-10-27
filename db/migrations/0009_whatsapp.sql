-- Relatórios por WhatsApp.
alter table seller_settings add column whatsapp_phone text; -- 55 + DDD + número; null = não enviar

alter table reports
  add column whatsapp_sent_at timestamptz,
  add column whatsapp_error text; -- último erro de envio (null se deu certo ou ainda não tentou)
