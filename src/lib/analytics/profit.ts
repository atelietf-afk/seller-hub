// Lucro real por linha de pedido: o que sobra depois de comissão, frete, imposto e custo.

export interface OrderLine {
  orderId: number;
  itemId: string;
  quantity: number;
  unitPrice: number;
  saleFee: number;          // comissão do ML por unidade
  orderShippingCost: number; // frete pago pelo vendedor no pedido inteiro
  orderTotal: number;        // soma das linhas do pedido (para ratear o frete)
}

export interface ItemCost {
  unitCost: number;
  extraCost: number;
}

export interface LineProfit {
  revenue: number;
  fees: number;
  shipping: number;
  tax: number;
  productCost: number;
  profit: number;
  margin: number;   // lucro / faturamento
  hasCost: boolean; // false quando o custo do produto não foi informado
}

const round = (n: number) => Math.round(n * 100) / 100;

export function lineProfit(line: OrderLine, cost: ItemCost | undefined, taxRate: number): LineProfit {
  const revenue = line.unitPrice * line.quantity;
  const fees = line.saleFee * line.quantity;
  const share = line.orderTotal > 0 ? revenue / line.orderTotal : 1;
  const shipping = line.orderShippingCost * share;
  const tax = revenue * taxRate;
  const productCost = cost ? (cost.unitCost + cost.extraCost) * line.quantity : 0;
  const profit = revenue - fees - shipping - tax - productCost;
  return {
    revenue: round(revenue),
    fees: round(fees),
    shipping: round(shipping),
    tax: round(tax),
    productCost: round(productCost),
    profit: round(profit),
    margin: revenue > 0 ? profit / revenue : 0,
    hasCost: !!cost && cost.unitCost > 0,
  };
}

export function sumProfits(rows: LineProfit[]): LineProfit {
  const t = rows.reduce(
    (a, r) => ({
      revenue: a.revenue + r.revenue,
      fees: a.fees + r.fees,
      shipping: a.shipping + r.shipping,
      tax: a.tax + r.tax,
      productCost: a.productCost + r.productCost,
      profit: a.profit + r.profit,
    }),
    { revenue: 0, fees: 0, shipping: 0, tax: 0, productCost: 0, profit: 0 },
  );
  return {
    revenue: round(t.revenue),
    fees: round(t.fees),
    shipping: round(t.shipping),
    tax: round(t.tax),
    productCost: round(t.productCost),
    profit: round(t.profit),
    margin: t.revenue > 0 ? t.profit / t.revenue : 0,
    hasCost: rows.length > 0 && rows.every((r) => r.hasCost),
  };
}
