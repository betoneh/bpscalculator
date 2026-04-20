export default async function handler(req, res) {
  const BANXICO_TOKEN = process.env.BANXICO_TOKEN || '';

  if (req.method !== 'GET') {
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

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

function sendJson(res, status, payload) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(payload);
}
