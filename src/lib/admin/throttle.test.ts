import { describe, expect, it } from "vitest";
import { createLoginThrottle } from "./throttle";

const T0 = Date.UTC(2026, 8, 12, 6, 0, 0);

describe("登录失败限流", () => {
  it("默认策略：窗口内 20 次失败以内放行，第 21 次起拒绝", () => {
    const t = createLoginThrottle();
    for (let i = 0; i < 20; i++) {
      expect(t.check("1.2.3.4", T0).allowed).toBe(true);
      t.recordFailure("1.2.3.4", T0);
    }
    const verdict = t.check("1.2.3.4", T0);
    expect(verdict.allowed).toBe(false);
    expect(verdict.remaining).toBe(0);
    expect(verdict.retryAfterSec).toBe(15 * 60);
  });

  it("不同来源互不影响", () => {
    const t = createLoginThrottle({ maxFailures: 2 });
    t.recordFailure("a", T0);
    t.recordFailure("a", T0);
    expect(t.check("a", T0).allowed).toBe(false);
    expect(t.check("b", T0).allowed).toBe(true);
  });

  it("窗口滑出后自动恢复", () => {
    const t = createLoginThrottle({ maxFailures: 2, windowMs: 60_000 });
    t.recordFailure("a", T0);
    t.recordFailure("a", T0 + 10_000);
    expect(t.check("a", T0 + 20_000).allowed).toBe(false);

    // 再等 50 秒：最早那次（T0）已滑出窗口，只剩 1 次失败。
    expect(t.check("a", T0 + 61_000).allowed).toBe(true);
    expect(t.check("a", T0 + 61_000).remaining).toBe(1);
  });

  it("成功登录后清零，不再累计历史失败", () => {
    const t = createLoginThrottle({ maxFailures: 3 });
    t.recordFailure("a", T0);
    t.recordFailure("a", T0);
    t.reset("a");
    expect(t.check("a", T0).remaining).toBe(3);
  });

  it("retryAfterSec 随窗口推进而递减，且至少为 1 秒", () => {
    const t = createLoginThrottle({ maxFailures: 1, windowMs: 60_000 });
    t.recordFailure("a", T0);
    expect(t.check("a", T0).retryAfterSec).toBe(60);
    expect(t.check("a", T0 + 59_500).retryAfterSec).toBe(1);
  });

  it("来源键数量有上限，超限时淘汰最早插入的键（防内存膨胀）", () => {
    const t = createLoginThrottle({ maxFailures: 5, maxKeys: 3 });
    t.recordFailure("a", T0);
    t.recordFailure("b", T0);
    t.recordFailure("c", T0);
    t.recordFailure("d", T0); // 触发淘汰
    expect(t.size()).toBeLessThanOrEqual(3);
    expect(t.check("d", T0).remaining).toBe(4);
  });

  it("过期键会被清理（size 不随时间无界增长）", () => {
    const t = createLoginThrottle({ maxFailures: 5, windowMs: 1000 });
    t.recordFailure("a", T0);
    t.recordFailure("b", T0);
    expect(t.size()).toBe(2);
    t.check("c", T0 + 5000); // 触发 b/a 桶的惰性清理（仅清理被访问的键）
    expect(t.check("a", T0 + 5000).remaining).toBe(5);
  });
});
