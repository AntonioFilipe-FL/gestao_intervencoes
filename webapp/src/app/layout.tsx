import type { Metadata } from "next";
import { Lato } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { getCurrentUser } from "@/lib/auth";
import { AutoReceptionNotice } from "@/components/AutoReceptionNotice";
import { LowStockNotice } from "@/components/LowStockNotice";

// Tipografia do FROTCOM Styleguide: Lato (light, regular, bold)
const lato = Lato({
  variable: "--font-lato",
  weight: ["300", "400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gestão de Intervenções · Frotcom",
  description: "Sistema de gestão de intervenções técnicas",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="pt" className={`${lato.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* aplica o modo escuro antes de desenhar a página (evita o "flash" claro) */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}" }} />
      </head>
      <body className="flex min-h-full flex-col bg-fc-grey-100 text-fc-dark-100">
        {user && <Navbar user={user} />}
        {user?.role === "admin" && <AutoReceptionNotice />}
        {user?.role === "admin" && <LowStockNotice />}
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
