// src/app/layout.tsx

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/layout/AuthProvider";
import { Toaster } from "react-hot-toast";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#EE8B60",
};

export const metadata: Metadata = {
  title: "Climat & Confort Moreau",
  description: "Application de gestion des interventions et chantiers",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CCM",
  },
  icons: {
    icon: "/logo-ccm.jpg",
    apple: "/logo-ccm.jpg",
  },
  formatDetection: { telephone: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: "#14181B",
                color: "#fff",
                borderRadius: "10px",
                fontSize: "14px",
                padding: "12px 16px",
              },
              success: {
                iconTheme: {
                  primary: "#39D2C0",
                  secondary: "#fff",
                },
              },
              error: {
                iconTheme: {
                  primary: "#FF5963",
                  secondary: "#fff",
                },
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
