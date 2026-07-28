import "./globals.css";
import { ToastProvider } from "@/components/ToastProvider";

export const metadata = {
  title: "ProcureBid",
  description: "Sealed-bid reverse auction procurement platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
