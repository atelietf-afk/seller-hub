import type { ShopeeApi } from "./api";
import type { ShopeeEscrow, ShopeeItemBase, ShopeeOrderDetail } from "./map";

// Chamadas da loja usadas na sincronização. Limites da Shopee: 50 ids por consulta de
// detalhes, 100 por página de lista e janelas de no máximo 15 dias na busca de pedidos.

type ModelList = { model?: { price_info?: { current_price: number }[]; stock_info_v2?: { summary_info?: { total_available_stock?: number } } }[] };

export class ShopeeShop {
  constructor(private api: ShopeeApi) {}

  shopInfo() {
    return this.api.get<{ shop_name?: string; region?: string }>("/api/v2/shop/get_shop_info");
  }

  async itemIds(): Promise<number[]> {
    const ids: number[] = [];
    for (let offset = 0; offset < 50_000; ) {
      const r = await this.api.get<{ item?: { item_id: number }[]; has_next_page?: boolean; next_offset?: number }>(
        "/api/v2/product/get_item_list",
        { offset, page_size: 100, item_status: ["NORMAL", "UNLIST"] },
      );
      ids.push(...(r.item ?? []).map((i) => i.item_id));
      if (!r.has_next_page || r.next_offset == null || r.next_offset <= offset) break;
      offset = r.next_offset;
    }
    return ids;
  }

  async itemsBase(ids: number[]): Promise<ShopeeItemBase[]> {
    const out: ShopeeItemBase[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const r = await this.api.get<{ item_list?: ShopeeItemBase[] }>("/api/v2/product/get_item_base_info", { item_id_list: ids.slice(i, i + 50) });
      out.push(...(r.item_list ?? []));
    }
    return out;
  }

  async models(itemId: number) {
    return (await this.api.get<ModelList>("/api/v2/product/get_model_list", { item_id: itemId })).model ?? [];
  }

  /** Códigos dos pedidos criados ou atualizados entre `from` e `to` (unix, até 15 dias). */
  async orderSns(field: "create_time" | "update_time", from: number, to: number): Promise<string[]> {
    const sns: string[] = [];
    let cursor = "";
    for (let page = 0; page < 200; page++) {
      const r = await this.api.get<{ order_list?: { order_sn: string }[]; more?: boolean; next_cursor?: string }>("/api/v2/order/get_order_list", {
        time_range_field: field,
        time_from: from,
        time_to: to,
        page_size: 100,
        cursor,
      });
      sns.push(...(r.order_list ?? []).map((o) => o.order_sn));
      if (!r.more || !r.next_cursor) break;
      cursor = r.next_cursor;
    }
    return sns;
  }

  async orderDetails(sns: string[]): Promise<ShopeeOrderDetail[]> {
    const out: ShopeeOrderDetail[] = [];
    for (let i = 0; i < sns.length; i += 50) {
      const r = await this.api.get<{ order_list?: ShopeeOrderDetail[] }>("/api/v2/order/get_order_detail", {
        order_sn_list: sns.slice(i, i + 50),
        response_optional_fields: "buyer_user_id,item_list,total_amount",
      });
      out.push(...(r.order_list ?? []));
    }
    return out;
  }

  async escrow(orderSn: string): Promise<ShopeeEscrow | null> {
    const r = await this.api.get<{ order_income?: ShopeeEscrow }>("/api/v2/payment/get_escrow_detail", { order_sn: orderSn });
    return r.order_income ?? null;
  }
}
