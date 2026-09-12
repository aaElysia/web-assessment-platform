# 评分系统审查问题修订单据

- **日期**：2026-09-12
- **依据**：`docs/scoring-review-2026-09-12.md`（审查报告）
- **原则**：只改解释层与呈现层口径，不改题目与反向逻辑；所有改动均有单测覆盖，248 项测试全绿，`next build` 通过。

---

## 已处理项

### P1（高）· 分带改为「量表中点相对」表述
- `src/lib/scoring/score.ts` `interpretBand` 标签由「相对偏低 / 中等 / 相对偏高」改为 **「低于中点 / 接近中点 / 高于中点」**，注释明确说明阈值是相对**量表中点 3.0**、**不代表人群百分位**。
- `src/app/api/results/[pid]/route.ts` 的 `interpretationNotes` 首条重写，明确「不代表你高于/低于大多数人」。
- `data/interpretations.json` `usage` 字段同步更新。
- 结果页免责声明（warning Alert）原本已声明「尚未建立常模」，保持不变。
- 新增单测：分带标签断言。

### P2（高）· CN 作为独立维度 + 合成指数降级为「探索性」
- 结构层面 CN **本就是独立维度**（题库 `ai_adoption.domains` 含 CN，结果页 AI 柱与解读已单独呈现），故核心诉求已天然满足。
- `data/question-bank.json` 的 `composite` 改名为 **「AI 采纳态度探索性指数（实验性）」**，公式与 weighting 字段更新为「仅表面效度、非已验证构念」。
- 结果页合成指数说明框改写为探索性表述，并提示「担忧」已单独成维度。
- `interpretationNotes` 新增一条，说明探索性指数性质。

### P3（中）· 合成指数等权（每域 0.2）
- `computeAiAdoptionIndex` 由「(正向均值 + 翻正CN)/2」改为 **五域（翻正CN）的算术平均 / 5**，使 PU/TR/WA/LA 与 CN **每域权重均等为 0.2**（旧公式下 CN 实际权重约为任一正向域的 4 倍）。
- 新增单测验证：仅抬升 CN 或仅抬升 PU，对指数的边际影响同为 0.2，证明等权。
- 同步更新 `score.test.ts` 中 3 处受公式影响的断言（2.5→2.8、3.0→4.2/1.8）。

### P4（中）· 轻量作答质量粗筛
- `src/lib/scoring/score.ts` 新增 `detectResponseQuality`：检测 **straightlining**（单一选项覆盖 ≥90% 有效作答）与 **low_discrimination**（标准差 < 0.25）。仅提示、不计分、不阻断。
- `ScoreResult` 新增 `qualityFlags`；`scoreAll` 写入；结果 API 透传并在 `interpretationNotes` 追加针对性提示；结果页新增温和 Alert。
- 新增单测覆盖：全同值触发、区分作答不触发、2 题不同值不误触发、`scoreAll` 透传。

### P5（中）· 短表信度局限提示
- `src/lib/admin/analysis.ts` `analyzeReliability` 的 `notes` 新增一条：AI 子维度仅 4 题、α 易偏低（<0.70）属短表固有局限，需结合「题目平均相关」与 Bootstrap 区间判断。

### P8（低·易改）· N 术语
- `data/question-bank.json` 中 N 维度名由「情绪敏感性 Neuroticism」改为 **「神经质 Neuroticism」**（保留英文对应，避免正向误读）。

### P9（低）· 完成度口径披露
- `interpretationNotes` 新增一条：完成度反映已答占比，不保证每维度计分；维度未计分时以该维度状态为准。

---

## 未改动项（维持原结论）
- **P6（分带阈值为经验值）**：代码注释已标注为启发式，维持。
- **P7（Likert 等距假设）**：人格研究通用惯例，维持。
- 反向重编码、维度均值、缺失策略、Cronbach α、Pearson r / t 分布 p 值——**计算层全部保持原样未动**，数值正确性已在审查中对照验证。

## 验证
- `vitest run`：**248 passed（15 files）**。
- `npm run vercel-build`（= 派生 Postgres schema → 生成 client → 生产自检 → next build）：**exit 0**，静态页与动态 API 均正常。
- 本地 Prisma Client 已切回 SQLite（不影响线上；线上由 `vercel-build` 用 Postgres schema 生成）。

## 提交
- 见 Git 提交 `chore(scoring): 落实审查报告 P1–P9 修正（中点相对分带/探索性指数/作答质量粗筛）`。
