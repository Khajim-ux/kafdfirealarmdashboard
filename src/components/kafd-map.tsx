import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PARCELS, type Trouble } from "@/lib/constants";
import { MapPin } from "lucide-react";

// Schematic positions (x: 0-100, y: 0-125) matching the KAFD master plan:
// Area 4 top-right, Area 2 right, Area 1 center-south, Area 5 west, Area 3 south, A-parcels scattered.
const POSITIONS: Record<string, { x: number; y: number }> = {
  // Area 1 — central / south-east
  "1.01": { x: 87, y: 63 }, "1.02": { x: 82, y: 70 }, "1.03": { x: 79, y: 78 },
  "1.04": { x: 72, y: 81 }, "1.05": { x: 66, y: 85 }, "1.06": { x: 73, y: 73 },
  "1.07": { x: 70, y: 76 }, "1.08": { x: 76, y: 62 }, "1.09": { x: 62, y: 56 },
  "1.10": { x: 51, y: 59 }, "1.11": { x: 43, y: 66 }, "1.12": { x: 44, y: 79 },
  "1.13": { x: 51, y: 83 }, "1.14": { x: 45, y: 74 }, "1.15": { x: 50, y: 68 },
  "1.16": { x: 58, y: 64 }, "1.17": { x: 66, y: 68 }, "1.18": { x: 61, y: 75 },
  "1.19": { x: 56, y: 70 },
  // Area 2 — right / north-east
  "2.01": { x: 88, y: 33 }, "2.02": { x: 89, y: 40 }, "2.03": { x: 82, y: 43 },
  "2.04": { x: 84, y: 33 }, "2.05": { x: 83, y: 50 }, "2.06": { x: 88, y: 49 },
  "2.07": { x: 73, y: 44 }, "2.08": { x: 62, y: 45 }, "2.09": { x: 54, y: 43 },
  "2.10": { x: 60, y: 38 }, "2.11": { x: 66, y: 35 }, "2.12": { x: 73, y: 36 },
  "2.13": { x: 73, y: 30 }, "2.14": { x: 64, y: 52 }, "2.15": { x: 82, y: 39 },
  // Area 3 — south
  "3.01": { x: 39, y: 98 }, "3.02": { x: 38, y: 91 }, "3.03": { x: 44, y: 88 },
  "3.04": { x: 38, y: 82 }, "3.05": { x: 29, y: 83 }, "3.06": { x: 24, y: 88 },
  "3.07": { x: 28, y: 96 }, "3.08": { x: 22, y: 92 }, "3.09": { x: 13, y: 84 },
  "3.10": { x: 20, y: 82 }, "3.11": { x: 30, y: 90 },
  // Area 4 — north
  "4.01": { x: 50, y: 26 }, "4.02": { x: 58, y: 30 }, "4.03": { x: 60, y: 21 },
  "4.04": { x: 62, y: 27 }, "4.05": { x: 66, y: 16 }, "4.06": { x: 68, y: 22 },
  "4.07": { x: 65, y: 28 }, "4.08": { x: 68, y: 32 }, "4.09": { x: 79, y: 17 },
  "4.10": { x: 73, y: 11 }, "4.11": { x: 82, y: 8 }, "4.12": { x: 88, y: 14 },
  // Area 5 — west
  "5.01": { x: 13, y: 76 }, "5.02": { x: 15, y: 66 }, "5.03": { x: 20, y: 58 },
  "5.04": { x: 27, y: 47 }, "5.05": { x: 26, y: 61 }, "5.06": { x: 34, y: 64 },
  "5.07": { x: 28, y: 70 }, "5.08": { x: 33, y: 52 },
  // A parcels — amenities / podium
  "A.01": { x: 53, y: 92 }, "A.02": { x: 84, y: 20 }, "A.03": { x: 42, y: 54 },
  "A.04": { x: 73, y: 56 }, "A.05": { x: 76, y: 22 }, "A.06": { x: 33, y: 77 },
  "A.07": { x: 17, y: 71 }, "A.08": { x: 49, y: 48 }, "A.09": { x: 84, y: 24 },
  "A.10": { x: 91, y: 58 }, "A.11": { x: 40, y: 41 }, "A.12": { x: 46, y: 35 },
};

function toneFor(count: number): { ring: string; fill: string; label: string } {
  if (count === 0) return { ring: "#10b981", fill: "rgba(16,185,129,0.18)", label: "No open issues" };
  if (count <= 2) return { ring: "#f59e0b", fill: "rgba(245,158,11,0.20)", label: "1-2 open issues" };
  return { ring: "#dc2626", fill: "rgba(220,38,38,0.22)", label: "3+ open issues" };
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
          <MapPin className="h-4 w-4" aria-hidden /> KAFD Map — All Towers
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Tap a tower circle to open its trouble tracker list.
        </p>
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground" aria-label="Map legend">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.18)" }} />
            No open issues
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.20)" }} />
            1–2 open
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: "#dc2626", backgroundColor: "rgba(220,38,38,0.22)" }} />
            3+ open
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold text-white" style={{ backgroundColor: "#64748b" }}>n</span>
            Badge = open issue count
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative w-full rounded-lg overflow-hidden border bg-[#0b1220]" style={{ aspectRatio: "4 / 5", maxHeight: 640 }}>
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
            <path d="M 60 10 Q 70 30 78 60" fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="1" />
            <text x="70" y="14" fill="rgba(148,163,184,0.6)" fontSize="4" fontWeight="600">AREA 4</text>
            <text x="80" y="46" fill="rgba(148,163,184,0.6)" fontSize="4" fontWeight="600">AREA 2</text>
            <text x="60" y="80" fill="rgba(148,163,184,0.6)" fontSize="4" fontWeight="600">AREA 1</text>
            <text x="18" y="42" fill="rgba(148,163,184,0.6)" fontSize="4" fontWeight="600">AREA 5</text>
            <text x="28" y="106" fill="rgba(148,163,184,0.6)" fontSize="4" fontWeight="600">AREA 3</text>
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
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 focus:outline-none group z-10"
                style={{ left: `${pos.x}%`, top: `${(pos.y / 125) * 100}%` }}
              >
                <span
                  className={
                    "flex items-center justify-center rounded-full border-2 font-bold text-white transition-transform group-hover:scale-110 " +
                    (active ? "ring-2 ring-white scale-110" : "")
                  }
                  style={{
                    width: 34, height: 34, fontSize: 9.5,
                    borderColor: tone.ring, backgroundColor: tone.fill,
                    boxShadow: `0 0 10px ${tone.ring}`,
                    textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                  }}
                >
                  {p}
                </span>
                {count > 0 && (
                  <span
                    className="rounded-full px-1.5 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: tone.ring }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
