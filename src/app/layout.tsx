import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TG Support Desk",
  description: "Travelgenix AI-first support desk",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{if(localStorage.getItem('tg-theme')==='dark'){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();",
          }}
        />
        {children}
      </body>
    </html>
  );
}
