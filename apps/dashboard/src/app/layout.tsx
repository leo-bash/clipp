import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShortFactory",
  description: "Short-form content operations dashboard"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
