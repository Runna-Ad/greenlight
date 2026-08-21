// P0 mock data — stand-in until P1 wires Supabase. Shape mirrors the planned schema
// so screens built on it swap to real queries with minimal churn.
// NOTE: the client picker (/clientes) is now DB-backed. The old MOCK_CLIENTS lived
// here and froze DiDi at 4/37/3 even after a full reset — removed 2026-08-20.

// Vocab options (mirror seed.sql) — swap for a Supabase query once linked.
export const MOCK_VOCAB = {
  marca: [
    { code: "card", label: "Card" },
    { code: "prestamos", label: "Préstamos" },
  ],
  tipo: [
    { code: "REAL", label: "Real Person", naming_kind: "real" as const },
    { code: "NORMAL", label: "Normal Video", naming_kind: "normal" as const },
    { code: "STATIC", label: "Estático", naming_kind: "static" as const },
    { code: "COPY", label: "Copies", naming_kind: "normal" as const },
  ],
  formato: [
    { code: "INHOUSE", label: "In-house" },
    { code: "UGC", label: "UGC" },
    { code: "ILLUS", label: "Ilustración" },
    { code: "STOCK", label: "Stock" },
    { code: "AI", label: "AI" },
    { code: "CREADOR", label: "Creador" },
    { code: "3D", label: "Ilustración 3D" },
  ],
  genero: [
    { code: "WOMAN", label: "Mujer" },
    { code: "MAN", label: "Hombre" },
    { code: "WOMANMAN", label: "Mujer y hombre" },
    { code: "FAMILY", label: "Familia" },
    { code: "NA", label: "N/A (se omite del nombre)" },
  ],
  origen_idea: [
    { code: "BENCHMARK", label: "Benchmark" },
    { code: "RN", label: "Rünna" },
    { code: "CH", label: "Channel Manager" },
    { code: "BENCHCH", label: "Benchmark + CH" },
    { code: "RNCH", label: "Rünna + CH" },
  ],
  plataforma: [
    { code: "TT", label: "TikTok" },
    { code: "FB", label: "Facebook" },
    { code: "GG", label: "Google" },
  ],
};

export const MOCK_SNIPPETS = [
  { id: "s1", kind: "instruccion", title: "Indicaciones para la producción" },
  { id: "s2", kind: "legal", title: "Legal CASHBACK (Regigold)" },
  { id: "s3", kind: "consideracion", title: "Regla estáticos CASHBACK/MSI" },
];
