import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Index — AI research notebooks, grounded in your sources",
  description:
    "Upload PDFs, sites, transcripts and video, then ask questions answered only from what you gave it — every claim traceable to a source.",
};

// Without this, mobile browsers assume a ~980px desktop-width layout and
// scale the whole page down to fit, which is why Tailwind's responsive
// breakpoints (sm:/lg:/etc.) don't behave correctly on real phones — they're
// evaluated against that fake wide viewport, not the device's actual width.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#5EEAD4",
          colorBackground: "#12181F",
          colorForeground: "#E7ECEF",
          colorInput: "#0B0F14",
          colorInputForeground: "#E7ECEF",
          borderRadius: "0.75rem",
        },
      }}
    >
      <html lang="en" className="dark" suppressHydrationWarning>
        <body className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
          {children}
          <Toaster theme="dark" position="bottom-right" richColors closeButton />
        </body>
      </html>
    </ClerkProvider>
  );
}