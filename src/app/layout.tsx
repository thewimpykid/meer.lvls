import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "OptionsFlow",
  description: "QQQ/NQ options chain + reem_lvls key levels",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="max-w-screen-2xl mx-auto px-4 py-4">
          {children}
        </main>
      </body>
    </html>
  );
}
