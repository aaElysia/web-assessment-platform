import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 配置驱动的题库加载器：所有题目/维度/反向标记来自 data/question-bank.json，
// 评分引擎与 API 不硬编码题目。引擎只需改 JSON 即可扩展题目。

export type BankItem = {
  id: string;
  domain: string;
  reverse: boolean;
  text: string;
};

export type BankDomain = {
  key: string;
  name: string;
  itemIds: string[];
  polarity?: string;
};

export type BankScale = {
  key: string;
  name: string;
  source: string;
  type: string; // "personality" | "attitude"
  domains: BankDomain[];
  items: BankItem[];
  composite?: {
    key: string;
    /** 展示用中文名；缺失时回退到 key。 */
    label?: string;
    formula: string;
    range?: string;
    weighting?: string;
  };
};

export type LikertOption = { value: number; label: string };
export type Likert = {
  scale: number;
  minLabel: string;
  maxLabel: string;
  options: LikertOption[];
};

type Bank = { meta: { likert: Likert }; scales: BankScale[] };

export type BandTone = "low" | "medium" | "high";
export type BandText = Record<BandTone, string>;

export type Interpretations = {
  version: string;
  note?: string;
  /** 维度 key（O/C/E/A/N/PU/TR/WA/LA/CN）→ 分带文案。 */
  domains: Record<string, BandText>;
  /** 合成指数 key（如 ai_adoption_index）→ 分带文案。 */
  composites: Record<string, BandText>;
};

let cache: Bank | null = null;
let interpCache: Interpretations | null = null;

function load(): Bank {
  if (cache) return cache;
  const path = resolve(process.cwd(), "data", "question-bank.json");
  cache = JSON.parse(readFileSync(path, "utf-8")) as Bank;
  return cache;
}

/**
 * 解读文案与量表配置分离存放：
 *  - 心理措辞属于「内容」而非「逻辑」，应由心理测量学视角单独评审，不应埋在组件里；
 *  - 修改文案不需要动任何代码，也不会影响评分正确性。
 */
function loadInterpretations(): Interpretations {
  if (interpCache) return interpCache;
  const path = resolve(process.cwd(), "data", "interpretations.json");
  const raw = JSON.parse(readFileSync(path, "utf-8")) as Interpretations;
  interpCache = {
    version: raw.version,
    note: raw.note,
    domains: raw.domains ?? {},
    composites: raw.composites ?? {},
  };
  return interpCache;
}

export function getInterpretations(): Interpretations {
  return loadInterpretations();
}

/**
 * 取某维度在给定分带下的中性解读文案。
 * 找不到（维度未配文案 / 分带缺失）时返回 null —— 宁可少一句解读，也不临时编造一句。
 */
export function getDomainInterpretation(
  domainKey: string,
  tone: BandTone
): string | null {
  return loadInterpretations().domains[domainKey]?.[tone] ?? null;
}

/** 取某合成指数在给定分带下的解读文案；未配置时返回 null。 */
export function getCompositeInterpretation(
  compositeKey: string,
  tone: BandTone
): string | null {
  return loadInterpretations().composites[compositeKey]?.[tone] ?? null;
}

export function getScales(): BankScale[] {
  return load().scales;
}

export function getLikert(): Likert {
  return load().meta.likert;
}

export function getScaleByKey(key: string): BankScale | undefined {
  return getScales().find((s) => s.key === key);
}

// 给客户端前端的公开配置：不含评分公式，但包含 reverse 标记（供展示/调试）。
export function getPublicQuestionnaire() {
  const { scales, meta } = load();
  return {
    likert: meta.likert,
    scales: scales.map((s) => ({
      key: s.key,
      name: s.name,
      type: s.type,
      domains: s.domains.map((d) => ({
        key: d.key,
        name: d.name,
        polarity: d.polarity,
      })),
      items: s.items.map((it) => ({
        code: it.id,
        domain: it.domain,
        text: it.text,
        reverse: it.reverse,
      })),
    })),
  };
}

// 服务端评分用：itemId -> 元数据（便于从作答映射维度与反向标记）。
export function getItemIndex(): Record<
  string,
  { scaleKey: string; domain: string; reverse: boolean }
> {
  const out: Record<string, { scaleKey: string; domain: string; reverse: boolean }> = {};
  for (const s of getScales()) {
    for (const it of s.items) {
      out[it.id] = { scaleKey: s.key, domain: it.domain, reverse: it.reverse };
    }
  }
  return out;
}
