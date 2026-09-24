import type { Metadata } from "next";
import { Lato } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { getCurrentUser } from "@/lib/auth";

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
    <html lang="pt" className={`${lato.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-fc-grey-100 text-fc-dark-100">
        {user && <Navbar user={user} />}
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
