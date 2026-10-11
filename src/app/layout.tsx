import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const satoshi = localFont({
  src: [
    { path: "./fonts/Satoshi-Regular.ttf", weight: "400" },
    { path: "./fonts/Satoshi-Medium.ttf", weight: "500" },
    { path: "./fonts/Satoshi-Bold.ttf", weight: "700" },
  ],
  variable: "--font-satoshi",
});

const caladea = localFont({
  src: [
    { path: "./fonts/Caladea-400.ttf", weight: "400" },
    { path: "./fonts/Caladea-700.ttf", weight: "700" },
  ],
  variable: "--font-caladea",
});

export const metadata: Metadata = {
  title: "Rating Note Studio | ACER",
  description: "Generate publication-ready ACER credit rating press releases from raw notes or existing documents.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${satoshi.variable} ${caladea.variable}`}>
      <body>{children}</body>
    </html>
  );
}
