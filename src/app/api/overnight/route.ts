import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE = process.env.YYY_API_BASE ?? "https://web-production-8a6973.up.railway.app";
const KEY  = process.env.YYY_API_KEY  ?? "";

async function yyy(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "yyy-access-key": KEY },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`yyy ${path} → ${res.status}`);
  return res.json();
}

async function yyyOptional(path: string) {
  try { return await yyy(path); } catch { return null; }
}

function pctRank(sorted: number[], v: number): number {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m; }
  return sorted.length > 0 ? Math.round((lo / sorted.length) * 100) : 0;
}

export async function GET(req: Request) {
  const ticker = new URL(req.url).searchParams.get("ticker") ?? "QQQ";
  const topN   = parseInt(new URL(req.url).searchParams.get("n") ?? "6");
  if (!KEY) return NextResponse.json({ error: "YYY_API_KEY not set" }, { status: 500 });

  try {
    const [gexRaw, thetaRaw, vannaRaw, emRaw, charmRaw, zdteRaw, biasRaw] = await Promise.all([
      yyy(`/gex?ticker=${ticker}`),
      yyy(`/theta?ticker=${ticker}`),
      yyy(`/vanna_surface?ticker=${ticker}`),
      yyy(`/expected_move?ticker=${ticker}`),
      yyy(`/charm_surface?ticker=${ticker}`),
      yyyOptional(`/zero_dte?ticker=${ticker}`),
      yyyOptional(`/bias`),
    ]);

    const spot: number = gexRaw.spot;

    // ── GEX data ──────────────────────────────────────────────────────────────
    interface GexRow { strike: number; call_gex: number; put_gex: number; call_oi: number; put_oi: number }
    const gexStrikes: GexRow[] = gexRaw.strike_data ?? [];
    const gexMap = new Map<number, GexRow>();
    for (const r of gexStrikes) gexMap.set(r.strike, r);

    // ── Zero gamma: cumulative net_gex crosses zero ───────────────────────────
    const nearStrikes = gexStrikes.filter(r => Math.abs(r.strike - spot) / spot <= 0.20);
    const desc = [...nearStrikes].sort((a, b) => b.strike - a.strike);
    let cum = 0, zeroGamma: number | null = null;
    for (let i = 0; i < desc.length; i++) {
      const prev = cum;
      cum += desc[i].call_gex + desc[i].put_gex;
      if (i > 0 && prev * cum < 0) {
        const s0 = desc[i - 1].strike, s1 = desc[i].strike;
        zeroGamma = s0 + (s1 - s0) * Math.abs(prev) / (Math.abs(prev) + Math.abs(cum));
        break;
      }
    }

    // ── TEX map (theta magnitude per strike) ──────────────────────────────────
    interface ThetaRow { strike: number; total: number }
    const texMap = new Map<number, number>();
    for (const r of (thetaRaw.rows ?? []) as ThetaRow[])
      texMap.set(r.strike, Math.abs(r.total));

    // TEX pin: strike with highest theta exposure within ±8% of spot
    let texPinStrike = 0, texPinVal = 0;
    for (const [strike, tex] of Array.from(texMap.entries())) {
      if (Math.abs(strike - spot) / spot > 0.08) continue;
      if (tex > texPinVal) { texPinVal = tex; texPinStrike = strike; }
    }

    // ── Vanna map per strike ──────────────────────────────────────────────────
    interface VannaPoint { strike: number; vanna: number; is_put: boolean }
    const vannaMap = new Map<number, number>();
    for (const p of (vannaRaw.points ?? []) as VannaPoint[]) {
      vannaMap.set(p.strike, (vannaMap.get(p.strike) ?? 0) + p.vanna);
    }
    const netVanna = Array.from(vannaMap.values()).reduce((s, v) => s + v, 0);
    const vannaDirection: "bullish" | "bearish" | "neutral" = netVanna > 100 ? "bullish" : netVanna < -100 ? "bearish" : "neutral";

    // ── Charm map per strike ──────────────────────────────────────────────────
    // Dealer charm flow:
    // - Call charm > 0: delta decaying toward 0, dealers unwind long delta → bearish at that strike
    // - Put charm > 0: put delta decaying toward 0, dealers buy back short delta → bullish at that strike
    // Net dealer flow: put_charm - call_charm (positive = bullish overnight dealer hedging)
    interface CharmPoint { strike: number; charm: number; is_put: boolean }
    const charmCallMap = new Map<number, number>();
    const charmPutMap  = new Map<number, number>();
    for (const p of (charmRaw.points ?? []) as CharmPoint[]) {
      if (p.is_put) {
        charmPutMap.set(p.strike, (charmPutMap.get(p.strike) ?? 0) + p.charm);
      } else {
        charmCallMap.set(p.strike, (charmCallMap.get(p.strike) ?? 0) + p.charm);
      }
    }

    // All strikes with any charm data
    const allCharmStrikes = new Set([
      ...Array.from(charmCallMap.keys()),
      ...Array.from(charmPutMap.keys()),
    ]);

    // Net dealer charm flow per strike: put_charm - call_charm
    interface CharmStrike {
      strike: number;
      call_charm: number;
      put_charm: number;
      net_dealer_flow: number; // positive = bullish overnight pressure
      direction: "bullish" | "bearish" | "neutral";
      magnitude: number;
      call_oi: number;
      put_oi: number;
      net_gex: number;
      vanna_net: number;
      tex: number;
    }

    const charmStrikes: CharmStrike[] = [];
    for (const strike of Array.from(allCharmStrikes)) {
      if (Math.abs(strike - spot) / spot > 0.10) continue; // ±10% of spot
      const cc = charmCallMap.get(strike) ?? 0;
      const pc = charmPutMap.get(strike) ?? 0;
      const netFlow = pc - cc;
      const mag = Math.abs(netFlow);
      if (mag < 1e-8) continue;
      const g = gexMap.get(strike) ?? { call_oi: 0, put_oi: 0, call_gex: 0, put_gex: 0, strike };
      charmStrikes.push({
        strike,
        call_charm: cc,
        put_charm: pc,
        net_dealer_flow: netFlow,
        direction: netFlow > 1e-6 ? "bullish" : netFlow < -1e-6 ? "bearish" : "neutral",
        magnitude: mag,
        call_oi: g.call_oi,
        put_oi: g.put_oi,
        net_gex: g.call_gex + g.put_gex,
        vanna_net: vannaMap.get(strike) ?? 0,
        tex: texMap.get(strike) ?? 0,
      });
    }

    // Sort by magnitude, take top N above and below spot
    charmStrikes.sort((a, b) => b.magnitude - a.magnitude);
    const topCharm = charmStrikes.slice(0, topN * 3)
      .sort((a, b) => b.strike - a.strike); // sort high → low for display

    // Net charm direction from all strikes
    const netCharmFlow = charmStrikes.reduce((s, c) => s + c.net_dealer_flow, 0);
    const charmDirection: "bullish" | "bearish" | "neutral" =
      netCharmFlow > 0 ? "bullish" : netCharmFlow < 0 ? "bearish" : "neutral";

    // Magnitudes for percentile scoring
    const charmMags = charmStrikes.map(c => c.magnitude).sort((a, b) => a - b);

    // ── EM data ───────────────────────────────────────────────────────────────
    const em1d     = emRaw.moves?.["1d"]?.move_pts ?? 0;
    const em1d_up  = emRaw.moves?.["1d"]?.upper ?? spot + em1d;
    const em1d_dn  = emRaw.moves?.["1d"]?.lower ?? spot - em1d;
    const atm_iv   = emRaw.atm_iv ?? 0;

    // Overnight EM estimate: options typically price overnight as ~40–50% of daily range
    // (17h overnight vs 6.5h RTH, but vol is compressed overnight)
    const em_overnight = em1d * 0.45;

    // ── zero_dte summary ──────────────────────────────────────────────────────
    const zdteAvailable = zdteRaw != null;
    const zdteCharmNote   = zdteRaw?.charm_note ?? null;
    const zdteVannaNote   = zdteRaw?.vanna_note ?? null;
    const zdteCharmDir    = zdteRaw?.charm_direction ?? null;
    const zdteVannaDir    = zdteRaw?.vanna_direction ?? null;
    const zdteAtmIv       = zdteRaw?.atm_iv ?? null;
    const zdteEmLow       = zdteRaw?.range_1s_low ?? null;
    const zdteEmHigh      = zdteRaw?.range_1s_high ?? null;
    const zdtePcSentiment = zdteRaw?.pc_sentiment ?? null;
    const zdteCharmSum    = zdteRaw?.charm_sum ?? null;
    const zdteVannaSum    = zdteRaw?.vanna_sum ?? null;

    // ── Bias ─────────────────────────────────────────────────────────────────
    const biasDirection  = biasRaw?.bias?.direction ?? null;
    const biasConviction = biasRaw?.bias?.conviction ?? null;
    const biasNarrative  = biasRaw?.bias?.narrative ?? null;
    const biasSizeRule   = biasRaw?.bias?.size_rule ?? null;

    // ── Macro liquidity ───────────────────────────────────────────────────────
    const liquidityRegime = biasRaw?.macro?.reserves_rrp?.liquidity_regime ?? null;
    const liquidityNote   = biasRaw?.macro?.reserves_rrp?.liquidity_note ?? null;

    // ── Final enrichment of charm strikes ────────────────────────────────────
    const enrichedCharm = topCharm.map(c => ({
      ...c,
      charmPct:   pctRank(charmMags, c.magnitude),
      distPct:    ((c.strike - spot) / spot) * 100,
      aboveSpot:  c.strike > spot,
      nearEm1d:   Math.abs(c.strike - em1d_up) / spot < 0.012 || Math.abs(c.strike - em1d_dn) / spot < 0.012,
      isTexPin:   c.strike === texPinStrike,
    }));

    return NextResponse.json({
      ticker,
      spot,
      // GEX regime
      positive_gamma:   gexRaw.positive_gamma,
      gamma_env:        gexRaw.gamma_env,
      vol_trigger:      gexRaw.vol_trigger,
      zero_gamma:       zeroGamma ? Math.round(zeroGamma * 100) / 100 : null,
      // Charm
      charm_direction:  charmDirection,
      net_charm_flow:   netCharmFlow,
      // Vanna
      vanna_direction:  vannaDirection,
      net_vanna:        netVanna,
      // TEX pin
      tex_pin_strike:   texPinStrike || null,
      tex_pin_val:      texPinVal,
      // IV / EM
      atm_iv,
      em_1d_pts:        em1d,
      em_1d_upper:      em1d_up,
      em_1d_lower:      em1d_dn,
      em_overnight,
      em_overnight_upper: spot + em_overnight,
      em_overnight_lower: spot - em_overnight,
      // zero_dte
      zdte_available:   zdteAvailable,
      zdte_atm_iv:      zdteAtmIv,
      zdte_em_low:      zdteEmLow,
      zdte_em_high:     zdteEmHigh,
      zdte_pc_sentiment: zdtePcSentiment,
      zdte_charm_note:  zdteCharmNote,
      zdte_vanna_note:  zdteVannaNote,
      zdte_charm_dir:   zdteCharmDir,
      zdte_vanna_dir:   zdteVannaDir,
      zdte_charm_sum:   zdteCharmSum,
      zdte_vanna_sum:   zdteVannaSum,
      // Bias
      bias_direction:   biasDirection,
      bias_conviction:  biasConviction,
      bias_narrative:   biasNarrative,
      bias_size_rule:   biasSizeRule,
      // Macro
      liquidity_regime: liquidityRegime,
      liquidity_note:   liquidityNote,
      // Charm strikes (overnight hedging levels)
      charm_strikes:    enrichedCharm,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
