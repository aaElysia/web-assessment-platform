// 站点级配置（前端只读）。
//
// 反馈入口设计原则（UX 审查 P0-1）：
//  - 优先走「第三方问卷 / 邮件」，**零后端、零数据合规负担**，避免自建反馈表触碰隐私告知要求；
//  - 把下面的 feedbackUrl 换成你自己的即可：
//      · 想用邮件：  "mailto:你的邮箱?subject=心理测评平台反馈"
//      · 想用问卷：  "https://forms.gle/xxxx"（Google Form）/ 腾讯问卷链接 等
//  - 默认给一个占位 mailto，部署前请替换为真实地址，否则反馈会发到示例域名。

const feedbackEmail = "xyp123452022@qq.com";

export const SITE_CONFIG = {
  feedbackEmail,
  feedbackUrl: `mailto:${feedbackEmail}?subject=心理测评平台反馈`,
  feedbackLabel: "发邮件反馈",
} as const;
