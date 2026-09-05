import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "11scat｜最近7天、高清投屏与房间聊天",
  description: "左侧同步滴答清单最近7天任务，中间高清投屏，右侧常驻自习室聊天。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "11scat", statusBarStyle: "default" },
  openGraph: {
    title: "11scat",
    description: "最近7天滴答任务 · 高清投屏 · 右侧常驻聊天",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "11scat",
    description: "最近7天滴答任务 · 高清投屏 · 右侧常驻聊天",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
