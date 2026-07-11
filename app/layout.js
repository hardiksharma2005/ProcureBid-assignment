import "./globals.css";

export const metadata = {
  title: "ProcureBid",
  description: "Sealed-bid reverse auction procurement platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
