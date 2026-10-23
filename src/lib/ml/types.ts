// Formatos (parciais) das respostas da API do Mercado Livre que o sistema usa.

export interface MlTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // segundos (hoje, 6 horas)
  user_id: number;
  scope?: string;
}

export interface MlUser {
  id: number;
  nickname: string;
  site_id: string;
  seller_reputation?: {
    level_id: string | null;
    power_seller_status: string | null;
    transactions?: { total: number; completed: number; canceled: number };
    metrics?: Record<string, { rate?: number; value?: number }>;
  };
}

export interface MlItem {
  id: string;
  title: string;
  price: number;
  available_quantity: number;
  sold_quantity: number;
  status: string;
  listing_type_id?: string;
  category_id?: string;
  thumbnail?: string;
  permalink?: string;
  health?: number | null;
  shipping?: { logistic_type?: string; free_shipping?: boolean };
}

export interface MlOrder {
  id: number;
  status: string;
  date_created: string;
  total_amount: number;
  shipping?: { id: number | null } | null;
  buyer?: { id: number };
  order_items: {
    item: { id: string; title: string };
    quantity: number;
    unit_price: number;
    sale_fee?: number | null;
  }[];
}

export interface MlQuestion {
  id: number;
  item_id: string;
  text: string;
  status: string;
  date_created: string;
  answer?: { text: string } | null;
}

export interface MlVisitsWindow {
  item_id: string;
  total_visits: number;
  results: { date: string; total: number }[];
}

export interface MlShipmentCosts {
  senders?: { user_id: number; cost: number }[];
}

export interface MlNotification {
  resource: string;
  user_id: number;
  topic: string;
  application_id: number;
  attempts?: number;
  sent?: string;
  received?: string;
}
