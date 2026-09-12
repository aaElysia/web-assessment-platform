/**
 * 登录失败限流（防在线暴力破解）。
 *
 * 实现取舍：
 *  - **只计数失败**，成功即清零；按「来源 IP」分桶。
 *  - 状态放在进程内存里。它是**单实例内的兜底**，不是分布式限流：
 *    多实例部署（如 Vercel 多并发函数）时各实例各算一份，攻击者可通过
 *    并发/冷启动绕过。因此它只用于抬高脚本爆破成本，
 *    真正的防线仍是强随机密码。
 *
 * Step 10 的决定（为什么**没有**把它改成持久化/分布式实现）：
 *  1. 想真正跨实例生效必须有**共享存储**（Redis/Upstash 之类）。在没有该依赖的前提下
 *     只能把它做成「看起来强、实则不生效」的假分布式，这比保持诚实更糟；
 *  2. 换成数据库计数会引入一个**跨轮次累积**的副作用：E2E 每轮都会故意失败几次登录，
 *     计数会跨轮累加，几天后测试就会被自己触发的 429 打挂（测试污染）；
 *  3. 加「全局失败上限」看似更强，实则给单管理员系统引入**自锁 DoS**：
 *     攻击者狂发失败即可把管理员一起锁在门外，而按 IP 分桶本来没有这个问题；
 *  4. 加人为响应延迟会增加 serverless 计费时长，反而是被攻击时的成本放大器。
 *
 * 因此本模块保持「按 IP、进程内、只抬高爆破成本」的定位，并在 SECURITY.md 中把
 * 「平台侧限流/WAF 才是主防线」写清楚。已记入交接文档待办。
 *  - 提供 `now` 注入，便于单测确定性地推进时钟，不依赖真实等待。
 */

export type ThrottleOptions = {
  /** 窗口内允许的失败次数上限。 */
  maxFailures?: number;
  /** 统计窗口长度（毫秒）。 */
  windowMs?: number;
  /** 最多保留多少个来源键，防止被伪造 IP 撑爆内存。 */
  maxKeys?: number;
};

export type ThrottleVerdict = {
  allowed: boolean;
  /** 剩余可失败次数。 */
  remaining: number;
  /** 被拒时建议的重试等待秒数（用于 Retry-After）。 */
  retryAfterSec: number;
};

export type LoginThrottle = {
  check(key: string, now?: number): ThrottleVerdict;
  recordFailure(key: string, now?: number): void;
  reset(key: string): void;
  /** 当前跟踪的来源数量（测试与观测用）。 */
  size(): number;
};

export function createLoginThrottle(
  options: ThrottleOptions = {}
): LoginThrottle {
  const maxFailures = options.maxFailures ?? 20;
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const maxKeys = options.maxKeys ?? 5000;

  const failures = new Map<string, number[]>();

  /** 丢掉窗口外的旧记录；顺带清理空桶，避免 Map 无限增长。 */
  function active(key: string, now: number): number[] {
    const arr = (failures.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length > 0) failures.set(key, arr);
    else failures.delete(key);
    return arr;
  }

  function evictIfNeeded() {
    while (failures.size >= maxKeys) {
      const oldest = failures.keys().next();
      if (oldest.done) break;
      failures.delete(oldest.value);
    }
  }

  return {
    check(key, now = Date.now()) {
      const arr = active(key, now);
      if (arr.length < maxFailures) {
        return { allowed: true, remaining: maxFailures - arr.length, retryAfterSec: 0 };
      }
      // arr[0] 是最早一次失败，窗口过去后它就会过期。
      const waitMs = windowMs - (now - arr[0]!);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil(waitMs / 1000)),
      };
    },

    recordFailure(key, now = Date.now()) {
      evictIfNeeded();
      const arr = active(key, now);
      arr.push(now);
      failures.set(key, arr);
    },

    reset(key) {
      failures.delete(key);
    },

    size() {
      return failures.size;
    },
  };
}
