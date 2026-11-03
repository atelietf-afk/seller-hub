import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Seller Hub Ideal", template: "%s · Seller Hub Ideal" },
  description: "Gestão de marketplaces: vendas, lucro, anúncios e publicidade de Mercado Livre, Shopee e Amazon em um só lugar",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geist.variable} antialiased`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
