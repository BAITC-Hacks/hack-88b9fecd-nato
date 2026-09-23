import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "AI Sana — реальные задачи, новые возможности", description: "Платформа задач бизнеса и студенческих команд" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ru"><body>{children}</body></html>; }
