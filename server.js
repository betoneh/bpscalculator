const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;

loadEnvFile(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const CAPA_API_KEY = process.env.CAPA_API_KEY || '';
const CAPA_BASE_URL = process.env.CAPA_BASE_URL || 'https://staging-api.capa.fi';
const BANXICO_TOKEN = process.env.BANXICO_TOKEN || '';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.gs': 'text/plain; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/api/capa/fx') {
      return handleCapaFx(url, res);
    }
    if (req.method === 'GET' && url.pathname === '/api/banxico/fix') {
      return handleBanxicoFix(res);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { success: false, error: 'Method not allowed' });
    }

    return serveStatic(url.pathname, res, req.method);
  } catch (error) {
    console.error('[server] unexpected error:', error);
    return sendJson(res, 500, { success: false, error: 'Internal server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`BPS Calculator corriendo en http://${HOST}:${PORT}`);
});

async function handleCapaFx(url, res) {
  if (!CAPA_API_KEY) {
    return sendJson(res, 503, {
      success: false,
      error: 'CAPA_API_KEY is not configured',
      errorCode: 'CAPA_API_KEY_MISSING'
    });
  }

  const direction = url.searchParams.get('direction');
  const amountRaw = url.searchParams.get('amount');
  const amountSide = url.searchParams.get('amountSide') || 'source';
  const amount = amountRaw ? Number(amountRaw) : null;

  if (direction !== 'buy' && direction !== 'sell') {
    return sendJson(res, 400, {
      success: false,
      error: 'direction must be buy or sell',
      errorCode: 'INVALID_DIRECTION'
    });
  }

  if (amountRaw && (!Number.isFinite(amount) || amount <= 0)) {
    return sendJson(res, 400, {
      success: false,
      error: 'amount must be a positive number',
      errorCode: 'INVALID_AMOUNT'
    });
  }

  if (amountSide !== 'source' && amountSide !== 'target') {
    return sendJson(res, 400, {
      success: false,
      error: 'amountSide must be source or target',
      errorCode: 'INVALID_AMOUNT_SIDE'
    });
  }

  const sourceCurrency = direction === 'buy' ? 'MXN' : 'USD';
  const targetCurrency = direction === 'buy' ? 'USD' : 'MXN';

  const upstreamUrl = new URL('/api/partner/v2/cross-ramp/quotes', CAPA_BASE_URL);
  upstreamUrl.searchParams.set('sourceCurrency', sourceCurrency);
  upstreamUrl.searchParams.set('targetCurrency', targetCurrency);
  if (amount) {
    upstreamUrl.searchParams.set(amountSide === 'target' ? 'targetAmount' : 'sourceAmount', String(amount));
  } else if (direction === 'buy') {
    upstreamUrl.searchParams.set('targetAmount', '100000');
  } else {
    upstreamUrl.searchParams.set('sourceAmount', '100000');
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        'accept': 'application/json',
        'partner-api-key': CAPA_API_KEY
      }
    });

    const text = await upstreamResponse.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      console.error('[capa] invalid JSON:', text);
      return sendJson(res, 502, {
        success: false,
        error: 'Invalid response from Capa',
        errorCode: 'UPSTREAM_INVALID_JSON'
      });
    }

    if (!upstreamResponse.ok) {
      return sendJson(res, upstreamResponse.status, {
        success: false,
        error: data?.error || data?.message || 'Capa request failed',
        errorCode: data?.errorCode || 'UPSTREAM_ERROR',
        upstream: data
      });
    }

    const quote = data?.data;
    if (!data?.success || !quote?.rate) {
      return sendJson(res, 502, {
        success: false,
        error: 'Incomplete quote from Capa',
        errorCode: 'UPSTREAM_INVALID_PAYLOAD',
        upstream: data
      });
    }

    // Para esta app siempre mostramos USD/MXN.
    // Capa ya devuelve el rate en ese formato para este flujo,
    // así que no debemos invertirlo.
    const normalizedRate = Number(quote.rate);

    return sendJson(res, 200, {
      success: true,
      data: {
        rate: normalizedRate,
        rawRate: Number(quote.rate),
        spread: quote.spread != null ? Number(quote.spread) : null,
        fees: {
          fixedFee: quote.fees?.fixedFee != null ? Number(quote.fees.fixedFee) : null,
          feeCurrency: quote.fees?.feeCurrency || null
        },
        flow: quote.flow || null,
        premiumSpread: quote.premiumSpread != null ? Number(quote.premiumSpread) : null,
        sourceAmount: quote.sourceAmount != null ? Number(quote.sourceAmount) : null,
        sourceCurrency: quote.sourceCurrency || sourceCurrency,
        targetAmount: quote.targetAmount != null ? Number(quote.targetAmount) : null,
        targetCurrency: quote.targetCurrency || targetCurrency
      }
    });
  } catch (error) {
    console.error('[capa] request failed:', error);
    return sendJson(res, 502, {
      success: false,
      error: 'Unable to reach Capa',
      errorCode: 'UPSTREAM_UNREACHABLE'
    });
  }
}

async function handleBanxicoFix(res) {
  if (!BANXICO_TOKEN) {
    return sendJson(res, 503, {
      success: false,
      error: 'BANXICO_TOKEN is not configured',
      errorCode: 'BANXICO_TOKEN_MISSING'
    });
  }

  const upstreamUrl = 'https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno';

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        'Bmx-Token': BANXICO_TOKEN
      }
    });

    const text = await upstreamResponse.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      return sendJson(res, 502, {
        success: false,
        error: 'Invalid response from Banxico',
        errorCode: 'BANXICO_INVALID_JSON'
      });
    }

    if (!upstreamResponse.ok) {
      return sendJson(res, upstreamResponse.status, {
        success: false,
        error: 'Banxico request failed',
        errorCode: 'BANXICO_UPSTREAM_ERROR',
        upstream: data
      });
    }

    const serie = data?.bmx?.series?.[0];
    const dato = serie?.datos?.[0]?.dato;
    const fecha = serie?.datos?.[0]?.fecha || null;
    const rate = dato != null ? Number(String(dato).replace(/,/g, '')) : null;

    if (!rate || !Number.isFinite(rate)) {
      return sendJson(res, 502, {
        success: false,
        error: 'Incomplete FIX payload from Banxico',
        errorCode: 'BANXICO_INVALID_PAYLOAD',
        upstream: data
      });
    }

    return sendJson(res, 200, {
      success: true,
      data: {
        provider: 'Banxico FIX',
        rate,
        date: fecha
      }
    });
  } catch (error) {
    return sendJson(res, 502, {
      success: false,
      error: 'Unable to reach Banxico',
      errorCode: 'BANXICO_UNREACHABLE'
    });
  }
}

function serveStatic(requestPath, res, method) {
  const safePath = normalizePath(requestPath);
  if (!safePath) {
    return sendText(res, 403, 'Forbidden');
  }

  const filePath = safePath === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, safePath.slice(1));

  if (!filePath.startsWith(ROOT + path.sep) && filePath !== path.join(ROOT, 'index.html')) {
    return sendText(res, 403, 'Forbidden');
  }

  if (path.basename(filePath).startsWith('.env')) {
    return sendText(res, 404, 'Not found');
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (safePath !== '/') {
        return serveStatic('/', res, method);
      }
      return sendText(res, 404, 'Not found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store'
    });
    if (method === 'HEAD') {
      return res.end();
    }
    return res.end(content);
  });
}

function normalizePath(requestPath) {
  const decoded = decodeURIComponent(requestPath || '/');
  const normalized = path.posix.normalize(decoded);
  if (normalized.includes('..')) return null;
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(text);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) return;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  });
}
