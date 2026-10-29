import "./globals.css"

export const metadata = {
  title: "GCash Payments | Resort Operations",
  description: "GCash payment settings and booking payment verification.",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}