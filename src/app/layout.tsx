import type { Metadata } from "next";
import { Poppins, Inter, Geist_Mono, Unbounded } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

// Poppins — headings & nav (Runna brand voice)
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Inter — body & dense data
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Geist Mono — filenames, idea codes, tokens (the product's currency)
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Unbounded — the Greenlight wordmark only (never body text)
const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Greenlight · by Rünna",
  description: "Producción de anuncios — de la solicitud a la entrega.",
  // Herramienta PRIVADA: nada de esto debe indexarse (ni la pantalla de login).
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={cn(
        "h-full antialiased",
        poppins.variable,
        inter.variable,
        geistMono.variable,
        unbounded.variable,
      )}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
