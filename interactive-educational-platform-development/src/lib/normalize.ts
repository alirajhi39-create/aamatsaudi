/** Convert Arabic-Indic (٠-٩) and Persian (۰-۹) digits to ASCII digits. */
export function toAsciiDigits(input: string): string {
  return input
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Convert ASCII digits to Arabic-Indic digits (for display). */
export function toArabicDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d)));
}

const GRADE_WORDS: Array<[RegExp, number]> = [
  [/(الاول|الأول|اول|أول)/, 1],
  [/(الثاني|ثاني)/, 2],
  [/(الثالث|ثالث)/, 3],
  [/(الرابع|رابع)/, 4],
  [/(الخامس|خامس)/, 5],
  [/(السادس|سادس)/, 6],
];

const LATIN_SECTION_MAP: Record<string, string> = {
  a: "أ",
  b: "ب",
  c: "ج",
  d: "د",
  e: "هـ",
  f: "و",
  g: "ز",
  h: "ح",
};

const ARABIC_SECTION_MAP: Record<string, string> = {
  "ا": "أ",
  "أ": "أ",
  "إ": "أ",
  "آ": "أ",
  "ب": "ب",
  "ج": "ج",
  "د": "د",
  "ه": "هـ",
  "هـ": "هـ",
  "و": "و",
  "ز": "ز",
  "ح": "ح",
};

/**
 * Normalize class names written in many different ways into a single canonical format: "6/أ".
 * Examples: "٦/أ", "6/a", "6-A", "6أ", "السادس أ", "سادس / ب", "6 ب", "٦ب", "6/1" → "6/1".
 */
export function normalizeClassName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = toAsciiDigits(String(raw)).trim();
  if (!s) return "";
  s = s.replace(/[\u064B-\u0652\u0640]/g, ""); // remove tashkeel & tatweel
  s = s.replace(/[،,ـ]/g, " ").replace(/\s+/g, " ").trim();

  // Grade number
  let grade: number | null = null;
  const numMatch = s.match(/(\d{1,2})/);
  if (numMatch) {
    grade = Number(numMatch[1]);
  } else {
    for (const [re, g] of GRADE_WORDS) {
      if (re.test(s)) {
        grade = g;
        break;
      }
    }
  }

  // Remove grade words / the word "صف" / "فصل" / "الصف"
  let rest = s
    .replace(/(الصف|صف|الفصل|فصل|الابتدائي|ابتدائي|grade|class)/gi, " ")
    .replace(/(الاول|الأول|اول|أول|الثاني|ثاني|الثالث|ثالث|الرابع|رابع|الخامس|خامس|السادس|سادس)/g, " ");
  if (numMatch) rest = rest.replace(numMatch[0], " ");
  rest = rest.replace(/[\/\-_|\\:.()\[\]]/g, " ").replace(/\s+/g, " ").trim();

  // Section
  let section = "";
  const tokens = rest.split(" ").filter(Boolean);
  for (const tok of tokens) {
    const t = tok.toLowerCase();
    if (/^\d{1,2}$/.test(t)) {
      section = t;
      break;
    }
    if (LATIN_SECTION_MAP[t]) {
      section = LATIN_SECTION_MAP[t];
      break;
    }
    if (ARABIC_SECTION_MAP[t]) {
      section = ARABIC_SECTION_MAP[t];
      break;
    }
    // Handle glued forms like "6أ" (digit removed earlier leaves "أ") or "أ6"
    const firstChar = t[0];
    if (t.length === 1 && ARABIC_SECTION_MAP[firstChar]) {
      section = ARABIC_SECTION_MAP[firstChar];
      break;
    }
  }

  if (grade === null && !section) return s;
  if (grade === null) return section;
  return section ? `${grade}/${section}` : String(grade);
}

/**
 * Normalize an Arabic name for matching purposes (not for display).
 */
export function normalizeNameKey(raw: string | null | undefined): string {
  if (!raw) return "";
  return toAsciiDigits(String(raw))
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s*(بن|ابن)\s*/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Clean a display name (trim, collapse spaces). */
export function cleanDisplayName(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}


