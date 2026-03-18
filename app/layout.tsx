import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Welcome Weddings — Funil de Vendas",
  description: "Dashboard de métricas do funil de vendas em tempo real",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: `
          window.onerror = function(msg, src, line, col, err) {
            var d = document.getElementById('__err');
            if (!d) { d = document.createElement('pre'); d.id='__err'; d.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#1a0000;color:#f66;padding:12px;font-size:11px;max-height:40vh;overflow:auto;border-top:2px solid red'; document.body.appendChild(d); }
            d.textContent += msg + '\\n' + (src||'') + ':' + line + ':' + col + '\\n' + (err&&err.stack?err.stack:'') + '\\n---\\n';
          };
        `}} />
      </body>
    </html>
  );
}
