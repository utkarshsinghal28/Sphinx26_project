import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "./sw-register";

export const metadata: Metadata = {
  title: "VaaniSeva — सरकारी योजनाएं, आपकी भाषा में",
  description:
    "Ask about government schemes, crop advice and health information by voice, in Hindi, Marathi, Tamil, Bengali or Telugu. Answers are cited from official documents.",
  applicationName: "VaaniSeva",
  appleWebApp: { capable: true, title: "VaaniSeva", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#c2410c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="hi" className="h-full antialiased">
      <body className="min-h-dvh flex flex-col">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
