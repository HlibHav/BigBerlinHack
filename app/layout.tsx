import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "BBH — Brand Intelligence Agent",
  description:
    "Що LLM кажуть про твій бренд просто зараз. Радар конкурентів, симулятор позиціонування, контр-наративи в один клік.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
