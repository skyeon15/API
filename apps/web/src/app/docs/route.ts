export function GET() {
  const html = `<!DOCTYPE html>
<html>
  <head>
    <title>파란대나무숲 API 문서</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  </head>
  <body>
    <script id="api-reference" data-url="${process.env.API_NEXT_PUBLIC_API_URL || 'https://api.bbforest.net'}/docs/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
