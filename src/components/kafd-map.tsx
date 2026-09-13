import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PARCELS, type Trouble } from "@/lib/constants";
import { MapPin } from "lucide-react";

// Schematic positions (percent) matching the KAFD master plan layout:
// Area 5 cluster on the west side, Area 3 cluster on the south side.
const POSITIONS: Record<string, { x: number; y: number }> = {
  "5.01": { x: 14, y: 78 },
  "5.02": { x: 14, y: 62 },
  "5.03": { x: 22, y: 52 },
  "5.04": { x: 28, y: 44 },
  "5.05": { x: 24, y: 63 },
  "5.06": { x: 34, y: 60 },
  "5.07": { x: 28, y: 72 },
  "5.08": { x: 36, y: 78 },
  "3.01": { x: 50, y: 92 },
  "3.02": { x: 48, y: 84 },
  "3.04": { x: 60, y: 74 },
  "3.05": { x: 38, y: 88 },
  "3.06": { x: 30, y: 88 },
  "3.09": { x: 16, y: 90 },
  "3.10": { x: 22, y: 84 },
  "3.11": { x: 40, y: 95 },
};

function toneFor(count: number): { ring: string; fill: string; label: string } {
  if (count === 0) return { ring: "#10b981", fill: "rgba(16,185,129,0.18)", label: "No open issues" };
  if (count <= 2) return { ring: "#f59e0b", fill: "rgba(245,158,11,0.20)", label: "Few open issues" };
  return { ring: "#dc2626", fill: "rgba(220,38,38,0.22)", label: "Multiple open issues" };
}

interface Props {
  rows: Trouble[];
  selected: string;
  onSelect: (parcel: string) => void;
}

export function KafdMap({ rows, selected, onSelect }: Props) {
  const openByParcel = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      if (r.status !== "open") return;
      m.set(r.parcel, (m.get(r.parcel) ?? 0) + 1);
    });
    return m;
  }, [rows]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4" aria-hidden /> KAFD Map — Area 3 &amp; Area 5
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Tap a tower circle to open its trouble tracker list. Color shows open issues: green none, amber 1–2, red 3+.
        </p>
      </CardHeader>
      <CardContent>
        <div className="relative w-full rounded-lg overflow-hidden border bg-[#0b1220]" style={{ aspectRatio: "4 / 5", maxHeight: 560 }}>
          {/* schematic street grid backdrop */}
          <svg viewBox="0 0 100 125" className="absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="none">
            <defs>
              <pattern id="grid" width="6" height="6" patternUnits="userSpaceOnUse">
                <path d="M 6 0 L 0 0 0 6" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="0.3" />
              </pattern>
            </defs>
            <rect width="100" height="125" fill="url(#grid)" />
            {/* main roads (schematic) */}
            <path d="M 5 95 Q 30 60 55 50 T 95 20" fill="none" stroke="rgba(148,163,184,0.35)" strokeWidth="1.6" />
            <path d="M 8 100 Q 40 85 70 70 T 96 40" fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="1.2" />
            <path d="M 20 40 Q 40 55 60 90" fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="1.2" />
            <text x="20" y="30" fill="rgba(148,163,184,0.6)" fontSize="4" fontWeight="600">AREA 5</text>
            <text x="30" y="105" fill="rgba(148,163,184,0.6)" fontSize="4" fontWeight="600">AREA 3</text>
          </svg>
          {PARCELS.map((p) => {
            const pos = POSITIONS[p];
            if (!pos) return null;
            const count = openByParcel.get(p) ?? 0;
            const tone = toneFor(count);
            const active = selected === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onSelect(p)}
                aria-label={`Tower ${p}: ${count} open issue${count === 1 ? "" : "s"}. ${tone.label}. Show records.`}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 focus:outline-none group"
                style={{ left: `${pos.x}%`, top: `${(pos.y / 125) * 100}%` }}
              >
                <span
                  className={
                    "flex items-center justify-center rounded-full border-2 font-bold text-white transition-transform group-hover:scale-110 " +
                    (active ? "ring-2 ring-white scale-110" : "")
                  }
                  style={{
                    width: 40, height: 40, fontSize: 11,
                    borderColor: tone.ring, backgroundColor: tone.fill,
                    boxShadow: `0 0 12px ${tone.ring}`,
                    textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                  }}
                >
                  {p}
                </span>
                <span
                  className="rounded-full px-1.5 text-[10px] font-semibold text-white"
                  style={{ backgroundColor: tone.ring }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
