import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Completed Job Log",
  description: "Internal completed job log for handyman and property services work.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
