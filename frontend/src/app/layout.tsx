import type { Metadata } from "next";
import { AuthProvider } from "@/AuthContext";
import { ToastProvider } from "@/ToastContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal Clone",
  description: "Secure, private, real-time messaging",
  icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💬</text></svg>" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
