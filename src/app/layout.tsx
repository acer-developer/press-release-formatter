import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rating Note Studio · ACER",
  description: "Generate publication-ready ACER credit rating press releases from raw notes or existing documents.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
