import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "תיאום פגישות - הייטק סוכנות לביטוח",
  description: "מערכת תיאום פגישות עם סוכני ביטוח",
  robots: "noindex, nofollow",
  icons: {
    icon: "https://ht-ins.co.il/wp-content/themes/htins/sitefiles/htins-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${heebo.variable} antialiased`}>{children}</body>
    </html>
  );
}
