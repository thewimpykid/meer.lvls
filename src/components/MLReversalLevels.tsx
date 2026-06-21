"use client";

import React, { useState } from "react";
import type { MLReversalData, Zone, StrikeScore } from "@/app/api/ml-reversal/route";

// ── Confidence bar ────────────────────────────────────────────────────────────
function ConfBar({ value, color = "bg-accent" }: { value: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-mono text-label w-7 text-right">{value}%</span>
    </div>
  );
}

// ── Signal breakdown row ──────────────────────────────────────────────────────
function SignalRow({ label, value, weight }: { label: string; value: number; weight: number }) {
  const pct = Math.round(weight * 100);
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="text-muted w-20">{label}</span>
      <div className="flex-1 h-1 bg-surface rounded-full">
        <div className="h-full bg-accent/60 rounded-full" style={{ width: `${value}%` }} />
      </div>
      <span className="font-mono text-label/70 w-6 text-right">{value}</span>
      <span className="text-muted/40 w-8 text-right">w={pct}%</span>
    </div>
  );
}

const SIGNAL_META: { key: keyof StrikeScore["signals"]; label: string; weight: number }[] = [
  { key: "iv_skew_abs",  label: "IV Skew",    weight: 0.364 },
  { key: "atm_prox",     label: "ATM Prox",   weight: 0.291 },
  { key: "gex",          label: "GEX",         weight: 0.081 },
  { key: "vomma_proxy",  label: "Vomma",       weight: 0.050 },
  { key: "iv_kink",      label: "IV Kink",     weight: 0.041 },
  { key: "cp_ratio",     label: "C/P OI",      weight: 0.033 },
  { key: "oi_conc",      label: "OI Conc",     weight: 0.030 },
  { key: "dex",          label: "DEX",          weight: 0.022 },
  { key: "vanna",        label: "Vanna",        weight: 0.017 },
];

// ── Zone card ─────────────────────────────────────────────────────────────────
function ZoneCard({ zone, rank, spot, positiveGex }: {
  zone: Zone; rank: number; spot: number; positiveGex: boolean
}) {
  const above = zone.centroid > spot;
  const isResist = above;
  const prob = Math.round(zone.prob * 100);
  const distPct = ((zone.centroid - spot) / spot * 100);

  const borderCol = isResist ? "border-red-400/30" : "border-green-400/30";
  const bgCol     = isResist ? "bg-red-400/5"      : "bg-green-400/5";
  const textCol   = isResist ? "text-red-400"       : "text-green-400";
  const rankLabel = rank === 0 ? "PRIMARY" : rank === 1 ? "SECONDARY" : "TERTIARY";

  return (
    <div className={`rounded-lg border ${borderCol} ${bgCol} overflow-hidden`}>
      {/* Header */}
      <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b ${borderCol}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded tracking-wider ${textCol} bg-current/10`}>
            {isResist ? "▼ TOP TICK — REVERSAL ZONE" : "▲ BOTTOM TICK — REVERSAL ZONE"}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded border border-current/20 text-muted tracking-widest`}>
            {rankLabel}
          </span>
        </div>
        <span className={`text-[11px] font-mono ${above ? "text-red-400/70" : "text-green-400/70"}`}>
          {distPct >= 0 ? "+" : ""}{distPct.toFixed(2)}%
        </span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Centroid + confidence */}
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <div className="text-[10px] text-muted uppercase tracking-widest mb-0.5">Centroid Level</div>
            <span className="text-3xl font-mono font-semibold text-white">${zone.centroid.toFixed(2)}</span>
          </div>
          <div className="flex-1 min-w-32">
            <div className="text-[10px] text-muted uppercase tracking-widest mb-1">ML Confidence</div>
            <ConfBar
              value={prob}
              color={prob >= 70 ? "bg-green-400" : prob >= 45 ? "bg-yellow-400" : "bg-accent"}
            />
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted uppercase tracking-widest mb-0.5">Zone Width</div>
            <div className="text-[11px] font-mono text-label">
              ${(zone.centroid - Math.max(zone.width / 2, 0.25)).toFixed(2)}
              {" — "}
              ${(zone.centroid + Math.max(zone.width / 2, 0.25)).toFixed(2)}
            </div>
            <div className="text-[10px] text-muted">{zone.strikes.length} strike{zone.strikes.length > 1 ? "s" : ""} clustered</div>
          </div>
        </div>

        {/* Trade setup */}
        <div className={`rounded border p-3 space-y-2 ${
          isResist ? "border-red-400/30 bg-red-400/6" : "border-green-400/30 bg-green-400/6"
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold tracking-wider ${isResist ? "text-red-400" : "text-green-400"}`}>
              {isResist ? "SHORT" : "LONG"}
            </span>
            <span className="text-[10px] font-semibold text-white">
              {isResist
                ? positiveGex
                  ? "Dealers long gamma — sell aggressively at centroid"
                  : "−GEX + ML level = pinning then potential squeeze"
                : positiveGex
                  ? "Dealers short puts — buy dip, target VWAP"
                  : "−GEX pivot — tight stop, watch for acceleration"}
            </span>
            <span className="ml-auto text-[9px] text-accent/60 uppercase tracking-widest">ML-POWERED</span>
          </div>
          <div className="text-muted text-[11px] leading-relaxed">
            {isResist
              ? `Approach $${zone.centroid.toFixed(2)} from below. Wait for stall or wick rejection within zone band. Primary target: next ML support zone or VWAP. Stop: acceptance above $${(zone.centroid + Math.max(zone.width / 2, 0.5) + 0.25).toFixed(2)}.`
              : `Approach $${zone.centroid.toFixed(2)} from above. Wait for hold and reversal candle within zone band. Primary target: next ML resistance zone or VWAP. Stop: acceptance below $${(zone.centroid - Math.max(zone.width / 2, 0.5) - 0.25).toFixed(2)}.`
            }
          </div>
        </div>

        {/* Cluster strikes */}
        {zone.strikes.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted">
            <span className="text-[9px] uppercase tracking-widest">Cluster strikes:</span>
            {zone.strikes.map(k => (
              <span key={k} className="font-mono text-label/60">${k}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Strike table row ──────────────────────────────────────────────────────────
function StrikeRow({ s, spot, expanded, onToggle }: {
  s: StrikeScore; spot: number; expanded: boolean; onToggle: () => void
}) {
  const above = s.strike > spot;
  const col   = above ? "text-red-400" : "text-green-400";

  return (
    <>
      <tr
        className="border-b border-border/30 hover:bg-surface/40 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className={`py-1.5 px-3 font-mono font-semibold text-xs ${col}`}>${s.strike}</td>
        <td className="py-1.5 px-3 text-[10px] font-mono text-muted">
          {s.distFromSpotPct >= 0 ? "+" : ""}{s.distFromSpotPct.toFixed(2)}%
        </td>
        <td className="py-1.5 px-3 w-28">
          <ConfBar
            value={s.confidence}
            color={s.confidence >= 80 ? "bg-green-400" : s.confidence >= 55 ? "bg-yellow-400" : "bg-accent/60"}
          />
        </td>
        <td className="py-1.5 px-3 text-[10px] font-mono text-label">
          <span className={`px-1.5 py-0.5 rounded text-[9px] border ${
            s.bias === "resistance" ? "border-red-400/30 text-red-400 bg-red-400/8"
            : s.bias === "support"  ? "border-green-400/30 text-green-400 bg-green-400/8"
            : "border-border text-muted"
          }`}>{s.bias}</span>
        </td>
        <td className="py-1.5 px-3 text-[10px] font-mono text-muted">
          C:{s.call_oi.toLocaleString()} P:{s.put_oi.toLocaleString()}
        </td>
        <td className="py-1.5 px-3 text-[10px] font-mono text-muted">
          <span className={s.net_gex >= 0 ? "text-green-400/70" : "text-red-400/70"}>
            {s.net_gex >= 0 ? "+" : ""}{(s.net_gex / 1e6).toFixed(1)}M
          </span>
        </td>
        <td className="py-1.5 px-3 text-[10px] text-muted">{expanded ? "▲" : "▼"}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/20 bg-surface/20">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
              {SIGNAL_META.map(({ key, label, weight }) => (
                <SignalRow key={key} label={label} value={s.signals[key]} weight={weight} />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Header strip ──────────────────────────────────────────────────────────────
function HeaderStrip({ d }: { d: MLReversalData }) {
  return (
    <div className="bg-panel border border-border rounded-lg px-4 py-3 space-y-2">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-[10px] uppercase tracking-widest text-muted">ML Reversal Levels</span>
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-green-400 text-[10px]">LIVE</span>
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-x-6 gap-y-2 text-[11px]">
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">Spot</div>
          <div className="text-white font-mono font-semibold text-base">${d.spot.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">Regime</div>
          <div className={`font-semibold text-sm ${d.positive_gamma ? "text-accent" : "text-yellow-400"}`}>
            {d.positive_gamma ? "+GEX" : "−GEX"}
          </div>
          <div className="text-muted text-[10px]">{d.regime_label}</div>
        </div>
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">ATM IV</div>
          <div className="text-white font-mono">{d.atm_iv.toFixed(1)}%</div>
          {d.iv_percentile != null && (
            <div className={`text-[10px] ${d.iv_percentile >= 70 ? "text-red-400" : d.iv_percentile <= 30 ? "text-green-400" : "text-muted"}`}>
              {d.iv_percentile.toFixed(0)}th pct
            </div>
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
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">ML Zones</div>
          <div className="text-accent font-mono text-sm font-semibold">{d.zones.length}</div>
          <div className="text-muted text-[10px]">predicted</div>
        </div>
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">Top Signal</div>
          <div className="text-accent text-[11px] font-semibold">IV Skew</div>
          <div className="text-muted text-[10px]">36% weight</div>
        </div>
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">Backtest</div>
          <div className="text-green-400 font-mono text-[11px] font-semibold">50.7%</div>
          <div className="text-muted text-[10px]">hit / 21x lift</div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MLReversalLevels({
  data, loading,
}: {
  data: MLReversalData | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-panel border border-border rounded-lg p-12 flex items-center justify-center">
        <span className="text-muted animate-pulse text-xs">Computing ML reversal zones from live options surface...</span>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="bg-panel border border-border rounded-lg p-12 flex items-center justify-center">
        <span className="text-muted text-xs">Select ticker to load ML levels.</span>
      </div>
    );
  }

  const spot = data.spot;

  return (
    <MLReversalLevelsInner data={data} spot={spot} />
  );
}

// Inner component with state (avoids hooks in conditional)
function MLReversalLevelsInner({ data, spot }: { data: MLReversalData; spot: number }) {
  const [expandedStrikes, setExpandedStrikes] = useState<Set<number>>(new Set());
  const [showAllStrikes, setShowAllStrikes] = useState(false);

  const toggleStrike = (k: number) => {
    setExpandedStrikes((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  // Top strikes for summary table (above and below spot, sorted by confidence)
  const topStrikes = [...data.strikes]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, showAllStrikes ? data.strikes.length : 15);

  // Insert spot divider
  const aboveSpot = data.strikes.filter(s => s.strike > spot).sort((a, b) => b.strike - a.strike);
  const belowSpot = data.strikes.filter(s => s.strike < spot).sort((a, b) => b.strike - a.strike);
  const displayStrikes = showAllStrikes ? data.strikes : [...aboveSpot.slice(0, 6), ...belowSpot.slice(0, 6)];

  return (
    <div className="space-y-4">
      <HeaderStrip d={data} />

      {/* Methodology note */}
      <div className="bg-surface/30 border border-border/40 rounded px-4 py-2 text-[10px] text-muted/70 leading-relaxed">
        <span className="text-accent font-semibold">How it works: </span>
        Per-strike IV skew (vanna asymmetry) + ATM gravity + GEX + OI concentration scored with
        RandomForest weights from QQQ 2020–2026 walk-forward backtest (670 OOS days, 50.7% hit within $1).
        Centroid zones = weighted average of clustered high-score strikes — tick-precision prediction.
        <span className="text-muted/50"> {data.model_note}</span>
      </div>

      {/* Zone cards */}
      <div className="space-y-3">
        {data.zones.length === 0 ? (
          <div className="bg-panel border border-border rounded-lg p-6 text-center text-muted text-xs">
            No high-confidence zones identified for current OI configuration.
          </div>
        ) : (
          <>
            {/* Zones above spot */}
            {data.zones.filter(z => z.centroid > spot).sort((a, b) => b.centroid - a.centroid).map((zone, i) => (
              <ZoneCard key={`above-${i}`} zone={zone} rank={i} spot={spot} positiveGex={data.positive_gamma} />
            ))}

            {/* Spot line */}
            <div className="flex items-center gap-2 py-2 px-1">
              <div className="flex-1 border-t border-dashed border-accent/50" />
              <span className="text-accent text-[11px] tracking-widest font-semibold whitespace-nowrap">
                ▶ SPOT ${spot.toFixed(2)}
              </span>
              <div className="flex-1 border-t border-dashed border-accent/50" />
            </div>

            {/* Zones below spot */}
            {data.zones.filter(z => z.centroid <= spot).sort((a, b) => b.centroid - a.centroid).map((zone, i) => (
              <ZoneCard key={`below-${i}`} zone={zone} rank={i} spot={spot} positiveGex={data.positive_gamma} />
            ))}
          </>
        )}
      </div>

      {/* Per-strike breakdown table */}
      <div className="bg-panel border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <span className="text-[11px] text-muted uppercase tracking-widest">All Strikes — ML Score Breakdown</span>
          <button
            onClick={() => setShowAllStrikes((v) => !v)}
            className="text-[10px] text-accent hover:underline"
          >
            {showAllStrikes ? "Show fewer" : "Show all"}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 text-muted text-[10px] uppercase tracking-widest">
                <th className="text-left py-2 px-3">Strike</th>
                <th className="text-left py-2 px-3">Dist</th>
                <th className="text-left py-2 px-3 w-32">Confidence</th>
                <th className="text-left py-2 px-3">Bias</th>
                <th className="text-left py-2 px-3">OI</th>
                <th className="text-left py-2 px-3">Net GEX</th>
                <th className="py-2 px-3" />
              </tr>
            </thead>
            <tbody>
              {displayStrikes.map((s, i) => {
                const prevAbove = i > 0 && displayStrikes[i - 1].strike > spot;
                const thisAbove = s.strike > spot;
                const showSpot  = prevAbove && !thisAbove;
                return (
                  <React.Fragment key={s.strike}>
                    {showSpot && (
                      <tr>
                        <td colSpan={7} className="py-1.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 border-t border-dashed border-accent/30" />
                            <span className="text-accent text-[10px] tracking-widest">SPOT ${spot.toFixed(2)}</span>
                            <div className="flex-1 border-t border-dashed border-accent/30" />
                          </div>
                        </td>
                      </tr>
                    )}
                    <StrikeRow
                      s={s}
                      spot={spot}
                      expanded={expandedStrikes.has(s.strike)}
                      onToggle={() => toggleStrike(s.strike)}
                    />
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

