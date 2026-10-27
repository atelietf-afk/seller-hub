import "server-only";
import type { DailySummary } from "@/lib/ai/summary";
import type { PeriodReportData } from "@/lib/period-report";
import { one, query } from "@/lib/db";

export interface ReportRow {
  kind: "weekly" | "monthly";
  period_start: string;
  period_end: string;
  data: PeriodReportData;
  ai: DailySummary | null;
  created_at: string;
  whatsapp_sent_at: string | null;
  whatsapp_error: string | null;
}

export function listReports(ownerId: string, accountId: string) {
  return query<Omit<ReportRow, "ai">>(
    `select r.kind, r.period_start, r.period_end, r.data, r.created_at from reports r
     join ml_accounts a on a.id = r.account_id and a.owner_id = $2
     where r.account_id = $1 order by r.period_start desc, r.kind`,
    [accountId, ownerId],
  );
}

export function getReport(ownerId: string, accountId: string, kind: string, start: string) {
  return one<ReportRow>(
    `select r.* from reports r join ml_accounts a on a.id = r.account_id and a.owner_id = $2
     where r.account_id = $1 and r.kind = $3 and r.period_start = $4`,
    [accountId, ownerId, kind, start],
  );
}

export async function reportExists(accountId: string, kind: string, start: string) {
  return !!(await one("select 1 from reports where account_id = $1 and kind = $2 and period_start = $3", [accountId, kind, start]));
}

export async function saveReport(accountId: string, data: PeriodReportData, ai: DailySummary | null) {
  await query(
    `insert into reports (account_id, kind, period_start, period_end, data, ai) values ($1, $2, $3, $4, $5, $6)
     on conflict (account_id, kind, period_start) do update set period_end = excluded.period_end, data = excluded.data,
       ai = excluded.ai, created_at = now()`,
    [accountId, data.period.kind, data.period.start, data.period.end, JSON.stringify(data), ai ? JSON.stringify(ai) : null],
  );
}

/** Relatórios recentes ainda não entregues no WhatsApp (uma tentativa por dia, por até 3 dias). */
export function reportsToDeliver(accountId: string) {
  return query<{ kind: "weekly" | "monthly"; period_start: string }>(
    `select kind, period_start from reports
     where account_id = $1 and whatsapp_sent_at is null and created_at > now() - interval '3 days'
     order by period_start, kind`,
    [accountId],
  );
}

export async function markWhatsapp(accountId: string, kind: string, start: string, error: string | null) {
  await query(
    `update reports set whatsapp_sent_at = case when $4::text is null then now() else whatsapp_sent_at end, whatsapp_error = $4
     where account_id = $1 and kind = $2 and period_start = $3`,
    [accountId, kind, start, error],
  );
}
