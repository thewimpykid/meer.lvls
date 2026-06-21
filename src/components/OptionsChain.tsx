"use client";

import { useState, useMemo } from "react";

interface OptionRow {
  date: string;
  option_symbol: string;
  expiration: string;
  side: string;
  strike: number;
  dte: number;
  bid: number;
  ask: number;
  mid: number;
  last: number;
  volume: number;
  open_interest: number;
  underlying_price: number;
  nq_strike: number;
  nq_mid_pts: number;
  nq_value_usd: number;
  qqq_value_usd: number;
}

interface ChainData {
  date: string;
  ratio: number;
  nq_close: number;
  qqq_close: number;
  atm: number;
  rows: OptionRow[];
}

interface Props {
  data: ChainData | null;
  loading: boolean;
}

function fmt(n: number, dec = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded border transition-colors ${
        active
          ? "bg-accent border-accent text-white"
          : "bg-transparent border-border text-label hover:border-accent/60"
      }`}
    >
      {label}
    </button>
  );
}

export default function OptionsChain({ data, loading }: Props) {
  const [side, setSide] = useState<"call" | "put" | "both">("both");
  const [sortKey, setSortKey] = useState<keyof OptionRow>("strike");
  const [sortAsc, setSortAsc] = useState(true);

  const rows = useMemo(() => {
    if (!data) return [];
    let r = data.rows;
    if (side !== "both") r = r.filter((x) => x.side === side);
    return [...r].sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortAsc ? av - bv : bv - av;
    });
  }, [data, side, sortKey, sortAsc]);

  const handleSort = (key: keyof OptionRow) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const Th = ({ label, k }: { label: string; k: keyof OptionRow }) => (
    <th
      className="text-left px-2 py-2 text-muted text-xs cursor-pointer select-none hover:text-label whitespace-nowrap"
      onClick={() => handleSort(k)}
    >
      {label}
      {sortKey === k && <span className="ml-1 text-accent">{sortAsc ? "↑" : "↓"}</span>}
    </th>
  );

  if (loading) {
    return (
      <div className="bg-panel border border-border rounded-lg p-8 flex items-center justify-center">
        <span className="text-muted animate-pulse">Loading chain...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-panel border border-border rounded-lg p-8 flex items-center justify-center">
        <span className="text-muted">Select a date to view the options chain.</span>
      </div>
    );
  }

  return (
    <div className="bg-panel border border-border rounded-lg">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border">
        <div>
          <span className="text-label text-xs tracking-widest uppercase">Options Chain</span>
          <span className="ml-3 text-white text-sm font-semibold">{data.date}</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="text-label">
            QQQ: <span className="text-white font-mono">${fmt(data.qqq_close)}</span>
          </span>
          <span className="text-label">
            NQ: <span className="text-white font-mono">{data.nq_close.toLocaleString()}</span>
          </span>
          <span className="text-label">
            Ratio: <span className="text-accent font-mono">{data.ratio.toFixed(4)}×</span>
          </span>
          <span className="text-label">
            Rows: <span className="text-white">{rows.length}</span>
          </span>
        </div>
        <div className="flex gap-2">
          <Pill label="Both" active={side === "both"} onClick={() => setSide("both")} />
          <Pill label="Calls" active={side === "call"} onClick={() => setSide("call")} />
          <Pill label="Puts" active={side === "put"} onClick={() => setSide("put")} />
        </div>
      </div>

      {/* Conversion note */}
      <div className="px-4 py-2 bg-surface/50 border-b border-border text-xs text-muted">
        NQ Strike = QQQ Strike × {data.ratio.toFixed(4)} &nbsp;|&nbsp;
        NQ Mid (pts) = QQQ Mid × {data.ratio.toFixed(4)} &nbsp;|&nbsp;
        NQ Value ($) = NQ Mid × $20 &nbsp;|&nbsp;
        QQQ Value ($) = QQQ Mid × 100 shares
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="options-table w-full text-xs">
          <thead className="border-b border-border bg-surface/30 sticky top-0">
            <tr>
              <Th label="Side" k="side" />
              <Th label="Strike (QQQ)" k="strike" />
              <Th label="NQ Strike" k="nq_strike" />
              <Th label="Exp" k="expiration" />
              <Th label="DTE" k="dte" />
              <Th label="Bid" k="bid" />
              <Th label="Ask" k="ask" />
              <Th label="Mid" k="mid" />
              <Th label="NQ Mid (pts)" k="nq_mid_pts" />
              <Th label="NQ Value $" k="nq_value_usd" />
              <Th label="QQQ Value $" k="qqq_value_usd" />
              <Th label="Volume" k="volume" />
              <Th label="OI" k="open_interest" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isCall = r.side === "call";
              const isAtm = Math.abs(r.strike - data.atm) / data.atm < 0.005;
              return (
                <tr key={i} className={`border-b border-border/30 transition-colors ${isAtm ? "bg-accent/5" : ""}`}>
                  <td className="px-2 py-1.5">
                    <span className={`font-semibold ${isCall ? "text-green-400" : "text-red-400"}`}>
                      {r.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-white">
                    {fmt(r.strike, r.strike >= 100 ? 0 : 2)}
                    {isAtm && <span className="ml-1 text-accent text-[10px]">ATM</span>}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-label">{r.nq_strike.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-muted">{r.expiration.slice(5)}</td>
                  <td className="px-2 py-1.5 text-label">{r.dte}</td>
                  <td className="px-2 py-1.5 font-mono text-muted">{fmt(r.bid)}</td>
                  <td className="px-2 py-1.5 font-mono text-muted">{fmt(r.ask)}</td>
                  <td className={`px-2 py-1.5 font-mono font-medium ${isCall ? "text-green-400" : "text-red-400"}`}>
                    {fmt(r.mid)}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-white">{fmt(r.nq_mid_pts)}</td>
                  <td className="px-2 py-1.5 font-mono text-white">${r.nq_value_usd.toLocaleString()}</td>
                  <td className="px-2 py-1.5 font-mono text-label">${r.qqq_value_usd.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-label">
                    {r.volume > 0 ? r.volume.toLocaleString() : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-muted">
                    {r.open_interest > 0 ? r.open_interest.toLocaleString() : "—"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="text-center text-muted py-8">
                  No options data for selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
