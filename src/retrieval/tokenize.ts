/**
 * Bilingual tokenizer for BM25.
 *
 * Latin text is split into lower-cased words. CJK runs get two complementary views:
 * dictionary words from Intl.Segmenter (precise, but it splits domain terms such as
 * 双塔 into 双|塔) and overlapping character bigrams (recall for those terms). The mode
 * switch exists for retrieval ablations; the index and the query must use the same mode.
 */
export type TokenizerMode = "words" | "bigrams" | "both";

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;

const STOPWORDS = new Set([
  // English
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has", "have", "how",
  "i", "if", "in", "into", "is", "it", "its", "of", "on", "or", "that", "the", "their", "then",
  "there", "these", "this", "to", "was", "we", "what", "when", "which", "who", "why", "will",
  "with", "you",
  // Chinese function words
  "的", "了", "是", "在", "和", "与", "及", "或", "也", "都", "就", "而", "被", "把", "对", "从",
  "这", "那", "之", "其", "中", "上", "下", "个", "吗", "呢", "吧", "啊", "我", "你", "他", "她",
  "它", "们", "有", "没有", "什么", "怎么", "如何", "为什么", "一个", "这个", "那个", "哪些",
]); // prettier-ignore

const segmenter = new Intl.Segmenter("zh", { granularity: "word" });

export function normalizeText(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

export function tokenize(text: string, mode: TokenizerMode = "both"): string[] {
  const normalized = normalizeText(text);
  const tokens: string[] = [];
  const wordSpans = new Set<string>();

  if (mode !== "bigrams") {
    for (const { segment, index, isWordLike } of segmenter.segment(normalized)) {
      if (!isWordLike || STOPWORDS.has(segment)) continue;
      tokens.push(segment);
      if (CJK.test(segment)) wordSpans.add(`${index}:${segment.length}`);
    }
  } else {
    // Latin words still need splitting when only bigrams are used for CJK.
    for (const { segment, isWordLike } of segmenter.segment(normalized)) {
      if (isWordLike && !CJK.test(segment) && !STOPWORDS.has(segment)) tokens.push(segment);
    }
  }

  if (mode !== "words") {
    for (const run of normalized.matchAll(CJK_RUN)) {
      const chars = [...run[0]];
      const start = run.index;
      if (chars.length === 1 && mode === "bigrams" && !STOPWORDS.has(chars[0]!)) {
        tokens.push(chars[0]!);
        continue;
      }
      let offset = start;
      for (let i = 0; i + 1 < chars.length; i++) {
        const bigram = chars[i]! + chars[i + 1]!;
        // Skip a bigram that the segmenter already emitted as the same two-character word.
        if (!wordSpans.has(`${offset}:${bigram.length}`)) tokens.push(bigram);
        offset += chars[i]!.length;
      }
    }
  }

  return tokens;
}
