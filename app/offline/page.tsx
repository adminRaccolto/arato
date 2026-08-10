// Página servida pelo Service Worker quando a navegação falha sem internet.
// Precisa ser estática para ser pré-cacheada pelo Workbox.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Arato — Sem conexão</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: system-ui, -apple-system, Arial, sans-serif;
            background: #111111;
            color: #ffffff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .card {
            background: #1A1A1A;
            border: 0.5px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 48px 40px;
            text-align: center;
            max-width: 360px;
            width: 90vw;
          }
          .logo {
            font-size: 28px;
            font-weight: 700;
            letter-spacing: -0.5px;
            color: #ffffff;
            margin-bottom: 32px;
          }
          .icon {
            width: 56px;
            height: 56px;
            background: rgba(255,255,255,0.06);
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            font-size: 28px;
          }
          h1 {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 10px;
            color: #ffffff;
          }
          p {
            font-size: 13px;
            color: rgba(255,255,255,0.5);
            line-height: 1.6;
            margin-bottom: 32px;
          }
          button {
            background: #C9921B;
            color: #ffffff;
            border: none;
            border-radius: 10px;
            padding: 12px 32px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
          }
          button:active { opacity: 0.85; }
          .tip {
            font-size: 11px;
            color: rgba(255,255,255,0.3);
            margin-top: 20px;
          }
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="logo">Arato</div>
          <div className="icon">📡</div>
          <h1>Sem conexão</h1>
          <p>
            Você está sem internet no momento.<br />
            Verifique o sinal e tente novamente.
          </p>
          <button onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
          <div className="tip">Os dados ficam salvos até a conexão voltar</div>
        </div>
      </body>
    </html>
  );
}
