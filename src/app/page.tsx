"use client";

import { useState, useEffect, useCallback } from "react";
import ConversionChart from "@/components/ConversionChart";
import OptionsChain from "@/components/OptionsChain";

interface RatePoint {
  date: string;
  ratio: number;
  nq_close: number;
  qqq_close: number;
}

interface ChainData {
  date: string;
  ratio: number;
  nq_close: number;
  qqq_close: number;
  atm: number;
  rows: never[];
}

export default function Home() {
  const [rates, setRates] = useState<RatePoint[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [chainData, setChainData] = useState<ChainData | null>(null);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [minDte, setMinDte] = useState(0);
  const [maxDte, setMaxDte] = useState(90);
  const [strikeRange, setStrikeRange] = useState(15);

  useEffect(() => {
    fetch("/api/conversion-rates").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setRates(d); });
    fetch("/api/dates").then((r) => r.json()).then((ds) => {
      if (!Array.isArray(ds)) return;
      setDates(ds);
      if (ds.length > 0) setSelectedDate(ds[ds.length - 1]);
    });
  }, []);

  const loadChain = useCallback(async (date: string) => {
    setChainLoading(true);
    setChainError(null);
    try {
      const url = `/api/options-chain?date=${date}&min_dte=${minDte}&max_dte=${maxDte}&strike_range=${strikeRange}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "fetch error");
      }
      setChainData(await res.json());
    } catch (e) {
      setChainError(String(e));
    } finally {
      setChainLoading(false);
    }
  }, [minDte, maxDte, strikeRange]);

  useEffect(() => {
    if (selectedDate) loadChain(selectedDate);
  }, [selectedDate, loadChain]);

  const currentRate = rates.find((r) => r.date === selectedDate);

  return (
    <div className="space-y-4 py-4">
      {/* Info bar */}
      {currentRate && (
        <div className="flex flex-wrap gap-6 text-xs px-1">
          <span className="text-muted">
            QQQ <span className="text-white font-mono ml-1">${currentRate.qqq_close.toFixed(2)}</span>
          </span>
          <span className="text-muted">
            NQ <span className="text-white font-mono ml-1">{currentRate.nq_close.toLocaleString()}</span>
          </span>
          <span className="text-muted">
            Ratio <span className="text-accent font-mono font-semibold ml-1">{currentRate.ratio.toFixed(4)}×</span>
          </span>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-muted text-[10px] uppercase tracking-widest">Date</label>
          <input
            type="date"
            value={selectedDate ?? ""}
            min={dates[0]}
            max={dates[dates.length - 1]}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-panel border border-border rounded px-3 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted text-[10px] uppercase tracking-widest">DTE</label>
          <div className="flex gap-2 items-center">
            <input type="number" value={minDte} onChange={(e) => setMinDte(Number(e.target.value))}
              className="w-14 bg-panel border border-border rounded px-2 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-accent" placeholder="Min" />
            <span className="text-muted text-xs">–</span>
            <input type="number" value={maxDte} onChange={(e) => setMaxDte(Number(e.target.value))}
              className="w-14 bg-panel border border-border rounded px-2 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-accent" placeholder="Max" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted text-[10px] uppercase tracking-widest">Strike ±{strikeRange}%</label>
          <input type="range" min={2} max={50} value={strikeRange} onChange={(e) => setStrikeRange(Number(e.target.value))} className="w-28 accent-accent" />
        </div>
        <button onClick={() => selectedDate && loadChain(selectedDate)}
          className="px-4 py-1.5 bg-accent text-white text-xs rounded hover:bg-accent/80 transition-colors">
          Apply
        </button>
      </div>

      {rates.length > 0 && (
        <ConversionChart data={rates} selectedDate={selectedDate} onDateClick={(d) => setSelectedDate(d)} />
      )}

      {chainError && (
        <div className="bg-red-dim border border-red-400/30 rounded px-4 py-2 text-red-400 text-xs">{chainError}</div>
      )}

      <OptionsChain data={chainData} loading={chainLoading} />
    </div>
  );
}
