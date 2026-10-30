"use client";

import { useState } from "react";
import { MAP_PLACES, MAP_REGIONS, type MapPlace, type MapRegion } from "@/lib/lesson-content";
import { playSound } from "@/lib/sound";
import { DoneBanner, Feedback, cx } from "@/components/ui";
import { arr, type SlideProps } from "./types";

type Pt = [number, number];

/* ---------------------------------------------------------------------------
 * Geometry — real-world coastline coordinates projected to a 1200 × 1000 box
 * x = (lon − 33°) × 41.4   |   y = (33° − lat) × 45.45
 * ------------------------------------------------------------------------- */

/** Everything that is land (Africa + Sinai/Levant + Arabia + Iraq/Iran). Water = the rest. */
const LAND: Pt[] = [
  [-80, -80], [1280, -80], [1280, 359],
  // Iran (Makran + Gulf coast) heading west
  [1142, 350], [1026, 336], [997, 268], [964, 264], [906, 291], [790, 236], [737, 186], [641, 136],
  // Kuwait & Saudi Gulf coast heading south
  [625, 141], [621, 164], [641, 209], [662, 245], [687, 273], [712, 286], [708, 300], [712, 336], [732, 380],
  // Qatar
  [737, 377], [737, 345], [753, 309], [766, 332], [766, 350], [766, 385],
  // UAE
  [774, 405], [815, 405], [886, 386], [923, 355], [935, 336], [948, 327], [968, 300],
  // Oman (Musandam → Muscat → Ras al Hadd → Dhofar)
  [964, 336], [968, 359], [981, 391], [1059, 427], [1097, 473], [1109, 477], [1055, 582], [1022, 604], [1026, 636],
  [964, 686], [923, 709], [898, 727], [873, 727],
  // Yemen south coast
  [795, 791], [774, 800], [687, 827], [666, 841], [526, 891], [497, 918], [436, 925],
  // Red Sea east coast heading north
  [424, 893], [410, 827], [397, 732], [335, 632], [302, 586], [257, 523], [248, 464], [211, 405], [178, 364],
  [145, 309], [112, 259], [78, 230], [80, 200], [88, 160],
  // Gulf of Aqaba (west shore) + Sinai + Gulf of Suez
  [74, 160], [70, 182], [62, 205], [54, 240], [18, 182], [16, 140], [4, 140], [6, 214],
  // Red Sea west (African) coast heading south
  [33, 264], [54, 314], [79, 359], [116, 414], [149, 491], [174, 609], [178, 632], [194, 664], [269, 791], [396, 905],
  [414, 938], [412, 972], [436, 985], [470, 1080], [-80, 1080],
];

/** Dimmed context: Africa. */
const AFRICA: Pt[] = [
  [-80, -80], [12, -80], [4, 140], [6, 214], [33, 264], [54, 314], [79, 359], [116, 414], [149, 491], [174, 609], [178, 632],
  [194, 664], [269, 791], [396, 905], [414, 938], [412, 972], [436, 985], [470, 1080], [-80, 1080],
];

/** Dimmed context: Levant, Iraq and Iran (north of the peninsula). */
const NORTH: Pt[] = [
  [16, -80], [1280, -80], [1280, 359], [1142, 350], [1026, 336], [997, 268], [964, 264], [906, 291], [790, 236], [737, 186],
  [641, 136], [600, 130], [484, 177], [257, 45], [180, 105], [110, 150], [90, 158], [74, 160], [70, 182], [62, 205], [54, 240],
  [18, 182], [16, 140],
];

/** Extent of the Second Saudi State during the reign of Imam Faisal bin Turki (approximate, for teaching). */
const STATE: Pt[] = [
  [290, 205], [414, 168], [538, 159], [612, 182], [638, 211], [659, 247], [684, 275], [708, 288], [705, 301], [709, 337],
  [729, 381], [766, 418], [890, 477], [931, 568], [828, 659], [683, 705], [559, 714], [455, 659], [405, 568], [372, 477],
  [352, 386], [310, 295],
];

/** Catmull-Rom → cubic Bézier closed path. */
function smoothPath(pts: Pt[], tension = 0.8): string {
  const n = pts.length;
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d + " Z";
}

const LAND_D = smoothPath(LAND, 0.7);
const AFRICA_D = smoothPath(AFRICA, 0.7);
const NORTH_D = smoothPath(NORTH, 0.7);
const STATE_D = smoothPath(STATE, 0.9);

/** Small chevrons for mountain ranges (Hijaz/Asir, Yemen highlands, Hajar in Oman). */
const MOUNTAINS: Pt[] = [
  [292, 318], [312, 372], [334, 428], [356, 486], [378, 546], [400, 606], [424, 666], [450, 722], [470, 780],
  [1000, 408], [1030, 440], [1060, 470], [1085, 505],
];
/** Dune marks in the eastern Empty Quarter. */
const DUNES: Pt[] = [[870, 610], [905, 640], [860, 665], [930, 690], [890, 712]];

const SEA_LABELS = [
  { text: "البحر الأحمر", x: 214, y: 548, rotate: 62 },
  { text: "الخليج العربي", x: 822, y: 318, rotate: 32 },
  { text: "خليج عُمان", x: 1088, y: 392, rotate: 36 },
  { text: "بحر العرب", x: 790, y: 890, rotate: 0 },
  { text: "خليج عدن", x: 600, y: 962, rotate: 0 },
];
const LAND_LABELS = [
  { text: "الحجاز", x: 285, y: 445, dim: false },
  { text: "اليمن", x: 520, y: 835, dim: false },
  { text: "عُمان", x: 985, y: 545, dim: false },
  { text: "مصر", x: 70, y: 330, dim: true },
  { text: "السودان", x: 120, y: 690, dim: true },
  { text: "العراق", x: 520, y: 72, dim: true },
  { text: "إيران", x: 900, y: 140, dim: true },
];

const PLACE_COLORS: Record<MapPlace["kind"], string> = { capital: "#a0353f", battle: "#b45309", city: "#2f4b6e" };
const PLACE_KIND_LABEL: Record<MapPlace["kind"], string> = { capital: "العاصمة", battle: "معركة", city: "موقع ورد في الدرس" };

/* ------------------------------------------------------------------------- */

export function MapSlide({ value, update, done, markDone }: SlideProps) {
  const explored = arr<string>(value.explored);
  const placesSeen = arr<string>(value.places);
  const [active, setActive] = useState<{ kind: "region"; item: MapRegion } | { kind: "place"; item: MapPlace } | null>(null);

  const openRegion = (r: MapRegion) => {
    playSound("click");
    setActive({ kind: "region", item: r });
    if (!explored.includes(r.id)) {
      const next = [...explored, r.id];
      update({ explored: next });
      if (next.length === MAP_REGIONS.length && !done) {
        playSound("success");
        markDone();
      }
    }
  };
  const openPlace = (p: MapPlace) => {
    playSound("flip");
    setActive({ kind: "place", item: p });
    if (!placesSeen.includes(p.id)) update({ places: [...placesSeen, p.id] });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <div className="overflow-hidden rounded-3xl shadow-xl ring-1 ring-black/10">
          <svg viewBox="0 0 1200 1000" className="block h-auto w-full" role="img" aria-label="خريطة امتداد الدولة السعودية الثانية في عهد الإمام فيصل بن تركي" style={{ fontFamily: "var(--font-heading)" }}>
            <defs>
              <linearGradient id="m-sea" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#c7ebf8" />
                <stop offset="1" stopColor="#6fbfe0" />
              </linearGradient>
              <linearGradient id="m-land" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#f8ecd3" />
                <stop offset="1" stopColor="#e6cf9f" />
              </linearGradient>
              <linearGradient id="m-state" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#7ed98a" />
                <stop offset="1" stopColor="#2f9e52" />
              </linearGradient>
              <pattern id="m-waves" width="70" height="34" patternUnits="userSpaceOnUse">
                <path d="M0 17 q17.5 -12 35 0 t35 0" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2.5" />
              </pattern>
              <filter id="m-shadow" x="-10%" y="-10%" width="120%" height="130%">
                <feDropShadow dx="0" dy="8" stdDeviation="9" floodColor="#0a4b2a" floodOpacity="0.35" />
              </filter>
              <filter id="m-coast" x="-5%" y="-5%" width="110%" height="110%">
                <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#2c5d78" floodOpacity="0.45" />
              </filter>
              <filter id="m-pin" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.35" />
              </filter>
            </defs>

            {/* Sea */}
            <rect width="1200" height="1000" fill="url(#m-sea)" />
            <rect width="1200" height="1000" fill="url(#m-waves)" />

            {/* Land */}
            <path d={LAND_D} fill="url(#m-land)" stroke="#b89a66" strokeWidth="3" filter="url(#m-coast)" />
            <path d={AFRICA_D} fill="#5b4a2b" fillOpacity="0.13" />
            <path d={NORTH_D} fill="#5b4a2b" fillOpacity="0.13" />

            {/* Graticule */}
            <g stroke="#1f2a37" strokeOpacity="0.06" strokeWidth="1.5">
              {[200, 400, 600, 800, 1000].map((x) => <line key={`v${x}`} x1={x} y1="0" x2={x} y2="1000" />)}
              {[200, 400, 600, 800].map((y) => <line key={`h${y}`} x1="0" y1={y} x2="1200" y2={y} />)}
            </g>

            {/* Second Saudi State */}
            <path d={STATE_D} fill="url(#m-state)" fillOpacity="0.92" stroke="#176b36" strokeWidth="5" strokeDasharray="16 9" strokeLinejoin="round" filter="url(#m-shadow)" className="map-grow" />

            {/* Terrain hints */}
            <g fill="none" stroke="#9d7f4e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.75">
              {MOUNTAINS.map(([x, y], i) => <path key={i} d={`M${x - 16} ${y + 10} L${x} ${y - 12} L${x + 16} ${y + 10}`} />)}
            </g>
            <g fill="none" stroke="#c9a96e" strokeWidth="3" strokeLinecap="round" opacity="0.8">
              {DUNES.map(([x, y], i) => <path key={i} d={`M${x - 22} ${y} q11 -10 22 0 t22 0`} />)}
            </g>

            {/* Sea & land labels */}
            {SEA_LABELS.map((l) => (
              <text key={l.text} x={l.x} y={l.y} transform={`rotate(${l.rotate} ${l.x} ${l.y})`} fontSize="30" fontWeight="800" fill="#17546f" textAnchor="middle" letterSpacing="1" stroke="#ffffff" strokeWidth="6" paintOrder="stroke" strokeOpacity="0.7">
                {l.text}
              </text>
            ))}
            {LAND_LABELS.map((l) => (
              <text key={l.text} x={l.x} y={l.y} fontSize={l.dim ? 26 : 30} fontWeight="800" fill={l.dim ? "#8a7a5a" : "#5b4a2b"} textAnchor="middle" stroke="#fff6e6" strokeWidth="6" paintOrder="stroke" strokeOpacity="0.8">
                {l.text}
              </text>
            ))}

            {/* Places mentioned in the lesson */}
            {MAP_PLACES.map((p) => {
              const color = PLACE_COLORS[p.kind];
              const isActive = active?.kind === "place" && active.item.id === p.id;
              const seen = placesSeen.includes(p.id);
              const dy = p.labelDy ?? 34;
              return (
                <g key={p.id} onClick={() => openPlace(p)} className="cursor-pointer" role="button" aria-label={p.name}>
                  <circle cx={p.x} cy={p.y} r="34" fill="transparent" />
                  {p.kind === "capital" ? (
                    <path d="M0 -16 L4.7 -5 L16.5 -5 L7 2 L10.5 13.5 L0 6.5 L-10.5 13.5 L-7 2 L-16.5 -5 L-4.7 -5 Z" transform={`translate(${p.x} ${p.y}) scale(${isActive ? 1.35 : 1.1})`} fill={color} stroke="#fff" strokeWidth="2.5" filter="url(#m-pin)" />
                  ) : p.kind === "battle" ? (
                    <g transform={`translate(${p.x} ${p.y}) scale(${isActive ? 1.3 : 1})`} filter="url(#m-pin)">
                      <circle r="12" fill={color} stroke="#fff" strokeWidth="2.5" />
                      <path d="M-6 -6 L6 6 M6 -6 L-6 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
                    </g>
                  ) : (
                    <circle cx={p.x} cy={p.y} r={isActive ? 12 : 9} fill={color} stroke="#fff" strokeWidth="2.5" filter="url(#m-pin)" />
                  )}
                  <text x={p.x} y={p.y + dy} fontSize="24" fontWeight="800" fill={seen ? color : "#1f2a37"} textAnchor="middle" stroke="#fff" strokeWidth="5" paintOrder="stroke">
                    {p.name}
                  </text>
                </g>
              );
            })}

            {/* Region pins (the activity) */}
            {MAP_REGIONS.map((r) => {
              const seen = explored.includes(r.id);
              const isActive = active?.kind === "region" && active.item.id === r.id;
              const color = seen ? "#0f6e56" : "#a0353f";
              return (
                <g key={r.id} onClick={() => openRegion(r)} className="cursor-pointer" role="button" aria-label={r.name}>
                  <circle cx={r.x} cy={r.y - 20} r="48" fill="transparent" />
                  {!seen && <circle cx={r.x} cy={r.y} r="14" fill={color} fillOpacity="0.5" className="map-pulse" />}
                  <ellipse cx={r.x} cy={r.y + 3} rx="13" ry="4.5" fill="#000" fillOpacity="0.25" />
                  <g transform={`translate(${r.x} ${r.y}) scale(${isActive ? 1.2 : 1})`}>
                    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" transform="translate(-19.2 -57.6) scale(1.6)" fill={color} stroke="#fff" strokeWidth="1.6" filter="url(#m-pin)" />
                    <circle cx="0" cy="-38.4" r="11.5" fill="#fff" />
                    <text x="0" y="-31" fontSize="19" fontWeight="900" fill={color} textAnchor="middle">
                      {seen ? "✓" : "?"}
                    </text>
                  </g>
                  <text x={r.x} y={r.y + (r.labelDy ?? 38)} fontSize="30" fontWeight="900" fill={seen ? "#0f6e56" : "#1f2a37"} textAnchor="middle" stroke="#fff" strokeWidth="7" paintOrder="stroke">
                    {r.short ?? r.name}
                  </text>
                </g>
              );
            })}

            {/* Legend */}
            <g transform="translate(838 802)">
              <rect width="340" height="172" rx="18" fill="#fff" fillOpacity="0.93" stroke="#d9c7a0" strokeWidth="2" />
              <rect x="300" y="22" width="24" height="24" rx="6" fill="url(#m-state)" stroke="#176b36" strokeWidth="2" />
              <text x="288" y="36" fontSize="19" fontWeight="800" fill="#1f2a37" textAnchor="end">امتداد الدولة السعودية الثانية</text>
              <text x="288" y="60" fontSize="16" fill="#5b4a2b" textAnchor="end">في عهد الإمام فيصل بن تركي</text>
              <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" transform="translate(302 78) scale(0.85)" fill="#a0353f" stroke="#fff" strokeWidth="1.5" />
              <text x="288" y="100" fontSize="18" fontWeight="700" fill="#1f2a37" textAnchor="end">منطقة للاستكشاف — اضغط عليها</text>
              <path d="M0 -16 L4.7 -5 L16.5 -5 L7 2 L10.5 13.5 L0 6.5 L-10.5 13.5 L-7 2 L-16.5 -5 L-4.7 -5 Z" transform="translate(312 136) scale(0.8)" fill="#a0353f" stroke="#fff" strokeWidth="2" />
              <circle cx="290" cy="136" r="8" fill="#b45309" stroke="#fff" strokeWidth="2" />
              <text x="270" y="142" fontSize="18" fontWeight="700" fill="#1f2a37" textAnchor="end">العاصمة والمعارك والمواقع</text>
            </g>

            {/* Compass */}
            <g transform="translate(1126 640)">
              <circle r="50" fill="#fff" fillOpacity="0.9" stroke="#2f4b6e" strokeWidth="2" />
              <path d="M-38 0 L0 -8 L38 0 L0 8 Z" fill="#9fb0c6" />
              <path d="M0 -40 L10 0 L0 40 L-10 0 Z" fill="#2f4b6e" />
              <path d="M0 -40 L10 0 L-10 0 Z" fill="#a0353f" />
              <circle r="4" fill="#fff" />
              <text y="-56" fontSize="22" fontWeight="900" fill="#a0353f" textAnchor="middle">ش</text>
              <text y="74" fontSize="22" fontWeight="900" fill="#2f4b6e" textAnchor="middle">ج</text>
              <text x="64" y="8" fontSize="22" fontWeight="900" fill="#2f4b6e" textAnchor="middle">ق</text>
              <text x="-64" y="8" fontSize="22" fontWeight="900" fill="#2f4b6e" textAnchor="middle">غ</text>
            </g>
          </svg>
          <div className="flex flex-wrap items-center justify-between gap-1 bg-navy px-3 py-2 text-xs text-white sm:text-sm">
            <span className="font-bold">امتداد الدولة السعودية الثانية في عهد الإمام فيصل بن تركي</span>
            <span className="opacity-80">(أُعدت هذه الخريطة لأغراض التعليم والإيضاح فقط)</span>
          </div>
        </div>
      </div>

      <div className="grid content-start gap-4 lg:col-span-2">
        <div className="card p-4 sm:p-5">
          <h3 className="font-heading text-lg font-extrabold text-saudi sm:text-xl">🗺️ استكشف الخريطة</h3>
          <p className="mt-1 text-base text-ink/60">
            اضغط على الدبابيس الحمراء (؟) لتتعرف على المناطق التي امتد إليها نفوذ الدولة ({explored.length}/{MAP_REGIONS.length})، وعلى النجمة والنقاط لتكتشف مواقع وردت في الدرس.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {MAP_REGIONS.map((r) => (
              <button key={r.id} onClick={() => openRegion(r)} className={cx("chip text-base ring-1 transition", explored.includes(r.id) ? "bg-saudi-light text-saudi ring-saudi/30" : "bg-white text-ink/60 ring-sand-dark hover:ring-saudi")}>
                {explored.includes(r.id) ? "✓" : "○"} {r.name}
              </button>
            ))}
          </div>
        </div>

        {active ? (
          <div key={active.item.id} className={cx("card slide-enter border-s-8 p-4 sm:p-5", active.kind === "region" ? "border-saudi" : "border-maroon")}>
            <div className="flex items-start gap-3">
              <span className="text-4xl">{active.kind === "region" ? active.item.icon : active.item.kind === "capital" ? "⭐" : active.item.kind === "battle" ? "⚔️" : "📍"}</span>
              <div>
                <p className="text-xs font-bold text-ink/50">{active.kind === "region" ? "منطقة من مناطق الدولة" : PLACE_KIND_LABEL[active.item.kind]}</p>
                <h4 className="font-heading text-xl font-extrabold text-saudi sm:text-2xl">{active.item.name}</h4>
              </div>
            </div>
            <p className="mt-2 text-lg leading-[1.9]">{active.item.info}</p>
          </div>
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-saudi/40 p-6 text-center text-lg text-ink/50">👆 اختر موقعاً على الخريطة لقراءة معلوماته</div>
        )}

        <Feedback kind="info">نجح الإمام فيصل بن تركي في تقوية الدولة السعودية الثانية، وبسط نفوذها على أجزاء من شبه الجزيرة العربية وسواحل الخليج العربي.</Feedback>
        {done && <DoneBanner>أحسنت! استكشفت جميع مناطق الدولة السعودية الثانية على الخريطة.</DoneBanner>}
      </div>
    </div>
  );
}
