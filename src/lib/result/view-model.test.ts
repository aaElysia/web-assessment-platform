import { describe, expect, it } from "vitest";
import type { ResultDomain, ResultPayload, ResultScale } from "@/lib/client/api";
import {
  findScaleByType,
  formatCompletion,
  formatScore,
  hasIncompleteDomains,
  isConcernDomain,
  toBarData,
  toRadarData,
} from "./view-model";

function domain(key: string, name: string, score: number | null, polarity?: string): ResultDomain {
  return {
    key,
    name,
    polarity,
    score,
    answered: score === null ? 2 : 8,
    total: 8,
    missing: score === null ? 6 : 0,
    imputed: false,
    incomplete: score === null,
    band: score === null ? null : { label: "中等", tone: "medium" },
    interpretation: null,
  };
}

const personality: ResultScale = {
  scaleKey: "big_five",
  scaleName: "大五人格",
  type: "personality",
  domains: [
    domain("O", "开放性", 3.5),
    domain("C", "尽责性", 4.0),
    domain("E", "外向性", 2.0),
    domain("A", "宜人性", 3.0),
    domain("N", "情绪敏感性", 3.25),
  ],
  composite: null,
};

const attitude: ResultScale = {
  scaleKey: "ai_adoption",
  scaleName: "AI 技术采纳态度",
  type: "attitude",
  domains: [
    domain("PU", "感知有用性", 4.0),
    domain("TR", "信任", 3.0),
    domain("WA", "采纳意愿", 3.5),
    domain("LA", "学习态度", 4.25),
    domain("CN", "对 AI 的担忧", 2.75, "higher = more concern"),
  ],
  composite: {
    key: "ai_adoption_index",
    label: "AI 采纳态度指数",
    formula: "( mean(PU, TR, WA, LA) + (6 - mean(CN)) ) / 2",
    score: 3.8125,
    band: { label: "相对偏高", tone: "high" },
    interpretation: null,
  },
};

const payload: ResultPayload = {
  scales: [personality, attitude],
  answeredTotal: 60,
  itemTotal: 60,
  completionRate: 1,
};

describe("view-model · 量表检索", () => {
  it("按 type 找到人格量表与态度量表", () => {
    expect(findScaleByType(payload, "personality")?.scaleKey).toBe("big_five");
    expect(findScaleByType(payload, "attitude")?.scaleKey).toBe("ai_adoption");
  });

  it("找不到时返回 null，而不是抛错或返回空对象", () => {
    expect(findScaleByType(payload, "nonexistent")).toBeNull();
    expect(findScaleByType(null, "personality")).toBeNull();
  });
});

describe("view-model · 雷达图数据", () => {
  it("固定输出 O,C,E,A,N 五个轴且顺序稳定", () => {
    const d = toRadarData(personality);
    expect(d.map((x) => x.key)).toEqual(["O", "C", "E", "A", "N"]);
  });

  it("缺失维度以 0 占位并标记 missing=true（轴集合不因缺分而收缩）", () => {
    const broken: ResultScale = {
      ...personality,
      domains: personality.domains.map((x) =>
        x.key === "E" ? { ...x, score: null, incomplete: true, band: null } : x
      ),
    };
    const d = toRadarData(broken);
    expect(d).toHaveLength(5);
    const e = d.find((x) => x.key === "E");
    expect(e?.score).toBe(0);
    expect(e?.missing).toBe(true);
    // 其余维度不受影响
    expect(d.find((x) => x.key === "O")?.missing).toBe(false);
  });

  it("量表为 null 时返回空数组（不渲染假图）", () => {
    expect(toRadarData(null)).toEqual([]);
  });
});

describe("view-model · AI 维度条形图数据", () => {
  it("按量表声明顺序输出，并给每根柱配色", () => {
    const d = toBarData(attitude);
    expect(d.map((x) => x.key)).toEqual(["PU", "TR", "WA", "LA", "CN"]);
    expect(d.every((x) => /^#[0-9a-f]{6}$/i.test(x.color))).toBe(true);
  });

  it("CN 被标记为反向语义维度（concern=true），其余为 false", () => {
    const d = toBarData(attitude);
    expect(d.find((x) => x.key === "CN")?.concern).toBe(true);
    expect(d.filter((x) => x.concern)).toHaveLength(1);
    expect(d.find((x) => x.key === "PU")?.concern).toBe(false);
  });

  it("数值不被翻转：CN 柱高仍等于原始维度分（反转只发生在合成指数里）", () => {
    const d = toBarData(attitude);
    expect(d.find((x) => x.key === "CN")?.score).toBe(2.75);
  });

  it("反向语义判定依据 polarity 配置，而非写死 key（配置漏填时 CN 仍有兜底）", () => {
    // 情形一：非 CN 的 key，但 polarity 明确声明 concern → 应识别
    expect(isConcernDomain({ key: "XX", polarity: "higher = more concern" })).toBe(true);
    // 情形二：CN 但 polarity 未填 → 兜底仍识别为反向维度，避免被当成正向展示
    expect(isConcernDomain({ key: "CN", polarity: undefined })).toBe(true);
    // 情形三：普通正向维度 → 不误判
    expect(isConcernDomain({ key: "PU", polarity: undefined })).toBe(false);
  });

  it("量表为 null 时返回空数组", () => {
    expect(toBarData(null)).toEqual([]);
  });
});

describe("view-model · incomplete 检测", () => {
  it("全部维度可评分时为 false", () => {
    expect(hasIncompleteDomains(payload)).toBe(false);
  });

  it("任一维度不可评分时为 true（用于全局警告）", () => {
    const broken: ResultPayload = {
      ...payload,
      scales: [
        {
          ...personality,
          domains: personality.domains.map((x) =>
            x.key === "N" ? { ...x, score: null, incomplete: true } : x
          ),
        },
      ],
    };
    expect(hasIncompleteDomains(broken)).toBe(true);
  });

  it("payload 为 null 时返回 false（不误报）", () => {
    expect(hasIncompleteDomains(null)).toBe(false);
  });
});

describe("view-model · 展示格式化", () => {
  it("分数保留两位小数，缺失显示破折号", () => {
    expect(formatScore(3.8125)).toBe("3.81");
    expect(formatScore(4)).toBe("4.00");
    expect(formatScore(null)).toBe("—");
    expect(formatScore(undefined)).toBe("—");
    expect(formatScore(Number.NaN)).toBe("—");
  });

  it("完成度转百分比整数", () => {
    expect(formatCompletion(1)).toBe("100%");
    expect(formatCompletion(0.5)).toBe("50%");
    expect(formatCompletion(null)).toBe("—");
  });
});
