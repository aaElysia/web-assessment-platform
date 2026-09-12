import { describe, expect, it } from "vitest";
import { getScales } from "@/lib/questionnaire/loader";
import type { Answers } from "@/lib/scoring/score";
import type { AdminRecord } from "./types";
import {
  buildExportTable,
  buildHistogram,
  buildRawExportTable,
  computeAdminStats,
  csvCell,
  elapsedSecOf,
  formatDuration,
  median,
  summarizeDomains,
  summarizeIndex,
  toCsv,
} from "./stats";

/**
 * 管理端统计聚合的单测。
 * 重点不在「均值算得对不对」（那由评分引擎的测试覆盖），而在
 * **样本量口径与缺失语义**：n、sd、null 与 0 的区别，以及导出安全性。
 */

const T0 = new Date(Date.UTC(2026, 8, 12, 2, 0, 0));

/** 按维度指定目标分（自动处理反向题，使最终维度分等于目标值）。 */
function answersByDomain(target: Record<string, number | null>): Answers {
  const out: Answers = {};
  for (const scale of getScales()) {
    for (const item of scale.items) {
      const want = target[item.domain];
      if (want === null || want === undefined) continue; // 留空 = 缺失
      out[item.id] = item.reverse ? 6 - want : want;
    }
  }
  return out;
}

function record(
  id: string,
  overrides: Partial<AdminRecord> & { answers?: Answers | null; completedAt?: Date | null; createdAt?: Date } = {}
): AdminRecord {
  const { answers, completedAt, createdAt, ...rest } = overrides;
  const hasSession = answers !== undefined ? answers !== null : false;
  return {
    id,
    createdAt: createdAt ?? T0,
    status: hasSession ? "completed" : "created",
    consentAt: hasSession ? T0 : null,
    ageRange: null,
    gender: null,
    education: null,
    ...rest,
    session: hasSession
      ? {
          startedAt: completedAt ?? T0,
          completedAt: completedAt === undefined ? new Date(T0.getTime() + 120_000) : completedAt,
          answers: answers!,
        }
      : null,
  };
}

const O_ITEMS = getScales()[0]!.items.filter((i) => i.domain === "O");

describe("median / formatDuration / 直方图 基础函数", () => {
  it("median：奇数取中位、偶数取均值、空数组为 null", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
  });

  it("formatDuration 输出可读文本，null 显示为 —", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(45)).toBe("45 秒");
    expect(formatDuration(120)).toBe("2 分");
    expect(formatDuration(125)).toBe("2 分 5 秒");
    expect(formatDuration(3600)).toBe("1 小时");
    expect(formatDuration(3900)).toBe("1 小时 5 分");
    expect(formatDuration(-10)).toBe("0 秒");
  });

  it("直方图：8 箱等宽 0.5，边界值分别归入首箱与末箱", () => {
    const bins = buildHistogram([1, 5, 3, 3]);
    expect(bins).toHaveLength(8);
    expect(bins[0]!.label).toBe("1.0–1.5");
    expect(bins[7]!.label).toBe("4.5–5.0");
    expect(bins[0]!.count).toBe(1); // 1.0
    expect(bins[7]!.count).toBe(1); // 5.0 归末箱
    // 3.0 归属 [3.0, 3.5) 这一箱
    expect(bins.find((b) => b.label === "3.0–3.5")!.count).toBe(2);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(4);
  });

  it("直方图忽略非有限值，不静默计入", () => {
    const bins = buildHistogram([2, Number.NaN, Number.POSITIVE_INFINITY]);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(1);
  });
});

describe("空数据", () => {
  const stats = computeAdminStats([]);

  it("总量为 0，完成率为 null（不是 0%）", () => {
    expect(stats.totals).toEqual({ participants: 0, consented: 0, completed: 0 });
    expect(stats.completionRate).toBeNull();
    expect(stats.latestCompletedAt).toBeNull();
    expect(stats.elapsed).toEqual({ n: 0, meanSec: null, medianSec: null });
  });

  it("所有维度 mean / sd 为 null 且 n = 0（不写 0 分）", () => {
    expect(stats.domains).toHaveLength(10);
    expect(stats.domains.every((d) => d.mean === null && d.sd === null && d.n === 0)).toBe(true);
  });

  it("合成指数为空但直方图结构完整", () => {
    expect(stats.index.n).toBe(0);
    expect(stats.index.mean).toBeNull();
    expect(stats.index.histogram).toHaveLength(8);
  });

  it("给出「尚无数据」提示，且恒定边界说明非空", () => {
    expect(stats.warnings.join("|")).toContain("尚未收集到任何数据");
    expect(stats.notes.length).toBeGreaterThanOrEqual(4);
  });
});

describe("样本量与 n 的口径", () => {
  it("只创建未作答者计入参与人数，但不算完成人数", () => {
    const stats = computeAdminStats([
      record("a"), // 仅创建
      record("b", { answers: answersByDomain({ O: 3 }) }), // 仅答 O
    ]);
    expect(stats.totals.participants).toBe(2);
    expect(stats.totals.consented).toBe(1);
    expect(stats.totals.completed).toBe(1);
    expect(stats.completionRate).toBe(0.5);
  });

  it("n=1 时 sd 为 null，n=2 且同值时为 0 —— 「无法估计」与「无差异」不可混同", () => {
    const one = computeAdminStats([record("a", { answers: answersByDomain({ O: 3 }) })]);
    const o1 = one.domains.find((d) => d.key === "O")!;
    expect(o1.n).toBe(1);
    expect(o1.mean).toBe(3);
    expect(o1.sd).toBeNull();

    const two = computeAdminStats([
      record("a", { answers: answersByDomain({ O: 3 }) }),
      record("b", { answers: answersByDomain({ O: 3 }) }),
    ]);
    const o2 = two.domains.find((d) => d.key === "O")!;
    expect(o2.n).toBe(2);
    expect(o2.sd).toBe(0);
  });

  it("逐维 n 不同：某维度缺 2 题即不可用，其它维度不受影响", () => {
    // 构造：答满 O 与 C，但 O 少答 2 题（> 1 题 → 该维度 incomplete）
    const partial = answersByDomain({ O: 4, C: 4 });
    delete partial[O_ITEMS[0]!.id];
    delete partial[O_ITEMS[1]!.id];

    const stats = computeAdminStats([record("a", { answers: partial })]);
    const o = stats.domains.find((d) => d.key === "O")!;
    const c = stats.domains.find((d) => d.key === "C")!;
    expect(o.n).toBe(0);
    expect(o.mean).toBeNull();
    expect(c.n).toBe(1);
    expect(c.mean).toBe(4);
  });

  it("缺 1 题按引擎口径以维度均值填补，仍计入 n", () => {
    const partial = answersByDomain({ O: 4 });
    delete partial[O_ITEMS[0]!.id];
    const stats = computeAdminStats([record("a", { answers: partial })]);
    const o = stats.domains.find((d) => d.key === "O")!;
    expect(o.n).toBe(1);
    expect(o.mean).toBe(4);
  });

  it("小样本触发不稳定告警，且明写样本量", () => {
    const stats = computeAdminStats([record("a", { answers: answersByDomain({ O: 3 }) })]);
    const joined = stats.warnings.join("|");
    expect(joined).toContain("n=1");
    expect(joined).toContain("不可用于推断总体");
  });
});

describe("分带计数与合成指数", () => {
  it("三个分带各自计数正确", () => {
    const stats = computeAdminStats([
      record("hi", { answers: answersByDomain({ O: 5 }) }),
      record("mid", { answers: answersByDomain({ O: 3 }) }),
      record("lo", { answers: answersByDomain({ O: 1 }) }),
    ]);
    const o = stats.domains.find((d) => d.key === "O")!;
    expect(o.bands).toEqual({ high: 1, medium: 1, low: 1 });
    expect(o.n).toBe(3);
    expect(o.mean).toBe(3);
  });

  it("合成指数：分维度齐全时才可算，缺一维即为 null 且不计入 n", () => {
    const complete = computeAdminStats([
      record("a", {
        answers: answersByDomain({
          O: 3, C: 3, E: 3, A: 3, N: 3,
          PU: 4, TR: 4, WA: 4, LA: 4, CN: 2,
        }),
      }),
    ]);
    // (mean(4,4,4,4) + (6-2)) / 2 = (4 + 4)/2 = 4
    expect(complete.index.n).toBe(1);
    expect(complete.index.mean).toBe(4);
    expect(complete.index.formula).toContain("CN");

    const incomplete = computeAdminStats([
      record("b", { answers: answersByDomain({ PU: 4, TR: 4, WA: 4, LA: 4 }) }), // 缺 CN
    ]);
    expect(incomplete.index.n).toBe(0);
    expect(incomplete.index.mean).toBeNull();
  });

  it("summarizeDomains / summarizeIndex 可直接调用（默认自行评分）", () => {
    const records = [record("a", { answers: answersByDomain({ O: 3 }) })];
    expect(summarizeDomains(records).find((d) => d.key === "O")!.mean).toBe(3);
    expect(summarizeIndex(records).n).toBe(0);
  });
});

describe("耗时与最新提交", () => {
  it("端到端耗时取「创建 ID → 提交」的均值与中位数", () => {
    const stats = computeAdminStats([
      record("a", {
        answers: answersByDomain({ O: 3 }),
        createdAt: T0,
        completedAt: new Date(T0.getTime() + 60_000),
      }),
      record("b", {
        answers: answersByDomain({ O: 3 }),
        createdAt: T0,
        completedAt: new Date(T0.getTime() + 180_000),
      }),
    ]);
    expect(stats.elapsed.n).toBe(2);
    expect(stats.elapsed.meanSec).toBe(120);
    expect(stats.elapsed.medianSec).toBe(120);
    expect(stats.latestCompletedAt).toBe(new Date(T0.getTime() + 180_000).toISOString());
  });

  it("时钟异常（完成早于创建）不产生负数耗时", () => {
    const stats = computeAdminStats([
      record("a", {
        answers: answersByDomain({ O: 3 }),
        createdAt: T0,
        completedAt: new Date(T0.getTime() - 5000),
      }),
    ]);
    expect(stats.elapsed.n).toBe(0);
    expect(stats.elapsed.meanSec).toBeNull();
  });

  it("未完成会话不计入最新提交时间", () => {
    const stats = computeAdminStats([record("a")]);
    expect(stats.latestCompletedAt).toBeNull();
  });

  it("耗时中位数过短时提示「疑似脚本提交」而非默认它是真人作答", () => {
    const human = computeAdminStats([
      record("a", {
        answers: answersByDomain({ O: 3 }),
        createdAt: T0,
        completedAt: new Date(T0.getTime() + 300_000), // 5 分钟
      }),
    ]);
    expect(human.warnings.join("|")).not.toContain("疑似");
    expect(human.warnings.join("|")).not.toContain("不足 5 秒");

    const scripted = computeAdminStats([
      record("a", {
        answers: answersByDomain({ O: 3 }),
        createdAt: T0,
        completedAt: new Date(T0.getTime() + 100), // 0.1 秒
      }),
    ]);
    expect(scripted.warnings.join("|")).toContain("不足 5 秒");
  });
});

describe("CSV 导出", () => {
  it("公式注入被中和（= + - @ 与制表符开头）", () => {
    expect(csvCell("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\t=1+1")).toBe("'\t=1+1");
  });

  it("含逗号 / 引号 / 换行的值被正确引用与转义", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("null / undefined / 非有限数输出为空单元格", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
    expect(csvCell(Number.POSITIVE_INFINITY)).toBe("");
    expect(csvCell(0)).toBe("0");
  });

  it("表头含全部 10 个维度、合成指数与收尾列，且不含任何 PII 列名", () => {
    const table = buildExportTable([]);
    for (const k of ["O", "C", "E", "A", "N", "PU", "TR", "WA", "LA", "CN"]) {
      expect(table.header).toContain(k);
    }
    expect(table.header).toContain("ai_adoption_index");
    expect(table.header).toContain("completion_rate");

    // 逐列精确比对（不能简单用子串，否则 participant_id 会误命中 "ip"）
    const banned = [
      "name",
      "email",
      "phone",
      "ip",
      "ip_address",
      "address",
      "cookie",
      "user_agent",
      "device",
      "birthday",
      "student_id",
    ];
    for (const col of table.header) {
      expect(banned).not.toContain(col.toLowerCase());
    }
    // 再补一层子串检查（覆盖 full_name / email_address 之类变体）
    const joined = table.header.join(",").toLowerCase();
    for (const token of ["email", "phone", "address", "cookie", "user_agent", "birthday"]) {
      expect(joined).not.toContain(token);
    }
  });

  it("不可用维度导出为空字符串（不是 0）", () => {
    const table = buildExportTable([record("a", { answers: answersByDomain({ O: 5 }) })]);
    const row = table.rows[0]!;
    const oIdx = table.header.indexOf("O");
    const cIdx = table.header.indexOf("C");
    expect(row[oIdx]).toBe("5.0000");
    expect(row[cIdx]).toBe("");
    expect(row[table.header.indexOf("ai_adoption_index")]).toBe("");
  });

  it("已完成行给出作答进度与完成率", () => {
    const table = buildExportTable([
      record("a", { answers: answersByDomain({ O: 3, C: 3 }) }),
    ]);
    const row = table.rows[0]!;
    const value = (col: string) => row[table.header.indexOf(col)];
    expect(value("answered_items")).toBe("16");
    expect(value("item_total")).toBe("60");
    expect(Number(value("completion_rate"))).toBeCloseTo(0.2667, 4);
  });

  it("仅创建未作答的行整行为空值而非缺列", () => {
    const table = buildExportTable([record("a")]);
    const row = table.rows[0]!;
    expect(row).toHaveLength(table.header.length);
    expect(row[table.header.indexOf("completion_rate")]).toBe("");
    expect(row[table.header.indexOf("status")]).toBe("created");
    expect(row[table.header.indexOf("age_range")]).toBe("");
  });

  it("人口学自由文本经转义后不会破坏 CSV 结构", () => {
    const table = buildExportTable([
      {
        ...record("a", { answers: answersByDomain({ O: 3 }) }),
        ageRange: "=HYPERLINK(\"http://evil\")",
        gender: "a,b",
        education: 'he said "hi"',
      },
    ]);
    const csv = toCsv(table);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"he said ""hi"""');
    // 结构完整：每一行的字段数 = 表头字段数
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]!.split(",")).toHaveLength(table.header.length);
  });

  it("使用 CRLF 换行并保留中文 / 空表尾", () => {
    const table = buildExportTable([]);
    const csv = toCsv(table);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(2); // 表头 + 末尾空串
  });
});

describe("原始作答导出（供独立交叉验证）", () => {
  it("表头 = 匿名元数据 + 按题库顺序的全部题目 code，且不含维度分列", () => {
    const table = buildRawExportTable([]);
    const codes = getScales().flatMap((s) => s.items.map((i) => i.id));
    expect(table.header.slice(-codes.length)).toEqual(codes);
    expect(table.header).toContain("participant_id");
    // 刻意不输出维度分：否则复核者可能直接拿程序算好的值充当"独立"结果
    for (const k of ["O", "C", "E", "A", "N", "PU", "TR", "WA", "LA", "CN"]) {
      expect(table.header).not.toContain(k);
    }
  });

  it("值是**原始**作答（反向题不预先翻转），未作答留空", () => {
    const answers = answersByDomain({ O: 5 }); // 反向题在此 helper 中会被反成 1
    const table = buildRawExportTable([record("a", { answers })]);
    const row = table.rows[0]!;
    const bigFive = getScales().find((s) => s.key === "big_five")!;
    const reversed = bigFive.items.filter((i) => i.domain === "O" && i.reverse);
    expect(reversed.length).toBeGreaterThan(0);
    for (const it of reversed) {
      // 导出的是原始值 1（而非重编码后的 5）——否则复核者会重复翻转一次
      expect(row[table.header.indexOf(it.id)]).toBe("1");
    }
    // 未作答的题目留空（不是 0）
    expect(row[table.header.indexOf("PU1")]).toBe("");
  });

  it("行数与参与者数一致，且不含任何 PII 列", () => {
    const table = buildRawExportTable([
      record("a", { answers: answersByDomain({ O: 3 }) }),
      record("b"),
    ]);
    expect(table.rows).toHaveLength(2);
    const joined = table.header.join(",").toLowerCase();
    for (const bad of ["name", "email", "phone", "cookie", "user_agent"]) {
      expect(joined).not.toContain(bad);
    }
  });
});

describe("elapsedSecOf", () => {
  it("无完成时间 → null（不写 0）", () => {
    expect(elapsedSecOf(record("a"))).toBeNull();
  });

  it("完成时间早于创建时间（脏数据）→ null，不产生负数", () => {
    const dirty = record("a", {
      answers: answersByDomain({ O: 3 }),
      completedAt: new Date(T0.getTime() - 60_000),
    });
    expect(elapsedSecOf(dirty)).toBeNull();
  });

  it("正常情形返回四舍五入的秒数", () => {
    const ok = record("a", {
      answers: answersByDomain({ O: 3 }),
      completedAt: new Date(T0.getTime() + 125_400),
    });
    expect(elapsedSecOf(ok)).toBe(125);
  });
});
