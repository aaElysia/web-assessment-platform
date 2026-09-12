import { NextResponse } from "next/server";
import { getPublicQuestionnaire } from "@/lib/questionnaire/loader";

export const dynamic = "force-dynamic";

// GET /api/questionnaire
// 返回题库配置（量表、维度、题目文本、反向标记、Likert 选项）。
// 不含任何答案 / 评分公式，前端仅用于渲染问卷。
export async function GET() {
  return NextResponse.json(getPublicQuestionnaire());
}
