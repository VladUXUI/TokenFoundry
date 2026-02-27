import "./globals.css";
export const metadata = {
    title: "Design Tokens",
    description: "Generated from Figma variables",
};
export default function RootLayout({ children, }) {
    return (<html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>);
}
