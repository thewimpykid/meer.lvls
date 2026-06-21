"use client";

import { useState, useEffect, useCallback } from "react";
import KeyLevels from "@/components/KeyLevels";

export interface WallData {
  strike: number;
  wallType: "call" | "put";
  aboveSpot: boolean;
  distFromSpotPct: number;
  call_gex: number;
  put_gex: number;
  net_gex: number;
  call_oi: number;
  put_oi: number;
  gexPct: number;
  net_dex: number;
  call_dex: number;
  put_dex: number;
  dexConfirmsFromBelow: boolean;
  dexConfirmsFromAbove: boolean;
  tex_abs: number;
  texPct: number;
  texLabel: "HIGH" | "MED" | "LOW";
  texHigh: boolean;
  texLow: boolean;
  vanna_net: number;
  vexSign: "bullish" | "bearish" | "neutral";
  archetype: string;
  nearEm1d: boolean;
  nearEm1w: boolean;
  confluenceScore: number;
}

export interface YYYWallsData {
  ticker: string;
  spot: number;
  positive_gamma: boolean;
  gamma_env: string;
  vol_trigger: number;
  total_net_gex: number;
  net_gex_bn: number;
  call_wall: number;
  put_wall: number;
  top_call_wall: number | null;
  top_put_wall: number | null;
  zero_gamma: number | null;
  max_pain: number;
  atm_iv: number;
  iv_percentile: number | null;
  em_1d_pts: number;
  em_1d_upper: number;
  em_1d_lower: number;
  em_1w_upper: number | null;
  em_1w_lower: number | null;
  pcr: number | null;
  total_call_oi: number;
  total_put_oi: number;
  total_tex: number | null;
  walls: WallData[];
}

export default function LevelsPage() {
  const [data, setData] = useState<YYYWallsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticker, setTicker] = useState("QQQ");
  const [lastFetch, setLastFetch] = useState<string | null>(null);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/yyy?ticker=${t}`);
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
      {/* Strategy banner */}
      <div className="bg-panel border border-border rounded-lg px-4 py-3 text-[11px] text-muted space-y-1">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-[10px] uppercase tracking-widest text-muted">reem_lvls — computed from raw YYY data</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-[10px]">LIVE</span>
          </span>
          {lastFetch && <span className="text-muted text-[10px]">fetched {lastFetch}</span>}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span><span className="text-accent font-semibold">+GEX</span> counter-trend · walls = sticky S/R · dealers fade moves</span>
          <span><span className="text-yellow-400 font-semibold">−GEX</span> pro-trend · walls = acceleration triggers</span>
          <span><span className="text-green-400">DEX+</span> from below = rejection confirmed · <span className="text-green-400">DEX−</span> from above = rejection confirmed</span>
        </div>
      </div>

      {/* Controls */}
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

      <KeyLevels data={data} loading={loading} />
    </div>
  );
}
