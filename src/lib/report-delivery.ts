import "server-only";
import { reportMessage } from "./analytics/whatsapp";
import { settingsOf } from "./data/accounts";
import { getReport, markWhatsapp, reportsToDeliver } from "./data/reports";
import { sendReportTemplate, whatsappConfigured, WhatsappError } from "./whatsapp";

export type DeliveryResult = "sent" | "no-report" | "no-phone" | "not-configured" | "failed";

/** Manda um relatório para o WhatsApp do dono da conta e registra o resultado. */
export async function deliverReport(accountId: string, ownerId: string, kind: string, start: string): Promise<DeliveryResult> {
  if (!whatsappConfigured()) return "not-configured";
  const [report, settings] = await Promise.all([getReport(ownerId, accountId, kind, start), settingsOf(ownerId)]);
  if (!report) return "no-report";
  if (!settings.whatsapp_phone) return "no-phone";
  try {
    const messageId = await sendReportTemplate(settings.whatsapp_phone, reportMessage(report.data, report.ai));
    await markWhatsapp(accountId, kind, start, null);
    console.info("Relatório enviado no WhatsApp", accountId, kind, start, messageId);
    return "sent";
  } catch (err) {
    const msg = err instanceof WhatsappError ? err.message : "falha de conexão com o WhatsApp";
    console.error("Envio do relatório no WhatsApp falhou", accountId, kind, start, err);
    await markWhatsapp(accountId, kind, start, msg);
    return "failed";
  }
}

/** Rodado pelo cron: entrega os relatórios recentes que ainda não foram para o WhatsApp. */
export async function deliverPendingReports(accountId: string, ownerId: string) {
  const counts: Partial<Record<DeliveryResult, number>> = {};
  if (!whatsappConfigured()) return counts;
  for (const r of await reportsToDeliver(accountId)) {
    const result = await deliverReport(accountId, ownerId, r.kind, r.period_start);
    counts[result] = (counts[result] ?? 0) + 1;
    if (result === "no-phone") break; // sem número, nenhum outro vai sair
  }
  return counts;
}
