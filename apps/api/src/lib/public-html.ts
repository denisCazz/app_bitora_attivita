export function esc(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

/** Pages opened by the shop's customers from a link, in the same look as the payment page. */
export function publicPage(input: { title: string; business?: string; body: string }) {
  const who = input.business ? `<p class="who">${esc(input.business)}</p>` : "";
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(input.title)}${input.business ? ` · ${esc(input.business)}` : ""}</title>
<style>
  body { margin: 0; background: #f3efe8; color: #1c1917; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { max-width: 480px; margin: 0 auto; padding: 28px 18px 48px; }
  .card { background: #fff; border-radius: 24px; padding: 24px 22px 22px; box-shadow: 0 12px 40px rgba(28, 25, 23, 0.06); margin-bottom: 14px; }
  .who { margin: 0; color: #78716c; font-size: 14px; }
  h1 { font-size: 24px; line-height: 1.25; margin: 8px 0 0; letter-spacing: -0.03em; }
  h2 { font-size: 17px; margin: 0 0 8px; letter-spacing: -0.02em; }
  p { line-height: 1.5; }
  .hint { color: #78716c; font-size: 14px; }
  .ok { color: #15803d; font-weight: 600; }
  button, .btn { display: block; width: 100%; box-sizing: border-box; margin-top: 16px; padding: 15px 18px; border: 0; border-radius: 16px; background: #1c1917; color: #fff; font-size: 16px; font-weight: 600; text-align: center; text-decoration: none; cursor: pointer; font-family: inherit; }
  .btn.soft, button.soft { background: #f3efe8; color: #1c1917; }
  input, select, textarea { width: 100%; box-sizing: border-box; margin-top: 6px; padding: 13px 14px; border: 1px solid #e7e5e4; border-radius: 14px; font-size: 16px; font-family: inherit; background: #fff; color: inherit; }
  label { display: block; margin-top: 14px; font-size: 14px; color: #57534e; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 12px 0; border-top: 1px solid #f5f5f4; }
  li:first-child { border-top: 0; }
  .row { display: flex; justify-content: space-between; gap: 12px; }
  .muted { color: #78716c; }
</style>
</head>
<body><main>
<div class="card">${who}<h1>${esc(input.title)}</h1></div>
${input.body}
</main></body>
</html>`;
}
