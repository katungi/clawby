import http from 'http';

const PORT = 3001;
const OPENCLAW = 'http://127.0.0.1:18789';

http.createServer(async (req, res) => {
  const requestedHeaders = req.headers['access-control-request-headers'];

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  // Reflect requested headers so browser preflight accepts SDK-specific headers.
  res.setHeader(
    'Access-Control-Allow-Headers',
    requestedHeaders || 'Content-Type, Authorization, User-Agent',
  );
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  const forwardHeaders = {};
  const passthroughHeaders = new Set(['authorization', 'content-type', 'accept']);
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    if (passthroughHeaders.has(key) || key.startsWith('x-')) {
      forwardHeaders[key] = value;
    }
  }

  const proxyReq = http.request(OPENCLAW + req.url, {
    method: req.method,
    headers: forwardHeaders,
  }, (proxyRes) => {
    // Stream through, don't buffer
    const headers = { ...proxyRes.headers, 'access-control-allow-origin': '*' };

    // For SSE streams, set proper headers
    if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
      headers['content-type'] = 'text/event-stream';
      headers['cache-control'] = 'no-cache';
      headers['connection'] = 'keep-alive';
    }

    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    res.writeHead(502);
    res.end(JSON.stringify({ error: e.message }));
  });

  proxyReq.write(body);
  proxyReq.end();
}).listen(PORT, () => console.log(`CORS proxy running → http://localhost:${PORT} → ${OPENCLAW}`));
