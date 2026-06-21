"use client";

import type { WallData, YYYWallsData } from "@/app/levels/page";

// ── Rejection trade logic ────────────────────────────────────────────────────
// Philosophy: we hunt TOP TICKS (short at call walls) and BOTTOM TICKS (long at put walls)
// Primary = fade the level, expect rejection. Secondary = break/reclaim trade.

interface TradeSetup {
  dir: "LONG" | "SHORT";
  label: string;
  action: string;
  invalidation: string;
  isPrimary: boolean;
}

function rejectionSetup(w: WallData, positiveGex: boolean): { primary: TradeSetup; secondary: TradeSetup } {
  const { wallType, texHigh, texLow, texLabel, gexPct } = w;
  const strong = gexPct >= 75;

  if (wallType === "call") {
    // TOP TICK — primary = SHORT from below (fade rally at resistance)
    const primary: TradeSetup = {
      dir: "SHORT",
      label: texHigh
        ? positiveGex ? "Hard fade — dealers selling, high TEX crush" : "Squeeze then fade — pin before break"
        : texLow
        ? "Weak fade — low conviction, tight stop" : "Fade — watch for stall candle",
      action: positiveGex
        ? texHigh
          ? `Dealers long gamma, selling aggressively into $${w.strike}. TEX ${gexPct}p GEX = strong pin. Short on stall/wick. Target: put wall or VWAP.`
          : `Dealers long gamma at $${w.strike}, low carry cost. Passive resistance. Short on rejection candle. Target: VWAP. Don't overstay.`
        : texHigh
          ? `−GEX + HIGH TEX = pin magnet before potential squeeze. Short the stall first. Flip to long if bid through with volume.`
          : `−GEX + LOW TEX = weak wall. Short attempt valid but breakout risk is real. Small size, fast stop.`,
      invalidation: `Acceptance above $${w.strike} on volume. GEX flips negative / VEX turns bullish.`,
      isPrimary: true,
    };
    const secondary: TradeSetup = {
      dir: "LONG",
      label: "Reclaim from above = support flip",
      action: `If price trades through $${w.strike} and reclaims from above: call wall is now support. Long on confirmed close above. Target: next call wall up.`,
      invalidation: `Fail to hold above $${w.strike}. Reverts below with volume.`,
      isPrimary: false,
    };
    return { primary, secondary };
  } else {
    // BOTTOM TICK — primary = LONG from above (buy dip at support)
    const primary: TradeSetup = {
      dir: "LONG",
      label: texHigh
        ? positiveGex ? "Strong bounce — concrete slab" : "High-stakes hold — watch closely"
        : texLow
        ? "Weak floor — conditional long only" : "Buy the dip — rejection expected",
      action: positiveGex
        ? texHigh
          ? `Dealers short put, long delta hard at $${w.strike}. HIGH TEX = expensive to let it go. Buy on touch. Target: call wall / VWAP.`
          : `+GEX floor. Dealers defend but low carry — can drift. Long if holds, but no urgency. Target: VWAP.`
        : texHigh
          ? `−GEX + HIGH TEX = pivotal. TEX buffer destroyed on break → panic. Long ONLY if clear hold candle. Stop tight below.`
          : `−GEX + LOW TEX = fragile. Dealers abandon easily. Long conditional on obvious rejection candle only.`,
      invalidation: `Acceptance below $${w.strike}. Volume expands on break. VEX stays bearish.`,
      isPrimary: true,
    };
    const secondary: TradeSetup = {
      dir: "SHORT",
      label: "Break below = short the reclaim",
      action: `If $${w.strike} breaks cleanly: fade any reclaim back to the level. Short on failed reclaim. Target: next put wall down.`,
      invalidation: `Full reclaim of $${w.strike}. Vanna flips bullish. Volume dries on break.`,
      isPrimary: false,
    };
    return { primary, secondary };
  }
}

// ── Rejection quality score label ────────────────────────────────────────────
function rejectionQuality(w: WallData): { label: string; color: string } {
  const s = w.confluenceScore;
  if (s >= 6) return { label: "HIGH PROB", color: "text-green-400" };
  if (s >= 4) return { label: "MODERATE", color: "text-yellow-400" };
  return { label: "LOW PROB", color: "text-muted" };
}

// ── Summary strip ────────────────────────────────────────────────────────────

function SummaryStrip({ d }: { d: YYYWallsData }) {
  const gex = d.positive_gamma;
  const aboveVT = d.spot >= d.vol_trigger;

  return (
    <div className="bg-panel border border-border rounded-lg px-4 py-3 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-x-6 gap-y-2 text-[11px]">
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">Spot</div>
          <div className="text-white font-mono font-semibold text-base">${d.spot.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">Regime</div>
          <div className={`font-semibold text-sm ${gex ? "text-accent" : "text-yellow-400"}`}>
            {gex ? "+GEX" : "−GEX"}
          </div>
          <div className="text-muted text-[10px]">{d.gamma_env}</div>
        </div>
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">Vol Trigger</div>
          <div className="text-white font-mono">${d.vol_trigger}</div>
          <div className={`text-[10px] ${aboveVT ? "text-green-400" : "text-red-400"}`}>
            {aboveVT ? "above — pinning" : "below — trending"}
          </div>
        </div>
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">Zero Gamma</div>
          <div className="text-purple-400 font-mono">
            {d.zero_gamma != null ? `$${d.zero_gamma.toFixed(2)}` : "—"}
          </div>
        </div>
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">Call Wall</div>
          <div className="text-green-400 font-mono">${d.call_wall}</div>
          {d.top_call_wall && d.top_call_wall !== d.call_wall && (
            <div className="text-green-400/50 text-[10px] font-mono">top: ${d.top_call_wall}</div>
          )}
        </div>
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">Put Wall</div>
          <div className="text-red-400 font-mono">${d.put_wall}</div>
          {d.top_put_wall && d.top_put_wall !== d.put_wall && (
            <div className="text-red-400/50 text-[10px] font-mono">top: ${d.top_put_wall}</div>
          )}
        </div>
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">1d Range</div>
          <div className="text-white font-mono text-[10px]">
            ${d.em_1d_lower.toFixed(0)}–${d.em_1d_upper.toFixed(0)}
          </div>
          <div className="text-muted text-[10px]">±{d.em_1d_pts.toFixed(1)}</div>
        </div>
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">PCR / IV</div>
          <div className={`font-mono text-[11px] ${
            d.pcr == null ? "text-muted"
            : d.pcr > 1.2 ? "text-red-400"
            : d.pcr < 0.8 ? "text-green-400"
            : "text-label"
          }`}>{d.pcr != null ? d.pcr.toFixed(2) : "—"} pcr</div>
          {d.atm_iv > 0 && <div className="text-muted text-[10px]">IV {d.atm_iv.toFixed(1)}%</div>}
        </div>
      </div>
    </div>
  );
}

// ── Confluence badges (rejection-focused labels) ──────────────────────────────

function RejectionBadges({ w }: { w: WallData }) {
  const { label, color } = rejectionQuality(w);
  const isCall = w.wallType === "call";

  // VEX aligns with rejection: bearish vex at call wall, bullish vex at put wall
  const vexAligned = isCall
    ? w.vexSign === "bearish"
    : w.vexSign === "bullish";

  // DEX confirms rejection: from below at call wall, from above at put wall
  const dexConfirms = isCall ? w.dexConfirmsFromBelow : w.dexConfirmsFromAbove;

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className={`text-[10px] font-semibold font-mono border rounded px-1.5 py-0.5 ${color} border-current/30`}>
        {label} {w.confluenceScore}/7
      </span>

      <span className={`text-[10px] px-2 py-0.5 rounded border ${
        w.gexPct >= 90 ? "border-green-400/40 bg-green-400/10 text-green-400"
        : w.gexPct >= 75 ? "border-accent/40 bg-accent/10 text-accent"
        : "border-border text-muted bg-surface"
      }`}>
        GEX {w.gexPct}p
      </span>

      <span className={`text-[10px] px-2 py-0.5 rounded border ${
        w.texLabel === "HIGH" ? "border-orange-400/40 bg-orange-400/10 text-orange-400"
        : w.texLabel === "LOW" ? "border-border text-muted/60 bg-surface"
        : "border-yellow-400/30 bg-yellow-400/10 text-yellow-400"
      }`}>
        TEX {w.texLabel} {w.texPct > 0 ? `(${w.texPct}p)` : ""}
      </span>

      {dexConfirms && (
        <span className="text-[10px] px-2 py-0.5 rounded border border-green-400/40 bg-green-400/10 text-green-400">
          DEX confirms {isCall ? "↑" : "↓"}
        </span>
      )}

      {vexAligned && (
        <span className={`text-[10px] px-2 py-0.5 rounded border ${
          isCall ? "border-red-400/30 bg-red-400/10 text-red-400"
                 : "border-green-400/30 bg-green-400/10 text-green-400"
        }`}>
          VEX {w.vexSign}
        </span>
      )}

      {w.nearEm1d && (
        <span className="text-[10px] px-2 py-0.5 rounded border border-purple-400/30 bg-purple-400/10 text-purple-400">
          EM 1d edge
        </span>
      )}
      {w.nearEm1w && (
        <span className="text-[10px] px-2 py-0.5 rounded border border-purple-400/30 bg-purple-400/10 text-purple-400">
          EM 1w edge
        </span>
      )}
    </div>
  );
}

// ── Wall card ────────────────────────────────────────────────────────────────

function WallCard({ w, positiveGex }: { w: WallData; positiveGex: boolean }) {
  const isCall = w.wallType === "call";
  const { primary, secondary } = rejectionSetup(w, positiveGex);

  const gexVal = isCall ? w.call_gex : Math.abs(w.put_gex);
  const gexDisplay = gexVal >= 1e9
    ? `${(gexVal / 1e9).toFixed(2)}B`
    : gexVal >= 1e6
    ? `${(gexVal / 1e6).toFixed(1)}M`
    : gexVal.toFixed(0);

  return (
    <div className={`bg-panel border rounded-lg overflow-hidden ${
      isCall ? "border-red-400/25" : "border-green-400/25"
    }`}>
      {/* Header */}
      <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 ${
        isCall ? "bg-red-400/5" : "bg-green-400/5"
      }`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded tracking-wider ${
            isCall ? "bg-red-400/15 text-red-400" : "bg-green-400/15 text-green-400"
          }`}>
            {isCall ? "▼ TOP TICK — SELL" : "▲ BOTTOM TICK — BUY"}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
            positiveGex ? "border-accent/30 text-accent" : "border-yellow-400/30 text-yellow-400"
          }`}>
            {positiveGex ? "+GEX" : "−GEX"}
          </span>
          <span className="text-muted text-[10px] hidden sm:inline">{w.archetype}</span>
        </div>
        <span className={`text-[11px] font-mono ${w.aboveSpot ? "text-red-400/80" : "text-green-400/80"}`}>
          {w.distFromSpotPct >= 0 ? "+" : ""}{w.distFromSpotPct.toFixed(2)}%
        </span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Strike + metrics */}
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-3xl font-semibold font-mono text-white">${w.strike}</span>
          <div className="flex gap-4 text-[11px] font-mono text-muted">
            <span>GEX <span className={isCall ? "text-red-400" : "text-green-400"}>{isCall ? "" : "−"}{gexDisplay}</span></span>
            <span>DEX <span className={w.net_dex >= 0 ? "text-green-400" : "text-red-400"}>{w.net_dex >= 0 ? "+" : ""}{w.net_dex.toFixed(1)}</span></span>
            <span>OI <span className="text-label">C:{w.call_oi.toLocaleString()} P:{w.put_oi.toLocaleString()}</span></span>
          </div>
        </div>

        {/* Rejection badges */}
        <RejectionBadges w={w} />

        {/* Trade cards: primary first (rejection), secondary smaller */}
        <div className="space-y-2">
          {/* Primary: rejection trade */}
          <div className={`rounded border p-3 ${
            primary.dir === "LONG"
              ? "border-green-400/40 bg-green-400/8"
              : "border-red-400/40 bg-red-400/8"
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-bold tracking-wider ${
                primary.dir === "LONG" ? "text-green-400" : "text-red-400"
              }`}>{primary.dir}</span>
              <span className="text-[10px] font-semibold text-white">{primary.label}</span>
              <span className="ml-auto text-[9px] text-accent/70 uppercase tracking-widest">PRIMARY</span>
            </div>
            <div className="text-muted text-[11px] leading-relaxed mb-2">{primary.action}</div>
            <div className="text-[10px] border-t border-border/40 pt-1.5">
              <span className="text-label">Inv: </span><span className="text-muted">{primary.invalidation}</span>
            </div>
          </div>

          {/* Secondary: break/reclaim trade */}
          <div className="rounded border border-border/30 bg-surface/30 px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold ${
                secondary.dir === "LONG" ? "text-green-400/60" : "text-red-400/60"
              }`}>{secondary.dir}</span>
              <span className="text-[10px] text-muted">{secondary.label}</span>
              <span className="ml-auto text-[9px] text-muted/50 uppercase tracking-widest">SECONDARY</span>
            </div>
            <div className="text-muted/70 text-[10px] leading-relaxed">{secondary.action}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  data: YYYWallsData | null;
  loading: boolean;
}

export default function KeyLevels({ data, loading }: Props) {
  if (loading) {
    return (
      <div className="bg-panel border border-border rounded-lg p-12 flex items-center justify-center">
        <span className="text-muted animate-pulse text-xs">Computing levels from live YYY data...</span>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="bg-panel border border-border rounded-lg p-12 flex items-center justify-center">
        <span className="text-muted text-xs">Select ticker to load levels.</span>
      </div>
    );
  }

  const spot = data.spot;
  const walls = data.walls;

  return (
    <div className="space-y-3">
      <SummaryStrip d={data} />

      {walls.map((w, i) => {
        const prevAboveSpot = i > 0 && walls[i - 1].strike > spot;
        const thisAboveSpot = w.strike > spot;
        const showSpotLine = prevAboveSpot && !thisAboveSpot;
        return (
          <div key={`${w.wallType}-${w.strike}`}>
            {showSpotLine && (
              <div className="flex items-center gap-2 py-2 px-1">
                <div className="flex-1 border-t border-dashed border-accent/50" />
                <span className="text-accent text-[11px] tracking-widest font-semibold whitespace-nowrap">
                  ▶ SPOT ${spot.toFixed(2)}
                </span>
                <div className="flex-1 border-t border-dashed border-accent/50" />
              </div>
            )}
            <WallCard w={w} positiveGex={data.positive_gamma} />
          </div>
        );
      })}

      {walls.length > 0 && walls[walls.length - 1].strike > spot && (
        <div className="flex items-center gap-2 py-2 px-1">
          <div className="flex-1 border-t border-dashed border-accent/50" />
          <span className="text-accent text-[11px] tracking-widest font-semibold whitespace-nowrap">
            ▶ SPOT ${spot.toFixed(2)}
          </span>
          <div className="flex-1 border-t border-dashed border-accent/50" />
        </div>
      )}

      {data.zero_gamma != null && (
        <div className="flex items-center gap-2 text-[10px] text-purple-400 px-1 mt-1">
          <div className="flex-1 border-t border-dashed border-purple-400/30" />
          <span>Zero Gamma ${data.zero_gamma.toFixed(2)}</span>
          <div className="flex-1 border-t border-dashed border-purple-400/30" />
        </div>
      )}

      {walls.length === 0 && (
        <div className="bg-panel border border-border rounded-lg p-8 text-center text-muted text-xs">
          No walls computed.
        </div>
      )}
    </div>
  );
}
