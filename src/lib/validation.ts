import { z } from "zod";

// 输入校验（Zod）：所有用户端 API 必须经过此层，避免脏数据写入数据库。

// 创建匿名参与者：不收集任何 PII，请求体允许为空。
export const createParticipantSchema = z.object({}).strict();

// 记录知情同意。
export const consentSchema = z.object({
  participantId: z.string().min(1),
  version: z.string().min(1).max(20),
});

// 单题作答：value 必须在 1..5（Likert 范围）。
export const responseItemSchema = z.object({
  itemId: z.string().min(1),
  value: z.number().int().min(1).max(5),
});

// 提交作答：participantId + 题目数组（至少 1 题）+ 可选粗粒度人口学（均为可选分桶）。
export const submitResponsesSchema = z.object({
  participantId: z.string().min(1),
  items: z.array(responseItemSchema).min(1).max(200),
  demographics: z
    .object({
      ageRange: z.string().max(20).optional(),
      gender: z.string().max(20).optional(),
      education: z.string().max(40).optional(),
    })
    .optional(),
});

// 管理端登录：只接受这两个字段（.strict() 拒绝多余键，避免被塞入额外属性）。
// max 长度用于把「超长输入」挡在常量时间比较之前，避免大字符串无谓地进哈希。
export const adminLoginSchema = z
  .object({
    username: z.string().min(1).max(200),
    password: z.string().min(1).max(400),
  })
  .strict();
