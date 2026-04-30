import type { Metadata } from "next";
import { BBH_Hegarty, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const bbhHegarty = BBH_Hegarty({
  variable: "--font-display-face",
  subsets: ["latin"],
  weight: "400",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Party Game Live",
  description: "Real-time multiplayer Who Is Most Likely To game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bbhHegarty.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
