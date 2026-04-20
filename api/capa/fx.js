const DEFAULT_CAPA_BASE_URL = 'https://staging-api.capa.fi';

export default async function handler(req, res) {
  const CAPA_API_KEY = process.env.CAPA_API_KEY || '';
  const CAPA_BASE_URL = process.env.CAPA_BASE_URL || DEFAULT_CAPA_BASE_URL;

  if (req.method !== 'GET') {
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  if (!CAPA_API_KEY) {
    return sendJson(res, 503, {
      success: false,
      error: 'CAPA_API_KEY is not configured',
      errorCode: 'CAPA_API_KEY_MISSING'
    });
  }

  const direction = req.query.direction;
  const amountRaw = req.query.amount;
  const amountSide = req.query.amountSide || 'source';
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
        accept: 'application/json',
        'partner-api-key': CAPA_API_KEY
      }
    });

    const text = await upstreamResponse.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
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

    return sendJson(res, 200, {
      success: true,
      data: {
        rate: Number(quote.rate),
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
    return sendJson(res, 502, {
      success: false,
      error: 'Unable to reach Capa',
      errorCode: 'UPSTREAM_UNREACHABLE'
    });
  }
}

function sendJson(res, status, payload) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(payload);
}
