"use client";

import type { OvernightData, CharmStrike } from "@/app/overnight/page";

// ── Direction color helpers ──────────────────────────────────────────────────

function dirColor(d: "bullish" | "bearish" | "neutral" | string | null) {
  if (d === "bullish") return "text-green-400";
  if (d === "bearish") return "text-red-400";
  return "text-muted";
}

function dirBg(d: "bullish" | "bearish" | "neutral" | string | null) {
  if (d === "bullish") return "border-green-400/30 bg-green-400/8";
  if (d === "bearish") return "border-red-400/30 bg-red-400/8";
  return "border-border/30 bg-surface/30";
}

function dirLabel(d: string | null): string {
  if (!d) return "—";
  return d.toUpperCase();
}

// ── Bias strip ────────────────────────────────────────────────────────────────

function BiasStrip({ d }: { d: OvernightData }) {
  const biasColor = d.bias_direction?.toLowerCase().includes("bull") ? "text-green-400"
    : d.bias_direction?.toLowerCase().includes("bear") ? "text-red-400" : "text-yellow-400";

  const convBar = d.bias_conviction ?? 0;
  const convColor = convBar >= 60 ? "bg-green-400" : convBar >= 30 ? "bg-yellow-400" : "bg-muted";

  const liqColor = d.liquidity_regime === "INJECTING" ? "text-green-400"
    : d.liquidity_regime === "DRAINING" ? "text-red-400" : "text-muted";

  return (
    <div className="bg-panel border border-border rounded-lg px-4 py-3 space-y-2">
      <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Market Bias</div>
      <div className="flex flex-wrap gap-6 items-start">
        {/* Bias */}
        <div>
          <div className={`text-sm font-bold ${biasColor}`}>{d.bias_direction ?? "—"}</div>
          <div className="text-muted text-[10px]">{d.bias_size_rule ?? ""}</div>
          {d.bias_conviction != null && (
            <div className="flex items-center gap-2 mt-1">
              <div className="h-1 w-20 bg-border rounded overflow-hidden">
                <div className={`h-full rounded ${convColor}`} style={{ width: `${convBar}%` }} />
              </div>
              <span className="text-muted text-[10px]">{convBar.toFixed(0)}% conviction</span>
            </div>
          )}
        </div>
        {/* Charm / Vanna summary */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-orange-400 font-semibold w-16">Charm</span>
            <span className={`font-semibold ${dirColor(d.charm_direction)}`}>{dirLabel(d.charm_direction)}</span>
            {d.zdte_charm_note && <span className="text-muted text-[10px]">— {d.zdte_charm_note}</span>}
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-blue-400 font-semibold w-16">Vanna</span>
            <span className={`font-semibold ${dirColor(d.vanna_direction)}`}>{dirLabel(d.vanna_direction)}</span>
            {d.zdte_vanna_note && <span className="text-muted text-[10px]">— {d.zdte_vanna_note}</span>}
          </div>
        </div>
        {/* Liquidity */}
        {d.liquidity_regime && (
          <div>
            <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">Liquidity</div>
            <div className={`text-xs font-semibold ${liqColor}`}>{d.liquidity_regime}</div>
            {d.liquidity_note && <div className="text-muted text-[10px] max-w-xs">{d.liquidity_note}</div>}
          </div>
        )}
      </div>
      {d.bias_narrative && (
        <div className="text-muted text-[11px] border-t border-border/40 pt-2 leading-relaxed">
          {d.bias_narrative}
        </div>
      )}
    </div>
  );
}

// ── Overnight ranges ─────────────────────────────────────────────────────────

function RangeStrip({ d }: { d: OvernightData }) {
  const aboveVT = d.spot >= d.vol_trigger;
  const aboveZG = d.zero_gamma != null && d.spot >= d.zero_gamma;

  return (
    <div className="bg-panel border border-border rounded-lg px-4 py-3">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-x-6 gap-y-3 text-[11px]">
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">Spot</div>
          <div className="text-white font-mono font-semibold text-base">${d.spot.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">GEX</div>
          <div className={`font-semibold ${d.positive_gamma ? "text-accent" : "text-yellow-400"}`}>
            {d.positive_gamma ? "+GEX" : "−GEX"}
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
          {d.zero_gamma != null && (
            <div className={`text-[10px] ${aboveZG ? "text-green-400" : "text-red-400"}`}>
              {aboveZG ? "above (+GEX zone)" : "below (−GEX zone)"}
            </div>
          )}
        </div>
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">TEX Pin</div>
          <div className="text-orange-400 font-mono">
            {d.tex_pin_strike ? `$${d.tex_pin_strike}` : "—"}
          </div>
          <div className="text-muted text-[10px]">max pain target</div>
        </div>
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">Overnight EM</div>
          <div className="text-white font-mono text-[10px]">
            ${d.em_overnight_lower.toFixed(1)} – ${d.em_overnight_upper.toFixed(1)}
          </div>
          <div className="text-muted text-[10px]">±{d.em_overnight.toFixed(1)} (~45% of 1d)</div>
        </div>
        {d.zdte_available && d.zdte_em_low != null && d.zdte_em_high != null && (
          <div>
            <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">0DTE 1σ</div>
            <div className="text-white font-mono text-[10px]">
              ${d.zdte_em_low.toFixed(1)} – ${d.zdte_em_high.toFixed(1)}
            </div>
            {d.zdte_atm_iv != null && <div className="text-muted text-[10px]">IV {d.zdte_atm_iv.toFixed(1)}%</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Charm strike card ────────────────────────────────────────────────────────

function CharmCard({ c, spot }: { c: CharmStrike; spot: number }) {
  const isBull = c.direction === "bullish";
  const isBear = c.direction === "bearish";

  // Overnight trade logic:
  // Bullish charm flow at level = dealers buying overnight = price supported at this strike → long setup
  // Bearish charm flow at level = dealers selling overnight = price pressured at this strike → resistance

  const tradeLabel = isBull
    ? c.aboveSpot ? "Upside target — charm pulling price up" : "Support — dealers buying into this strike"
    : isBear
    ? c.aboveSpot ? "Resistance — dealers selling into this level" : "Downside target — charm pulling price down"
    : "Neutral — mixed flow";

  const tradeDir = isBull ? "LONG bias" : isBear ? "SHORT bias" : "NEUTRAL";
  const tradeDirColor = isBull ? "text-green-400" : isBear ? "text-red-400" : "text-muted";

  const charmFlowDisplay = (v: number) => {
    const a = Math.abs(v);
    return a >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : a >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(4);
  };

  return (
    <div className={`bg-panel border rounded-lg px-4 py-3 ${
      isBull ? "border-green-400/20" : isBear ? "border-red-400/20" : "border-border/30"
    }`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xl font-semibold font-mono text-white">${c.strike}</span>
          <span className={`text-xs font-bold ${tradeDirColor}`}>{tradeDir}</span>
          {c.isTexPin && (
            <span className="text-[10px] px-2 py-0.5 rounded border border-orange-400/40 bg-orange-400/10 text-orange-400">
              TEX PIN
            </span>
          )}
          {c.nearEm1d && (
            <span className="text-[10px] px-2 py-0.5 rounded border border-purple-400/30 bg-purple-400/10 text-purple-400">
              EM 1d edge
            </span>
          )}
        </div>
        <span className={`text-[11px] ${c.aboveSpot ? "text-muted" : "text-muted"}`}>
          {c.distPct >= 0 ? "+" : ""}{c.distPct.toFixed(2)}% from spot
        </span>
      </div>

      <div className="text-muted text-[11px] mb-3">{tradeLabel}</div>

      {/* Charm flow metrics */}
      <div className="flex flex-wrap gap-3 text-[10px]">
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded border ${
          isBull ? "border-green-400/30 bg-green-400/8" : isBear ? "border-red-400/30 bg-red-400/8" : "border-border/30"
        }`}>
          <span className="text-muted">Net charm flow</span>
          <span className={`font-mono font-semibold ${tradeDirColor}`}>
            {c.net_dealer_flow >= 0 ? "+" : ""}{charmFlowDisplay(c.net_dealer_flow)}
          </span>
          <span className={`font-semibold uppercase ${tradeDirColor}`}>{c.direction}</span>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-orange-400/20 bg-surface">
          <span className="text-muted">Call charm</span>
          <span className="font-mono text-orange-400/80">{charmFlowDisplay(c.call_charm)}</span>
          <span className="text-muted ml-1">Put charm</span>
          <span className="font-mono text-blue-400/80">{charmFlowDisplay(c.put_charm)}</span>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-border/30 bg-surface">
          <span className="text-muted">charm {c.charmPct}p</span>
        </div>

        {c.vanna_net !== 0 && (
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded border ${
            c.vanna_net > 0 ? "border-green-400/20" : "border-red-400/20"
          } bg-surface`}>
            <span className="text-muted">vanna</span>
            <span className={`font-mono ${c.vanna_net > 0 ? "text-green-400" : "text-red-400"}`}>
              {c.vanna_net >= 0 ? "+" : ""}{c.vanna_net.toFixed(2)}
            </span>
          </div>
        )}

        {c.tex > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-orange-400/20 bg-surface">
            <span className="text-muted">TEX</span>
            <span className="font-mono text-orange-400">
              {c.tex >= 1e6 ? `$${(c.tex / 1e6).toFixed(1)}M` : `$${c.tex.toFixed(0)}`}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-border/30 bg-surface">
          <span className="text-green-400/70 font-mono">C:{c.call_oi.toLocaleString()}</span>
          <span className="text-muted">/</span>
          <span className="text-red-400/70 font-mono">P:{c.put_oi.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  data: OvernightData | null;
  loading: boolean;
}

export default function OvernightLevels({ data, loading }: Props) {
  if (loading) {
    return (
      <div className="bg-panel border border-border rounded-lg p-12 flex items-center justify-center">
        <span className="text-muted animate-pulse text-xs">Fetching charm · vanna · TEX data...</span>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="bg-panel border border-border rounded-lg p-12 flex items-center justify-center">
        <span className="text-muted text-xs">Select ticker to load overnight levels.</span>
      </div>
    );
  }

  const spot = data.spot;
  const strikes = data.charm_strikes;
  const aboveSpot = strikes.filter(c => c.strike > spot).sort((a, b) => b.strike - a.strike);
  const belowSpot = strikes.filter(c => c.strike <= spot).sort((a, b) => b.strike - a.strike);

  // Aggregate overnight bias: majority charm + vanna direction
  const bullishStrikes = strikes.filter(c => c.direction === "bullish").length;
  const bearishStrikes = strikes.filter(c => c.direction === "bearish").length;
  const aggBias = bullishStrikes > bearishStrikes ? "bullish" : bearishStrikes > bullishStrikes ? "bearish" : "mixed";
  const aggBiasColor = aggBias === "bullish" ? "text-green-400" : aggBias === "bearish" ? "text-red-400" : "text-yellow-400";

  return (
    <div className="space-y-3">
      <BiasStrip d={data} />
      <RangeStrip d={data} />

      {/* Aggregate overnight signal */}
      <div className={`bg-panel border rounded-lg px-4 py-3 flex flex-wrap gap-6 items-center ${
        data.charm_direction === "bullish" ? "border-green-400/20"
        : data.charm_direction === "bearish" ? "border-red-400/20" : "border-border"
      }`}>
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">Overnight Charm Flow</div>
          <div className={`text-lg font-bold ${dirColor(data.charm_direction)}`}>
            {dirLabel(data.charm_direction)}
          </div>
          <div className="text-muted text-[10px]">{bullishStrikes}↑ {bearishStrikes}↓ strikes</div>
        </div>
        <div>
          <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">Vanna Overnight</div>
          <div className={`text-lg font-bold ${dirColor(data.vanna_direction)}`}>
            {dirLabel(data.vanna_direction)}
          </div>
        </div>
        {data.tex_pin_strike && (
          <div>
            <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">Max Pain Pin</div>
            <div className="text-orange-400 text-lg font-bold font-mono">${data.tex_pin_strike}</div>
            <div className="text-muted text-[10px]">overnight drift target</div>
          </div>
        )}
        {data.zero_gamma != null && (
          <div>
            <div className="text-muted text-[10px] uppercase tracking-widest mb-0.5">Gamma Pivot</div>
            <div className="text-purple-400 text-lg font-bold font-mono">${data.zero_gamma.toFixed(2)}</div>
            <div className="text-muted text-[10px]">
              {spot >= data.zero_gamma ? "above → mean-revert" : "below → trending"}
            </div>
          </div>
        )}
      </div>

      {/* Charm levels ladder: high → spot → low */}
      {aboveSpot.length > 0 && (
        <div className="space-y-2">
          <div className="text-muted text-[10px] uppercase tracking-widest px-1">Above Spot — Resistance / Upside Targets</div>
          {aboveSpot.map(c => <CharmCard key={`${c.strike}-above`} c={c} spot={spot} />)}
        </div>
      )}

      <div className="flex items-center gap-2 py-1 px-1">
        <div className="flex-1 border-t border-dashed border-accent/50" />
        <span className="text-accent text-[11px] tracking-widest font-semibold whitespace-nowrap">
          ▶ SPOT ${spot.toFixed(2)}
        </span>
        <div className="flex-1 border-t border-dashed border-accent/50" />
      </div>

      {belowSpot.length > 0 && (
        <div className="space-y-2">
          <div className="text-muted text-[10px] uppercase tracking-widest px-1">Below Spot — Support / Downside Targets</div>
          {belowSpot.map(c => <CharmCard key={`${c.strike}-below`} c={c} spot={spot} />)}
        </div>
      )}

      {strikes.length === 0 && (
        <div className="bg-panel border border-border rounded-lg p-8 text-center text-muted text-xs">
          No charm data available.
        </div>
      )}
    </div>
  );
}
