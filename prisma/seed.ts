// prisma/seed.ts
// 从 data/question-bank.json（配置驱动的单一事实源）载入量表与题目到数据库。
// 评分引擎不硬编码题目，新增 / 调整题目只需改 JSON，再重新 seed。

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const prisma = new PrismaClient();

type BankItem = { id: string; domain: string; reverse: boolean; text: string };
type BankScale = {
  key: string;
  name: string;
  /** 量表类别："personality" | "attitude"。由题库声明，评分引擎与前端均按它区分量表。 */
  type: string;
  source: string;
  domains: { key: string; name: string; itemIds: string[] }[];
  items: BankItem[];
  composite?: unknown;
};

async function main() {
  const bankPath = resolve(process.cwd(), "data", "question-bank.json");
  const bank = JSON.parse(readFileSync(bankPath, "utf-8")) as {
    meta: { likert: { options: unknown } };
    scales: BankScale[];
  };

  const likertOptions = JSON.stringify(bank.meta.likert.options);

  for (const scale of bank.scales) {
    // type 一律取自题库（单一事实源）。
    // 此处曾按 key 硬编码映射，而题库里没有该字段：结果是 DB 有 type，
    // 但评分引擎读到的 scale.type 是 undefined，前端按 type 找量表直接落空。
    // 现在缺字段就显式失败，不再静默写入 undefined。
    const type = scale.type;
    if (type !== "personality" && type !== "attitude") {
      throw new Error(
        `量表 "${scale.key}" 的 type 非法（实际为 ${JSON.stringify(type)}），` +
          `应为 "personality" 或 "attitude"。请修正 data/question-bank.json。`
      );
    }

    const created = await prisma.scale.upsert({
      where: { key: scale.key },
      update: { name: scale.name, type, description: scale.source },
      create: { key: scale.key, name: scale.name, type, description: scale.source },
    });

    for (let i = 0; i < scale.items.length; i++) {
      const it = scale.items[i];
      await prisma.item.upsert({
        where: { scaleId_code: { scaleId: created.id, code: it.id } },
        update: {
          text: it.text,
          reverse: it.reverse,
          domain: it.domain,
          orderIndex: i,
          options: likertOptions,
        },
        create: {
          scaleId: created.id,
          code: it.id,
          text: it.text,
          reverse: it.reverse,
          domain: it.domain,
          orderIndex: i,
          options: likertOptions,
        },
      });
    }

    console.log(`Seeded scale "${scale.key}": ${scale.items.length} items`);
  }

  const total = await prisma.item.count();
  const domains = await prisma.item.groupBy({ by: ["domain"], _count: true });
  console.log(`Total items in DB: ${total}`);
  console.log(
    "Domains:",
    domains.map((d) => `${d.domain}=${d._count}`).join(", ")
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
