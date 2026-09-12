import { createLoginThrottle } from "./throttle";

/**
 * 登录限流的**进程内单例**。
 *
 * 放在独立模块里而不是 login route 文件里，是为了让生命周期明确可见：
 * Next 在开发模式下会热重载 route 模块，模块级单例可能被重建；
 * 这只影响限流计数器（最坏情况是被重置一次），不影响鉴权正确性。
 *
 * 已知局限：多实例部署时各实例独立计数，攻击者可通过并发分散绕过。
 * 它只用于抬高脚本爆破成本，真正的防线是强随机密码。
 */
export const loginThrottle = createLoginThrottle({
  maxFailures: 20,
  windowMs: 15 * 60 * 1000,
  maxKeys: 5000,
});
