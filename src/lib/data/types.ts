// Linhas do banco usadas fora da camada de dados.

export interface MlAccount {
  id: string;
  owner_id: string;
  ml_user_id: number;
  nickname: string | null;
  site_id: string;
  reputation: { level_id?: string | null } | null;
  last_synced_at: string | null;
  created_at: string;
  orders_history_since?: string | null;
  /** Só vem em accountsOf: false quando a autorização do ML não terminou (sem tokens). */
  connected?: boolean;
}

export interface SellerSettings {
  owner_id: string;
  tax_rate: number;
  visits_drop_alert: number;
  low_stock_days: number;
  min_margin: number;
}

export interface EventRow {
  id: string;
  account_id: string;
  kind: string;
  severity: "info" | "success" | "warning" | "critical";
  title: string;
  body: string | null;
  item_id: string | null;
  created_at: string;
  read_at: string | null;
}
