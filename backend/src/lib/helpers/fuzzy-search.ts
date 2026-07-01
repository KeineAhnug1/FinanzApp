// Lightweight typo-tolerant scorer for forum question search.
// Combines exact substring, Damerau-Levenshtein on word-pairs (handles
// transpositions like "Brageld" vs "Bargeld"), and trigram overlap for
// robustness on longer terms. Pure functions, no deps.

const MIN_SCORE = 0.35;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')        // strip diacritics
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')      // punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s: string): string[] {
  const n = normalize(s);
  if (!n) return [];
  return n.split(' ').filter((t) => t.length > 0);
}

// Damerau-Levenshtein: like Levenshtein but adjacent transpositions cost 1.
function damerauLevenshtein(a: string, b: string): number {
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const d: number[][] = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) d[i]![0] = i;
  for (let j = 0; j <= bl; j++) d[0]![j] = j;

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(
        d[i - 1]![j]! + 1,        // deletion
        d[i]![j - 1]! + 1,        // insertion
        d[i - 1]![j - 1]! + cost, // substitution
      );
      if (
        i > 1 && j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        v = Math.min(v, d[i - 2]![j - 2]! + 1); // transposition
      }
      d[i]![j] = v;
    }
  }
  return d[al]![bl]!;
}

// Allow more edits for longer words. Tuned conservatively so 4-char terms
// only tolerate 1 edit; 7+ chars tolerate 2.
function maxEditsFor(len: number): number {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  return 3;
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Score a single query token against a single field token.
function tokenScore(queryTok: string, fieldTok: string): number {
  if (!queryTok || !fieldTok) return 0;
  if (fieldTok === queryTok) return 1;
  if (fieldTok.startsWith(queryTok)) return 0.92;
  if (fieldTok.includes(queryTok)) return 0.78;

  const dist = damerauLevenshtein(queryTok, fieldTok);
  const tolerance = maxEditsFor(Math.max(queryTok.length, fieldTok.length));
  if (dist <= tolerance) {
    // 1 edit on a 6-char word → 0.83; 2 edits on a 7-char word → 0.71
    const maxLen = Math.max(queryTok.length, fieldTok.length);
    return Math.max(0, 1 - dist / maxLen) * 0.95;
  }

  const tri = trigramSimilarity(queryTok, fieldTok);
  return tri >= 0.45 ? tri * 0.7 : 0;
}

// Best score this query token achieves against any token in the field.
function bestTokenMatch(queryTok: string, fieldTokens: string[]): number {
  let best = 0;
  for (const ft of fieldTokens) {
    const s = tokenScore(queryTok, ft);
    if (s > best) best = s;
    if (best >= 1) break;
  }
  return best;
}

// Combined score across all query tokens. Average so multi-word queries
// require every token to match somewhere — single misspelled token still
// counts because tokenScore already handled the typo.
function fieldScore(queryTokens: string[], fieldTokens: string[]): number {
  if (queryTokens.length === 0 || fieldTokens.length === 0) return 0;
  let sum = 0;
  for (const qt of queryTokens) sum += bestTokenMatch(qt, fieldTokens);
  return sum / queryTokens.length;
}

export interface FuzzySearchable {
  thema?: string | null;
  message?: string | null;
}

export interface ScoredItem<T> { item: T; score: number; }

export function fuzzySearchQuestions<T extends FuzzySearchable>(
  items: readonly T[],
  query: string,
): T[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return items.slice();

  const scored: ScoredItem<T>[] = [];
  for (const it of items) {
    const themaTokens = tokenize(it.thema ?? '');
    const msgTokens = tokenize(it.message ?? '');

    const themaScore = fieldScore(queryTokens, themaTokens);
    const msgScore = fieldScore(queryTokens, msgTokens);

    // thema is the title → weighted higher than the body.
    const combined = themaScore * 0.7 + msgScore * 0.3;
    // But if the body has a strong hit and thema doesn't, don't drown it out.
    const best = Math.max(combined, themaScore * 0.9, msgScore * 0.6);

    if (best >= MIN_SCORE) scored.push({ item: it, score: best });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
