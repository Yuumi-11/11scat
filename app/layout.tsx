import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "11scat｜任务同步与高清共享",
  description: "连接你的任务清单，用更清晰的屏幕共享和学习伙伴一起专注。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "11scat",
    description: "任务同步 · 高清共享 · 一起专注",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "11scat",
    description: "任务同步 · 高清共享 · 一起专注",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
