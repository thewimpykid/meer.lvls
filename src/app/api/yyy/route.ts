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

function percentileVal(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function pctRank(sorted: number[], v: number): number {
  // percentile rank of v in sorted array
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m; }
  return sorted.length > 0 ? (lo / sorted.length) * 100 : 0;
}

export async function GET(req: Request) {
  const ticker = new URL(req.url).searchParams.get("ticker") ?? "QQQ";
  const topN   = parseInt(new URL(req.url).searchParams.get("n") ?? "5");
  if (!KEY) return NextResponse.json({ error: "YYY_API_KEY not set" }, { status: 500 });

  try {
    // ── Fetch all raw data in parallel ────────────────────────────────────────
    const [gexRaw, dexRaw, thetaRaw, vannaRaw, emRaw] = await Promise.all([
      yyy(`/gex?ticker=${ticker}`),
      yyy(`/dex_ladder?ticker=${ticker}`),
      yyy(`/theta?ticker=${ticker}`),
      yyy(`/vanna_surface?ticker=${ticker}`),
      yyy(`/expected_move?ticker=${ticker}`),
    ]);

    const spot: number = gexRaw.spot;

    // ── Build per-strike maps ─────────────────────────────────────────────────

    // GEX: call_gex > 0, put_gex < 0
    interface GexRow { strike: number; call_gex: number; put_gex: number; call_oi: number; put_oi: number }
    const gexStrikes: GexRow[] = gexRaw.strike_data ?? [];

    const gexMap = new Map<number, GexRow>();
    for (const r of gexStrikes) gexMap.set(r.strike, r);

    // DEX map
    interface DexRow { strike: number; net_dex: number; call_dex: number; put_dex: number }
    const dexStrikes: DexRow[] = dexRaw.ladder ?? [];
    const dexMap = new Map<number, DexRow>();
    for (const r of dexStrikes) dexMap.set(r.strike, r);

    // TEX map: from theta rows, each row has { strike, total }
    // total is negative (theta burn) — use |total| as magnitude
    interface ThetaRow { strike: number; total: number }
    const thetaRows: ThetaRow[] = thetaRaw.rows ?? [];
    const texMap = new Map<number, number>();
    for (const r of thetaRows) texMap.set(r.strike, Math.abs(r.total));

    // Vanna map: aggregate net vanna by strike across all DTEs
    interface VannaPoint { strike: number; dte: number; vanna: number; is_put: boolean }
    const vannaPoints: VannaPoint[] = vannaRaw.points ?? [];
    const vannaSumMap = new Map<number, number>();
    for (const p of vannaPoints) {
      vannaSumMap.set(p.strike, (vannaSumMap.get(p.strike) ?? 0) + p.vanna);
    }

    // ── Expected move / EM boundaries ────────────────────────────────────────
    const em1d     = emRaw.moves?.["1d"]?.move_pts ?? 0;
    const em1d_up  = emRaw.moves?.["1d"]?.upper     ?? spot + em1d;
    const em1d_dn  = emRaw.moves?.["1d"]?.lower     ?? spot - em1d;
    const em1w_up  = emRaw.moves?.["1w"]?.upper     ?? null;
    const em1w_dn  = emRaw.moves?.["1w"]?.lower     ?? null;
    const atm_iv   = emRaw.atm_iv ?? 0;
    const iv_pct   = emRaw.iv_percentile ?? null;

    // ── Identify call and put walls (by highest GEX magnitude) ───────────────
    // Only look within ±20% of spot
    const nearStrikes = gexStrikes.filter(r => Math.abs(r.strike - spot) / spot <= 0.20);

    // Call walls: strikes with highest call_gex (above spot preferred, but include all)
    const callCandidates = [...nearStrikes]
      .sort((a, b) => b.call_gex - a.call_gex)
      .slice(0, topN * 3); // over-fetch then pick spread

    // Put walls: strikes with highest |put_gex|
    const putCandidates = [...nearStrikes]
      .sort((a, b) => Math.abs(b.put_gex) - Math.abs(a.put_gex))
      .slice(0, topN * 3);

    // Deduplicate and pick top N from each side, prioritizing above/below spot
    const callWallStrikes = new Set<number>();
    const putWallStrikes  = new Set<number>();

    // Prefer strikes above spot for call walls
    for (const r of callCandidates.filter(r => r.strike > spot)) {
      if (callWallStrikes.size >= topN) break;
      callWallStrikes.add(r.strike);
    }
    // Fill remaining from below if needed
    for (const r of callCandidates) {
      if (callWallStrikes.size >= topN) break;
      callWallStrikes.add(r.strike);
    }

    // Prefer strikes below spot for put walls
    for (const r of putCandidates.filter(r => r.strike < spot)) {
      if (putWallStrikes.size >= topN) break;
      putWallStrikes.add(r.strike);
    }
    for (const r of putCandidates) {
      if (putWallStrikes.size >= topN) break;
      putWallStrikes.add(r.strike);
    }

    // Remove overlap (strike can't be both)
    for (const s of Array.from(callWallStrikes)) {
      if (putWallStrikes.has(s)) {
        const g = gexMap.get(s)!;
        if (Math.abs(g.put_gex) > g.call_gex) { callWallStrikes.delete(s); }
        else { putWallStrikes.delete(s); }
      }
    }

    // ── Zero gamma level: cumulative net_gex crosses zero top→down ───────────
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

    // ── Build TEX / DEX percentile distributions ──────────────────────────────
    const allTexVals = Array.from(texMap.values()).filter(v => v > 0).sort((a, b) => a - b);
    const allDexVals = Array.from(dexMap.values()).map(r => Math.abs(r.net_dex)).sort((a, b) => a - b);
    const allGexCallVals = gexStrikes.map(r => r.call_gex).sort((a, b) => a - b);
    const allGexPutVals  = gexStrikes.map(r => Math.abs(r.put_gex)).sort((a, b) => a - b);

    const texP75 = percentileVal(allTexVals, 75);
    const texP40 = percentileVal(allTexVals, 40);

    // ── Enrich each wall ──────────────────────────────────────────────────────
    const enrichWall = (strike: number, wallType: "call" | "put") => {
      const g = gexMap.get(strike) ?? { strike, call_gex: 0, put_gex: 0, call_oi: 0, put_oi: 0 };
      const d = dexMap.get(strike) ?? { strike, net_dex: 0, call_dex: 0, put_dex: 0 };
      const tex    = texMap.get(strike) ?? 0;
      const vanna  = vannaSumMap.get(strike) ?? 0;

      // GEX magnitude and rank
      const wallGex = wallType === "call" ? g.call_gex : Math.abs(g.put_gex);
      const refDist = wallType === "call" ? allGexCallVals : allGexPutVals;
      const gexPct  = pctRank(refDist, wallGex);
      const texPct  = tex > 0 ? pctRank(allTexVals, tex) : 0;
      const texHigh = tex >= texP75;
      const texLow  = tex <= texP40;
      const texLabel: "HIGH" | "MED" | "LOW" = texHigh ? "HIGH" : texLow ? "LOW" : "MED";

      // DEX confirmation
      const dexConfirmsFromBelow = d.net_dex > 0;   // approach from below + dex+ = reject
      const dexConfirmsFromAbove = d.net_dex < 0;   // approach from above + dex- = reject

      // Vanna sign
      const vexSign: "bullish" | "bearish" | "neutral" = vanna > 0.001 ? "bullish" : vanna < -0.001 ? "bearish" : "neutral";

      // EM alignment
      const distToEm1Up = Math.abs(strike - em1d_up) / spot;
      const distToEm1Dn = Math.abs(strike - em1d_dn) / spot;
      const nearEm1d = distToEm1Up < 0.012 || distToEm1Dn < 0.012;
      const nearEm1w = em1w_up && em1w_dn
        ? Math.abs(strike - em1w_up!) / spot < 0.012 || Math.abs(strike - em1w_dn!) / spot < 0.012
        : false;

      // reem_lvls archetype from matrix (GEX × wall_type × DEX × TEX)
      const gexSign = (gexRaw.positive_gamma as boolean) ? "positive" : "negative";
      let archetype = "";
      if (gexSign === "positive") {
        if (wallType === "call") {
          archetype = texHigh
            ? "Costly Resistance — high burn, dealers may unwind if stalls"
            : "Low Friction Ceiling — small daily bleed, passive resistance";
        } else {
          archetype = texHigh
            ? "Concrete Slab — dealers pay high insurance, want rebound fast"
            : "Soft Floor — minimal carry cost, can drift without urgency";
        }
      } else {
        if (wallType === "call") {
          archetype = texHigh
            ? "Magnetic Pin → Gamma Squeeze if breached — peak decay incentive"
            : "Weak Magnet / Breakout Trigger — minimal stickiness";
        } else {
          archetype = texHigh
            ? "High-Stakes Pivot → Panic Selling if lost — theta buffer destroyed"
            : "Fragile Pivot / Fast Pass-Through — dealers abandon easily";
        }
      }

      // Confluence score (0–7)
      let confluenceScore = 0;
      if (gexPct >= 75) confluenceScore++;
      if (gexPct >= 90) confluenceScore++;
      if (dexConfirmsFromBelow || dexConfirmsFromAbove) confluenceScore++;
      if (texHigh) confluenceScore++;
      if (nearEm1d || nearEm1w) confluenceScore++;
      if (Math.abs(vanna) > 0.001) confluenceScore++;
      if (gexPct >= 50 && texHigh) confluenceScore++;  // corroborating

      const distFromSpot = ((strike - spot) / spot) * 100;
      const aboveSpot = strike > spot;

      return {
        strike,
        wallType,
        aboveSpot,
        distFromSpotPct: distFromSpot,
        // GEX
        call_gex:   g.call_gex,
        put_gex:    g.put_gex,
        net_gex:    g.call_gex + g.put_gex,
        call_oi:    g.call_oi,
        put_oi:     g.put_oi,
        gexPct:     Math.round(gexPct),
        // DEX
        net_dex:    d.net_dex,
        call_dex:   d.call_dex,
        put_dex:    d.put_dex,
        dexConfirmsFromBelow,
        dexConfirmsFromAbove,
        // TEX
        tex_abs:    tex,
        texPct:     Math.round(texPct),
        texLabel,
        texHigh,
        texLow,
        // Vanna
        vanna_net:  vanna,
        vexSign,
        // Archetype
        archetype,
        // EM
        nearEm1d,
        nearEm1w: !!nearEm1w,
        // Confluence
        confluenceScore,
      };
    };

    const callWalls = Array.from(callWallStrikes)
      .map(s => enrichWall(s, "call"))
      .sort((a, b) => b.strike - a.strike);

    const putWalls = Array.from(putWallStrikes)
      .map(s => enrichWall(s, "put"))
      .sort((a, b) => b.strike - a.strike);

    // Merge and sort high → low
    const walls = [...callWalls, ...putWalls].sort((a, b) => b.strike - a.strike);

    // ── Global summary ────────────────────────────────────────────────────────
    const totalNetGex = gexStrikes.reduce((s, r) => s + r.call_gex + r.put_gex, 0);
    const totalCallOi = gexStrikes.reduce((s, r) => s + r.call_oi, 0);
    const totalPutOi  = gexStrikes.reduce((s, r) => s + r.put_oi, 0);
    const pcr = totalCallOi > 0 ? totalPutOi / totalCallOi : null;

    // Top call/put wall by magnitude
    const topCallWall = callWalls[0]?.strike ?? null;
    const topPutWall  = putWalls[putWalls.length - 1]?.strike ?? null;

    return NextResponse.json({
      ticker,
      spot,
      // Regime
      positive_gamma:  gexRaw.positive_gamma,
      gamma_env:       gexRaw.gamma_env,
      vol_trigger:     gexRaw.vol_trigger,
      total_net_gex:   totalNetGex,
      net_gex_bn:      gexRaw.net_gex_bn,
      // Walls (from GEX)
      call_wall:       gexRaw.call_wall,       // YYY's own call wall
      put_wall:        gexRaw.put_wall,
      top_call_wall:   topCallWall,             // computed
      top_put_wall:    topPutWall,
      zero_gamma:      zeroGamma ? Math.round(zeroGamma * 100) / 100 : null,
      max_pain:        gexRaw.max_pain,
      // IV / EM
      atm_iv,
      iv_percentile:   iv_pct,
      em_1d_pts:       em1d,
      em_1d_upper:     em1d_up,
      em_1d_lower:     em1d_dn,
      em_1w_upper:     em1w_up,
      em_1w_lower:     em1w_dn,
      // PCR
      pcr,
      total_call_oi:   totalCallOi,
      total_put_oi:    totalPutOi,
      // Theta summary
      total_tex:       thetaRaw.total_tex ?? null,
      // Computed walls
      walls,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
