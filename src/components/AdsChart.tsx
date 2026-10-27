"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { brl } from "@/lib/format";

const dayLabel = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

// Investimento e vendas com anúncios por dia: mesma unidade (R$), um só eixo.
// Vendas usa a cor 1 (azul), como o faturamento no painel; investimento a cor 2.
export function AdsChart({ data }: { data: { day: string; cost: number; revenue: number }[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Investimento e vendas com anúncios por dia">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)} mil` : String(v))}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            formatter={(v) => brl(Number(v))}
            labelFormatter={(l) => dayLabel(String(l))}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }}
            cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-2)" }} />
          <Line type="monotone" dataKey="revenue" name="Vendas com anúncios" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="cost" name="Investimento" stroke="var(--series-2)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
