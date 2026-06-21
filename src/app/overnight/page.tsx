"use client";

import { useState, useEffect, useCallback } from "react";
import OvernightLevels from "@/components/OvernightLevels";

export interface CharmStrike {
  strike: number;
  call_charm: number;
  put_charm: number;
  net_dealer_flow: number;
  direction: "bullish" | "bearish" | "neutral";
  magnitude: number;
  call_oi: number;
  put_oi: number;
  net_gex: number;
  vanna_net: number;
  tex: number;
  charmPct: number;
  distPct: number;
  aboveSpot: boolean;
  nearEm1d: boolean;
  isTexPin: boolean;
}

export interface OvernightData {
  ticker: string;
  spot: number;
  positive_gamma: boolean;
  gamma_env: string;
  vol_trigger: number;
  zero_gamma: number | null;
  charm_direction: "bullish" | "bearish" | "neutral";
  net_charm_flow: number;
  vanna_direction: "bullish" | "bearish" | "neutral";
  net_vanna: number;
  tex_pin_strike: number | null;
  tex_pin_val: number;
  atm_iv: number;
  em_1d_pts: number;
  em_1d_upper: number;
  em_1d_lower: number;
  em_overnight: number;
  em_overnight_upper: number;
  em_overnight_lower: number;
  zdte_available: boolean;
  zdte_atm_iv: number | null;
  zdte_em_low: number | null;
  zdte_em_high: number | null;
  zdte_pc_sentiment: string | null;
  zdte_charm_note: string | null;
  zdte_vanna_note: string | null;
  zdte_charm_dir: string | null;
  zdte_vanna_dir: string | null;
  zdte_charm_sum: number | null;
  zdte_vanna_sum: number | null;
  bias_direction: string | null;
  bias_conviction: number | null;
  bias_narrative: string | null;
  bias_size_rule: string | null;
  liquidity_regime: string | null;
  liquidity_note: string | null;
  charm_strikes: CharmStrike[];
}

export default function OvernightPage() {
  const [data, setData] = useState<OvernightData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticker, setTicker] = useState("QQQ");
  const [lastFetch, setLastFetch] = useState<string | null>(null);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/overnight?ticker=${t}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "fetch error");
      }
      setData(await res.json());
      setLastFetch(new Date().toLocaleTimeString());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(ticker); }, [ticker, load]);

  return (
    <div className="space-y-4 py-4">
      <div className="bg-panel border border-border rounded-lg px-4 py-3 text-[11px] text-muted space-y-1">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-[10px] uppercase tracking-widest text-muted">overnight levels — charm · vanna · TEX pin</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            <span className="text-purple-400 text-[10px]">LIVE</span>
          </span>
          {lastFetch && <span className="text-muted text-[10px]">fetched {lastFetch}</span>}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span><span className="text-orange-400 font-semibold">Charm</span> = dealer delta hedging as time passes · shows where overnight flows concentrate</span>
          <span><span className="text-purple-400 font-semibold">TEX pin</span> = max pain target · price drifts toward highest theta strike overnight</span>
          <span><span className="text-blue-400 font-semibold">Vanna</span> = IV-driven delta shift · if IV compresses overnight, negative vanna = dealer buying</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-muted text-[10px] uppercase tracking-widest">Ticker</label>
          <div className="flex rounded border border-border overflow-hidden">
            {["QQQ", "SPX", "SPY", "IWM"].map((t) => (
              <button
                key={t}
                onClick={() => setTicker(t)}
                className={`px-3 py-1.5 text-xs transition-colors border-l border-border first:border-l-0 ${
                  ticker === t ? "bg-accent/20 text-accent" : "bg-panel text-muted hover:text-label"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => load(ticker)}
          disabled={loading}
          className="px-4 py-1.5 bg-accent text-white text-xs rounded hover:bg-accent/80 transition-colors disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="bg-red-dim border border-red-400/30 rounded px-4 py-2 text-red-400 text-xs">{error}</div>
      )}

      <OvernightLevels data={data} loading={loading} />
    </div>
  );
}
