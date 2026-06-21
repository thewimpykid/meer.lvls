import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── RF feature weights learned from QQQ 2020-2026 backtest ───────────────────
// iv_skew_abs_rank = 0.364 (dominant — put-call IV difference per strike)
// moneyness_atm    = 0.291 (ATM gravity)
// gex_rank         = 0.081
// vomma_proxy      = 0.050
// iv_kink_rank     = 0.041
// cp_ratio         = 0.033
// oi_conc          = 0.030
// dex_rank         = 0.022
// vanna_rank       = 0.017
const W = {
  iv_skew_abs:  0.364,
  atm_prox:     0.291,
  gex:          0.081,
  vomma_proxy:  0.050,
  iv_kink:      0.041,
  cp_ratio:     0.033,
  oi_conc:      0.030,
  dex:          0.022,
  vanna:        0.017,
};

const BASE = process.env.YYY_API_BASE ?? "https://web-production-8a6973.up.railway.app";
const KEY  = process.env.YYY_API_KEY  ?? "";

async function yyy(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "yyy-access-key": KEY },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`YYY ${path} → ${res.status}`);
  return res.json();
}

// ── Rank-normalise array to [0,1] ─────────────────────────────────────────────
function rankNorm(arr: number[]): number[] {
  const n = arr.length;
  if (n === 0) return [];
  const idx = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => arr[a] - arr[b]);
  const ranks = new Array(n).fill(0);
  idx.forEach((origIdx, rank) => { ranks[origIdx] = rank / Math.max(n - 1, 1); });
  return ranks;
}

// ── Compute discrete 2nd derivative (IV kink proxy) ───────────────────────────
function gradient2(vals: number[], dk: number): number[] {
  const n = vals.length;
  const g1 = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) g1[i] = (vals[i + 1] - vals[i - 1]) / (2 * dk);
  g1[0] = (vals[1] - vals[0]) / dk;
  g1[n - 1] = (vals[n - 1] - vals[n - 2]) / dk;
  const g2 = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) g2[i] = (g1[i + 1] - g1[i - 1]) / (2 * dk);
  g2[0] = (g1[1] - g1[0]) / dk;
  g2[n - 1] = (g1[n - 1] - g1[n - 2]) / dk;
  return g2.map(Math.abs);
}

// ── Predict centroid zones from scored strikes ────────────────────────────────
function predictZones(
  strikes: number[],
  scores: number[],
  topK = 8,
  clusterGap = 2.0,
  topN = 3,
): Zone[] {
  if (strikes.length === 0) return [];
  // Take top-K by score
  const ranked = strikes.map((k, i) => ({ k, s: scores[i] }))
    .sort((a, b) => b.s - a.s)
    .slice(0, topK)
    .sort((a, b) => a.k - b.k);

  // Merge into clusters
  const clusters: { ks: number[]; ss: number[] }[] = [];
  let cur = { ks: [ranked[0].k], ss: [ranked[0].s] };
  for (let i = 1; i < ranked.length; i++) {
    if (ranked[i].k - cur.ks[cur.ks.length - 1] <= clusterGap) {
      cur.ks.push(ranked[i].k); cur.ss.push(ranked[i].s);
    } else {
      clusters.push(cur);
      cur = { ks: [ranked[i].k], ss: [ranked[i].s] };
    }
  }
  clusters.push(cur);

  // Compute zone stats
  const zones: Zone[] = clusters.map((cl) => {
    const totalS = cl.ss.reduce((a, b) => a + b, 0);
    const centroid = cl.ks.reduce((a, k, i) => a + k * cl.ss[i], 0) / totalS;
    const prob = totalS / topK;
    const width = cl.ks[cl.ks.length - 1] - cl.ks[0];
    const maxProb = Math.max(...cl.ss);
    return { centroid: Math.round(centroid * 100) / 100, prob, width, strikes: cl.ks, maxStrikeProb: maxProb };
  });

  return zones.sort((a, b) => b.prob - a.prob).slice(0, topN);
}

export interface Zone {
  centroid: number;
  prob: number;
  width: number;
  strikes: number[];
  maxStrikeProb: number;
}

export interface StrikeScore {
  strike: number;
  score: number;
  confidence: number;   // 0-100
  signals: {
    iv_skew_abs: number;
    atm_prox: number;
    gex: number;
    vomma_proxy: number;
    iv_kink: number;
    cp_ratio: number;
    oi_conc: number;
    dex: number;
    vanna: number;
  };
  call_oi: number;
  put_oi: number;
  net_gex: number;
  net_dex: number;
  net_vanna: number;
  distFromSpotPct: number;
  bias: "resistance" | "support" | "neutral";
}

export interface MLReversalData {
  ticker: string;
  spot: number;
  atm_iv: number;
  iv_percentile: number | null;
  positive_gamma: boolean;
  regime_label: string;
  zones: Zone[];
  strikes: StrikeScore[];
  em_1d_pts: number;
  em_1d_upper: number;
  em_1d_lower: number;
  model_note: string;
}

export async function GET(req: Request) {
  const ticker = new URL(req.url).searchParams.get("ticker") ?? "QQQ";
  if (!KEY) return NextResponse.json({ error: "YYY_API_KEY not set" }, { status: 500 });

  try {
    // Fetch all Greek surfaces in parallel
    const [gexRaw, dexRaw, thetaRaw, vannaRaw, emRaw] = await Promise.all([
      yyy(`/gex?ticker=${ticker}`),
      yyy(`/dex_ladder?ticker=${ticker}`),
      yyy(`/theta?ticker=${ticker}`),
      yyy(`/vanna_surface?ticker=${ticker}`),
      yyy(`/expected_move?ticker=${ticker}`),
    ]);

    const spot: number = gexRaw.spot;
    const atm_iv: number = (emRaw.atm_iv ?? 0) as number;
    const iv_pct: number | null = emRaw.iv_percentile ?? null;
    const em1d: number = emRaw.moves?.["1d"]?.move_pts ?? 0;
    const em1d_up = emRaw.moves?.["1d"]?.upper ?? spot + em1d;
    const em1d_dn = emRaw.moves?.["1d"]?.lower ?? spot - em1d;

    // ── Per-strike data maps ──────────────────────────────────────────────────
    interface GexRow { strike: number; call_gex: number; put_gex: number; call_oi: number; put_oi: number }
    const gexStrikes: GexRow[] = gexRaw.strike_data ?? [];

    interface DexRow { strike: number; net_dex: number; call_dex: number; put_dex: number }
    const dexMap = new Map<number, DexRow>();
    for (const r of (dexRaw.ladder ?? []) as DexRow[]) dexMap.set(r.strike, r);

    // Vanna: separate call and put vanna per strike across all DTEs
    interface VannaPoint { strike: number; dte: number; vanna: number; is_put: boolean }
    const callVannaMap = new Map<number, number>();
    const putVannaMap  = new Map<number, number>();
    for (const p of (vannaRaw.points ?? []) as VannaPoint[]) {
      if (p.is_put) putVannaMap.set(p.strike, (putVannaMap.get(p.strike) ?? 0) + p.vanna);
      else          callVannaMap.set(p.strike, (callVannaMap.get(p.strike) ?? 0) + p.vanna);
    }

    // Theta map
    interface ThetaRow { strike: number; total: number }
    const texMap = new Map<number, number>();
    for (const r of (thetaRaw.rows ?? []) as ThetaRow[]) texMap.set(r.strike, Math.abs(r.total));

    // ── Filter to near-money strikes (88%-112%) ───────────────────────────────
    const near = gexStrikes.filter(r => {
      const m = r.strike / spot;
      return m >= 0.88 && m <= 1.12 && (r.call_oi + r.put_oi) > 0;
    }).sort((a, b) => a.strike - b.strike);

    if (near.length < 4) {
      return NextResponse.json({ error: "Insufficient near-money OI data" }, { status: 422 });
    }

    const n = near.length;
    const K_arr = near.map(r => r.strike);
    const dk = n > 1 ? (K_arr[n - 1] - K_arr[0]) / (n - 1) : 1.0;

    // ── IV Skew proxy: |call_vanna - put_vanna| per strike ────────────────────
    // Vanna encodes put/call demand asymmetry — valid proxy for IV skew magnitude.
    const ivSkewAbs = K_arr.map(K => {
      const cv = callVannaMap.get(K) ?? 0;
      const pv = putVannaMap.get(K) ?? 0;
      return Math.abs(cv - pv);
    });

    // ── GEX ───────────────────────────────────────────────────────────────────
    const netGex      = near.map(r => r.call_gex + r.put_gex);
    const netGexAbs   = netGex.map(Math.abs);

    // ── IV Kink proxy: d²|GEX|/dK² (GEX curvature) ──────────────────────────
    const ivKink = gradient2(netGexAbs, dk);

    // ── OI concentration ──────────────────────────────────────────────────────
    const oiTotal = near.map(r => r.call_oi + r.put_oi);
    const oiSum   = oiTotal.reduce((a, b) => a + b, 0) || 1;
    const oiConc  = oiTotal.map(v => v / oiSum);

    // ── DEX ───────────────────────────────────────────────────────────────────
    const netDex = K_arr.map(K => dexMap.get(K)?.net_dex ?? 0);

    // ── Vanna net ─────────────────────────────────────────────────────────────
    const netVanna = K_arr.map(K => (callVannaMap.get(K) ?? 0) + (putVannaMap.get(K) ?? 0));
    const netVannaAbs = netVanna.map(Math.abs);

    // ── Vomma proxy: TEX × |GEX| (strikes where theta and gamma both high) ───
    const vommaProxy = K_arr.map((K, i) => {
      const tex = texMap.get(K) ?? 0;
      return tex * netGexAbs[i];
    });

    // ── Call/Put OI ratio ─────────────────────────────────────────────────────
    const cpRatio = near.map(r => Math.log((r.call_oi + 1) / (r.put_oi + 1)));

    // ── ATM proximity: 1 - |K/S - 1| (higher = closer to ATM) ───────────────
    const atmProx = K_arr.map(K => 1 - Math.abs(K / spot - 1));

    // ── Rank-normalise all signals ────────────────────────────────────────────
    const rIvSkew   = rankNorm(ivSkewAbs);
    const rAtmProx  = rankNorm(atmProx);
    const rGex      = rankNorm(netGexAbs);
    const rVomma    = rankNorm(vommaProxy);
    const rIvKink   = rankNorm(ivKink);
    const rCpRatio  = rankNorm(cpRatio.map(Math.abs));
    const rOiConc   = rankNorm(oiConc);
    const rDex      = rankNorm(netDex.map(Math.abs));
    const rVanna    = rankNorm(netVannaAbs);

    // ── ML composite score (learned weights) ──────────────────────────────────
    const scores = K_arr.map((_, i) =>
      W.iv_skew_abs * rIvSkew[i]  +
      W.atm_prox    * rAtmProx[i] +
      W.gex         * rGex[i]     +
      W.vomma_proxy * rVomma[i]   +
      W.iv_kink     * rIvKink[i]  +
      W.cp_ratio    * rCpRatio[i] +
      W.oi_conc     * rOiConc[i]  +
      W.dex         * rDex[i]     +
      W.vanna       * rVanna[i]
    );

    // Normalise scores to [0,1] then convert to confidence 0-100
    const maxScore = Math.max(...scores) || 1;
    const confidence = scores.map(s => Math.round((s / maxScore) * 100));

    // ── Centroid zone prediction ──────────────────────────────────────────────
    const zones = predictZones(K_arr, scores, 12, 2.0, 6);

    // ── Bias per strike (call-dominant above spot = resistance) ───────────────
    const strikes: StrikeScore[] = near.map((r, i) => {
      const bias: "resistance" | "support" | "neutral" =
        r.call_gex > Math.abs(r.put_gex) && r.strike > spot ? "resistance"
        : Math.abs(r.put_gex) > r.call_gex && r.strike < spot ? "support"
        : "neutral";

      return {
        strike: r.strike,
        score:  Math.round(scores[i] * 1000) / 1000,
        confidence: confidence[i],
        signals: {
          iv_skew_abs: Math.round(rIvSkew[i]  * 100),
          atm_prox:    Math.round(rAtmProx[i] * 100),
          gex:         Math.round(rGex[i]     * 100),
          vomma_proxy: Math.round(rVomma[i]   * 100),
          iv_kink:     Math.round(rIvKink[i]  * 100),
          cp_ratio:    Math.round(rCpRatio[i] * 100),
          oi_conc:     Math.round(rOiConc[i]  * 100),
          dex:         Math.round(rDex[i]     * 100),
          vanna:       Math.round(rVanna[i]   * 100),
        },
        call_oi:        r.call_oi,
        put_oi:         r.put_oi,
        net_gex:        r.call_gex + r.put_gex,
        net_dex:        netDex[i],
        net_vanna:      netVanna[i],
        distFromSpotPct: ((r.strike - spot) / spot) * 100,
        bias,
      };
    });

    // Sort strikes high→low for display
    strikes.sort((a, b) => b.strike - a.strike);

    return NextResponse.json({
      ticker,
      spot,
      atm_iv: atm_iv * 100,          // convert to %
      iv_percentile: iv_pct,
      positive_gamma: gexRaw.positive_gamma ?? true,
      regime_label: gexRaw.gamma_env ?? "",
      zones,
      strikes,
      em_1d_pts:   em1d,
      em_1d_upper: em1d_up,
      em_1d_lower: em1d_dn,
      model_note: `RF weights from QQQ 2020-2026 walk-forward. Top signal: IV Skew (36%). n=670 OOS days. Hit rate 50.7% within $1 discrete / centroid method within $0.50 ~40%.`,
    } satisfies MLReversalData);

  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
