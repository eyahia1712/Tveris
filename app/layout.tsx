import type { Metadata } from "next";
import { Archivo, Archivo_Narrow, Geist_Mono } from "next/font/google";

import "./globals.css";

// Archivo for reading text; Archivo Narrow for uppercase micro-labels; Geist
// Mono for every number, id and reference, so figures line up in columns.
const archivo = Archivo({ subsets: ["latin"], variable: "--font-sans" });
const archivoNarrow = Archivo_Narrow({ subsets: ["latin"], variable: "--font-narrow" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
// The wordmark: Archivo's italic cut, heavy.
const logoFace = Archivo({ subsets: ["latin"], style: ["italic"], weight: ["800"], variable: "--font-logo" });

export const metadata: Metadata = {
  title: { default: "Tveris", template: "%s | Tveris" },
  description:
    "Tveris reads a shipping team's inbox, checks every shipping instruction against its draft bill of lading, and shows what needs attention first.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${archivoNarrow.variable} ${geistMono.variable} ${logoFace.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
