"use client";

import { useState, useEffect, useCallback } from "react";
import MLReversalLevels from "@/components/MLReversalLevels";
import type { MLReversalData } from "@/app/api/ml-reversal/route";

export default function MLReversalPage() {
  const [data, setData]       = useState<MLReversalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [ticker, setTicker]   = useState("QQQ");
  const [lastFetch, setLastFetch] = useState<string | null>(null);

  const load = useCallback(async (t: string) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/ml-reversal?ticker=${t}`);
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
      {/* Banner */}
      <div className="bg-panel border border-border rounded-lg px-4 py-3 text-[11px] text-muted space-y-1">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-muted">
            ml_reversal — IV surface + Greek exposures, RandomForest weights
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-[10px]">LIVE</span>
          </span>
          {lastFetch && <span className="text-muted text-[10px]">fetched {lastFetch}</span>}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>
            <span className="text-accent font-semibold">IV Skew</span> #1 signal (36%) — put-call IV difference = dealer hedging asymmetry
          </span>
          <span>
            <span className="text-yellow-400 font-semibold">ATM Gravity</span> #2 (29%) — near-money strikes = natural reversal magnets
          </span>
          <span>
            <span className="text-green-400">GEX</span> #3 (8%) — dealer gamma pins
          </span>
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
          {loading ? "Computing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="bg-red-dim border border-red-400/30 rounded px-4 py-2 text-red-400 text-xs">{error}</div>
      )}

      <MLReversalLevels data={data} loading={loading} />
    </div>
  );
}
