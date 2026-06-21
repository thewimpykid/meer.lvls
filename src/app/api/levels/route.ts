import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { bsGreeks, impliedVol } from "@/lib/bs";

export const dynamic = "force-dynamic";

interface RawOption {
  date: string;
  expiration: string;
  side: string;
  strike: number;
  dte: number;
  bid: number;
  ask: number;
  mid: number;
  volume: number;
  open_interest: number;
  underlying_price: number;
}

interface StrikeAgg {
  strike: number;
  call_oi: number;
  call_vol: number;
  put_oi: number;
  put_vol: number;
  call_gex: number;   // positive: call GEX contribution
  put_gex: number;    // positive magnitude: put GEX contribution
  net_gex: number;    // call_gex - put_gex
  net_dex: number;    // net delta exposure ($)
  net_vex: number;    // net vanna exposure
  net_tex: number;    // net theta exposure ($/day)
  net_chex: number;   // net charm exposure
  net_vega: number;   // net vega exposure
  iv_call: number | null;
  iv_put: number | null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  try {
    const db = getDb();

    const rows = db
      .prepare(
        `SELECT date, expiration, side, strike, dte,
                bid, ask, mid, volume, open_interest, underlying_price
         FROM options_chain WHERE date = ? ORDER BY strike ASC`
      )
      .all(date) as unknown as RawOption[];

    if (rows.length === 0)
      return NextResponse.json({ error: "no data for date" }, { status: 404 });

    const rate = db
      .prepare("SELECT ratio, nq_close FROM conversion_rates WHERE date = ?")
      .get(date) as unknown as { ratio: number; nq_close: number } | undefined;

    const spot = rows[0].underlying_price;
    const dte = rows[0].dte;
    const expiry = rows[0].expiration;
    const T = dte / 365;
    const ratio = rate?.ratio ?? 1;

    // ── build per-strike aggregates ──────────────────────────────────────────
    const strikeMap = new Map<number, StrikeAgg>();

    for (const row of rows) {
      const { strike: K, underlying_price: S, mid, volume, open_interest: oi, side } = row;
      const isCall = side === "call";

      const iv = impliedVol(mid, S, K, T, isCall);
      const g = iv ? bsGreeks(S, K, T, iv, isCall) : null;

      const gamma = g?.gamma ?? 0;
      const delta = g?.delta ?? 0;
      const vanna = g?.vanna ?? 0;
      const theta = g?.theta ?? 0;
      const charm = g?.charm ?? 0;
      const vega = g?.vega ?? 0;

      // GEX: gamma * OI * 100 * S² * 0.01  ($ per 1% move)
      const gexMag = gamma * oi * 100 * S * S * 0.01;
      const dex = delta * oi * 100 * S;
      const vex = vanna * oi * 100;
      const tex = theta * oi * 100;
      const chex = charm * oi * 100;
      const vegaEx = vega * oi * 100;

      if (!strikeMap.has(K)) {
        strikeMap.set(K, {
          strike: K, call_oi: 0, call_vol: 0, put_oi: 0, put_vol: 0,
          call_gex: 0, put_gex: 0, net_gex: 0, net_dex: 0,
          net_vex: 0, net_tex: 0, net_chex: 0, net_vega: 0,
          iv_call: null, iv_put: null,
        });
      }

      const agg = strikeMap.get(K)!;

      if (isCall) {
        agg.call_oi += oi;
        agg.call_vol += volume;
        agg.call_gex += gexMag;
        if (iv) agg.iv_call = iv;
        agg.net_gex += gexMag;    // calls = positive GEX
      } else {
        agg.put_oi += oi;
        agg.put_vol += volume;
        agg.put_gex += gexMag;
        if (iv) agg.iv_put = iv;
        agg.net_gex -= gexMag;    // puts = negative GEX
      }

      agg.net_dex += dex;          // put delta already negative
      agg.net_vex += vex;
      agg.net_tex += tex;
      agg.net_chex += chex;
      agg.net_vega += vegaEx;
    }

    const profile = Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike);

    // ── summary ──────────────────────────────────────────────────────────────
    const totalGex  = profile.reduce((s, r) => s + r.net_gex,  0);
    const totalDex  = profile.reduce((s, r) => s + r.net_dex,  0);
    const totalVex  = profile.reduce((s, r) => s + r.net_vex,  0);
    const totalTex  = profile.reduce((s, r) => s + r.net_tex,  0);
    const totalCallOi  = profile.reduce((s, r) => s + r.call_oi,  0);
    const totalPutOi   = profile.reduce((s, r) => s + r.put_oi,   0);
    const totalCallVol = profile.reduce((s, r) => s + r.call_vol, 0);
    const totalPutVol  = profile.reduce((s, r) => s + r.put_vol,  0);

    // ATM IV: nearest strike to spot
    const atmRow = profile.reduce((best, s) =>
      Math.abs(s.strike - spot) < Math.abs(best.strike - spot) ? s : best
    );
    const atmIv = atmRow.iv_call ?? atmRow.iv_put ?? null;

    // Expected Move
    let em1sd = 0;
    if (dte > 0 && atmIv) {
      em1sd = spot * atmIv * Math.sqrt(T);
    } else if (dte === 0) {
      // 0DTE: use ATM straddle mid
      const nearRows = rows.filter((r) => Math.abs(r.strike - spot) / spot < 0.03);
      const atcCall = nearRows.filter((r) => r.side === "call").sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0];
      const atmPut  = nearRows.filter((r) => r.side === "put").sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0];
      em1sd = (atcCall?.mid ?? 0) + (atmPut?.mid ?? 0);
    }
    const em2sd = em1sd * 2;

    // PCR
    const pcrOi  = totalCallOi  > 0 ? totalPutOi  / totalCallOi  : null;
    const pcrVol = totalCallVol > 0 ? totalPutVol / totalCallVol : null;

    // Gamma Flip: running cumulative GEX high→low, find zero crossing
    const descProfile = [...profile].sort((a, b) => b.strike - a.strike);
    let cumGex = 0;
    let gammaFlip: number | null = null;
    for (let i = 0; i < descProfile.length; i++) {
      const prev = cumGex;
      cumGex += descProfile[i].net_gex;
      if (i > 0 && prev !== 0 && prev * cumGex < 0) {
        // Linear interpolation between strikes
        const s0 = descProfile[i - 1].strike;
        const s1 = descProfile[i].strike;
        gammaFlip = s0 + (s1 - s0) * Math.abs(prev) / (Math.abs(prev) + Math.abs(cumGex));
        break;
      }
    }
    // Fallback: strike with smallest |net_gex| near ATM
    if (gammaFlip === null) {
      const atmNear = profile
        .filter((s) => Math.abs(s.strike - spot) / spot < 0.15)
        .sort((a, b) => Math.abs(a.net_gex) - Math.abs(b.net_gex));
      gammaFlip = atmNear[0]?.strike ?? spot;
    }

    // Max Pain
    let maxPain = spot, minPayout = Infinity;
    for (const K of profile.map((s) => s.strike)) {
      let payout = 0;
      for (const s of profile) {
        payout += s.call_oi * Math.max(K - s.strike, 0) * 100;
        payout += s.put_oi  * Math.max(s.strike - K, 0) * 100;
      }
      if (payout < minPayout) { minPayout = payout; maxPain = K; }
    }

    // Walls: within ±25% of spot for relevance
    const near = profile.filter((s) => Math.abs(s.strike - spot) / spot <= 0.25);

    // Call walls: top positive net_gex (call-dominant strikes above spot = resistance)
    const callWalls = near
      .filter((s) => s.net_gex > 0)
      .sort((a, b) => b.net_gex - a.net_gex)
      .slice(0, 5);

    // Put walls: top negative net_gex (put-dominant strikes below spot = floor)
    const putWalls = near
      .filter((s) => s.net_gex < 0)
      .sort((a, b) => a.net_gex - b.net_gex)
      .slice(0, 5);

    // Tag profile entries
    const cwSet = new Set(callWalls.map((w) => w.strike));
    const pwSet = new Set(putWalls.map((w) => w.strike));
    const taggedProfile = near.map((s) => {
      const tags: string[] = [];
      if (cwSet.has(s.strike)) tags.push("call_wall");
      if (pwSet.has(s.strike)) tags.push("put_wall");
      if (gammaFlip && Math.abs(s.strike - gammaFlip) / spot < 0.004) tags.push("flip");
      if (s.strike === maxPain) tags.push("max_pain");
      if (Math.abs(s.strike - spot) / spot < 0.004) tags.push("atm");
      return { ...s, tags };
    });

    return NextResponse.json({
      date, expiry, dte, spot,
      ratio,
      nq_close: rate?.nq_close ?? null,
      atm_iv: atmIv,
      regime: totalGex >= 0 ? "positive" : "negative",
      net_gex: totalGex,
      net_dex: totalDex,
      net_vex: totalVex,
      net_tex: totalTex,
      pcr_oi:  pcrOi,
      pcr_vol: pcrVol,
      em_1sd:  em1sd,
      em_2sd:  em2sd,
      gamma_flip: gammaFlip,
      max_pain:   maxPain,
      call_wall:  callWalls[0] ?? null,
      put_wall:   putWalls[0]  ?? null,
      secondary_call_walls: callWalls.slice(1),
      secondary_put_walls:  putWalls.slice(1),
      profile: taggedProfile,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
