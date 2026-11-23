import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Background } from "@/components/Background";
import { MobileNav, Sidebar } from "@/components/Sidebar";
import { FiltersProvider } from "@/lib/filters";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RetailIQ",
  description: "Turn commerce data into confident decisions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-page font-sans text-white" suppressHydrationWarning>
        <Background />
        <FiltersProvider>
          <MobileNav />
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="min-w-0 flex-1 px-5 py-6 lg:px-10 lg:py-8">{children}</main>
          </div>
        </FiltersProvider>
      </body>
    </html>
  );
}
