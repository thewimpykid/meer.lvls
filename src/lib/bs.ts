// Black-Scholes greeks + IV bisection

const SQRT2PI = Math.sqrt(2 * Math.PI);
const RISK_FREE = 0.0525;

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT2PI;
}

function normCdf(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;
  const sign = x >= 0 ? 1 : -1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.2316419 * ax);
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const approx = 1 - normPdf(ax) * poly;
  return (1 + sign * (2 * approx - 1)) / 2;
}

export interface Greeks {
  price: number;
  delta: number;   // dV/dS
  gamma: number;   // d2V/dS2
  vanna: number;   // dDelta/dSigma = dVega/dS
  theta: number;   // daily decay
  vega: number;    // per 1% IV (divided by 100)
  charm: number;   // dDelta/dT daily
}

export function bsGreeks(S: number, K: number, T: number, sigma: number, isCall: boolean): Greeks {
  const r = RISK_FREE;

  if (T <= 1e-6 || sigma <= 1e-6) {
    const intrinsic = isCall ? Math.max(S - K, 0) : Math.max(K - S, 0);
    const delta = isCall ? (S >= K ? 1 : 0) : (S <= K ? -1 : 0);
    return { price: intrinsic, delta, gamma: 0, vanna: 0, theta: 0, vega: 0, charm: 0 };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const nd1 = normPdf(d1);
  const ert = Math.exp(-r * T);

  const price = isCall
    ? S * normCdf(d1) - K * ert * normCdf(d2)
    : K * ert * normCdf(-d2) - S * normCdf(-d1);

  const delta = isCall ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = nd1 / (S * sigma * sqrtT);
  // vanna = dDelta/dSigma = -nd1 * d2 / sigma
  const vanna = -nd1 * d2 / sigma;
  // vega per 1% iv change
  const vega = S * nd1 * sqrtT / 100;
  // theta: daily
  const thetaRaw = isCall
    ? -(S * nd1 * sigma) / (2 * sqrtT) - r * K * ert * normCdf(d2)
    : -(S * nd1 * sigma) / (2 * sqrtT) + r * K * ert * normCdf(-d2);
  const theta = thetaRaw / 365;
  // charm = dDelta/dT (daily). Negative = delta decays toward 0/1 at expiry.
  const charmRaw = isCall
    ? -nd1 * (2 * r * T - d2 * sigma * sqrtT) / (2 * T * sigma * sqrtT)
    : -nd1 * (2 * r * T - d2 * sigma * sqrtT) / (2 * T * sigma * sqrtT);
  const charm = charmRaw / 365;

  return { price, delta, gamma, vanna, theta, vega, charm };
}

export function impliedVol(mid: number, S: number, K: number, T: number, isCall: boolean): number | null {
  if (mid <= 0 || T <= 1e-6) return null;
  const intrinsic = isCall ? Math.max(S - K, 0) : Math.max(K - S, 0);
  if (mid < intrinsic * 0.995) return null;

  let lo = 0.001, hi = 20.0;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    const p = bsGreeks(S, K, T, m, isCall).price;
    if (Math.abs(p - mid) < 0.001) return m;
    if (p > mid) hi = m; else lo = m;
  }
  const iv = (lo + hi) / 2;
  return iv > 0 && iv < 20 ? iv : null;
}
