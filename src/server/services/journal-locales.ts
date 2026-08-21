import type { Locale } from "../../shared/i18n";

type Data = Record<string, unknown>;

const titles: Record<Exclude<Locale, "ru">, Record<string, string>> = {
  en: {
    "connection.created": "Connection created",
    "connection.updated": "Connection updated",
    "connection.activated": "Connection ready",
    "connection.rotation_started": "Credential rotation started",
    "connection.rotated": "Credentials rotated",
    "connection.rotation_failed": "Credential rotation failed",
    "connection.archived": "Connection archived",
    "connection.first_used": "Link used for the first time",
    "connection.first_seen": "Connection active for the first time",
    "connection.offline_long": "Connection has not been used for a while",
    "connection.returned": "Connection active again",
    "routes.published": "Route revision #{version} published",
    "routes.rolled_back": "Routes rolled back to revision #{version}",
    "routes.neutralized": "Regional system routes removed",
    "rulesets.updated": "GeoIP/Geosite updated to {version}",
    "rulesets.update_failed": "GeoIP/Geosite update failed",
    "engine.order_changed": "Engine connection order changed",
    "engine.config_applied": "{engine} configuration applied",
    "engine.config_rolled_back": "{engine} configuration restored",
    "engine.telemetry_unavailable": "{engine} telemetry unavailable",
    "engine.telemetry_restored": "{engine} telemetry restored",
    "backup.started": "Backup started",
    "backup.created": "Backup created",
    "backup.failed": "Backup failed",
    "auth.login_succeeded": "Owner signed in",
    "passkey.registered": "Passkey registered",
    "passkey.revoked": "Passkey revoked",
    "session.revoked": "Session ended",
    "sessions.revoked_others": "Other sessions ended",
    "token.created": "API token created",
    "token.revoked": "API token revoked",
    "bootstrap.reset": "Owner setup reset",
    "system.disk_warning": "Disk space is running low",
    "system.disk_critical": "Disk space is critically low",
    "system.disk_restored": "Free disk space restored",
    "system.tls_warning": "TLS certificate expires soon",
    "system.tls_critical": "TLS certificate needs an urgent renewal",
    "system.tls_restored": "TLS certificate is healthy again",
  },
  "zh-CN": {
    "connection.created": "已创建连接",
    "connection.updated": "已更新连接",
    "connection.activated": "连接已就绪",
    "connection.rotation_started": "已开始轮换凭据",
    "connection.rotated": "已轮换凭据",
    "connection.rotation_failed": "凭据轮换失败",
    "connection.archived": "连接已归档",
    "connection.first_used": "链接首次使用",
    "connection.first_seen": "连接首次活跃",
    "connection.offline_long": "连接已有一段时间未使用",
    "connection.returned": "连接再次活跃",
    "routes.published": "已发布路由修订版 #{version}",
    "routes.rolled_back": "路由已回滚到修订版 #{version}",
    "routes.neutralized": "已删除区域系统路由",
    "rulesets.updated": "GeoIP/Geosite 已更新至 {version}",
    "rulesets.update_failed": "GeoIP/Geosite 更新失败",
    "engine.order_changed": "已更改引擎连接顺序",
    "engine.config_applied": "已应用 {engine} 配置",
    "engine.config_rolled_back": "已恢复 {engine} 配置",
    "engine.telemetry_unavailable": "{engine} 遥测不可用",
    "engine.telemetry_restored": "{engine} 遥测已恢复",
    "backup.started": "已开始创建备份",
    "backup.created": "已创建备份",
    "backup.failed": "备份失败",
    "auth.login_succeeded": "所有者已登录",
    "passkey.registered": "已注册通行密钥",
    "passkey.revoked": "已撤销通行密钥",
    "session.revoked": "会话已结束",
    "sessions.revoked_others": "其他会话已结束",
    "token.created": "已创建 API 令牌",
    "token.revoked": "已撤销 API 令牌",
    "bootstrap.reset": "已重置所有者设置",
    "system.disk_warning": "磁盘空间即将不足",
    "system.disk_critical": "磁盘空间严重不足",
    "system.disk_restored": "磁盘可用空间已恢复",
    "system.tls_warning": "TLS 证书即将过期",
    "system.tls_critical": "TLS 证书需要紧急更新",
    "system.tls_restored": "TLS 证书已恢复正常",
  },
  fa: {
    "connection.created": "اتصال ایجاد شد",
    "connection.updated": "اتصال به‌روزرسانی شد",
    "connection.activated": "اتصال آماده است",
    "connection.rotation_started": "تعویض اطلاعات اتصال آغاز شد",
    "connection.rotated": "اطلاعات اتصال تعویض شد",
    "connection.rotation_failed": "تعویض اطلاعات اتصال ناموفق بود",
    "connection.archived": "اتصال بایگانی شد",
    "connection.first_used": "پیوند برای نخستین بار استفاده شد",
    "connection.first_seen": "اتصال برای نخستین بار فعال شد",
    "connection.offline_long": "مدتی است از اتصال استفاده نشده",
    "connection.returned": "اتصال دوباره فعال شد",
    "routes.published": "بازبینی مسیر #{version} منتشر شد",
    "routes.rolled_back": "مسیرها به بازبینی #{version} بازگردانده شدند",
    "routes.neutralized": "مسیرهای منطقه‌ای سیستم حذف شدند",
    "rulesets.updated": "GeoIP/Geosite به {version} به‌روزرسانی شد",
    "rulesets.update_failed": "به‌روزرسانی GeoIP/Geosite ناموفق بود",
    "engine.order_changed": "ترتیب اتصال موتور‌ها تغییر کرد",
    "engine.config_applied": "پیکربندی {engine} اعمال شد",
    "engine.config_rolled_back": "پیکربندی {engine} بازیابی شد",
    "engine.telemetry_unavailable": "داده‌های دورسنجی {engine} در دسترس نیست",
    "engine.telemetry_restored": "داده‌های دورسنجی {engine} بازیابی شد",
    "backup.started": "تهیهٔ پشتیبان آغاز شد",
    "backup.created": "نسخهٔ پشتیبان ایجاد شد",
    "backup.failed": "تهیهٔ پشتیبان ناموفق بود",
    "auth.login_succeeded": "مالک وارد پنل شد",
    "passkey.registered": "کلید عبور ثبت شد",
    "passkey.revoked": "کلید عبور لغو شد",
    "session.revoked": "نشست پایان یافت",
    "sessions.revoked_others": "نشست‌های دیگر پایان یافتند",
    "token.created": "توکن API ایجاد شد",
    "token.revoked": "توکن API لغو شد",
    "bootstrap.reset": "راه‌اندازی مالک بازنشانی شد",
    "system.disk_warning": "فضای دیسک رو به اتمام است",
    "system.disk_critical": "فضای دیسک بسیار کم است",
    "system.disk_restored": "فضای آزاد دیسک بازیابی شد",
    "system.tls_warning": "گواهی TLS به‌زودی منقضی می‌شود",
    "system.tls_critical": "گواهی TLS به تمدید فوری نیاز دارد",
    "system.tls_restored": "گواهی TLS دوباره سالم است",
  },
};

const actors: Record<Exclude<Locale, "ru">, Record<string, string>> = {
  en: { "Владелец": "Owner", "Система": "System", "Командная строка сервера": "Server command line", "Мониторинг": "Monitoring", "Телеметрия": "Telemetry", "Демо-режим": "Demo mode", "Неизвестный источник": "Unknown source" },
  "zh-CN": { "Владелец": "所有者", "Система": "系统", "Командная строка сервера": "服务器命令行", "Мониторинг": "监控", "Телеметрия": "遥测", "Демо-режим": "演示模式", "Неизвестный источник": "未知来源" },
  fa: { "Владелец": "مالک", "Система": "سیستم", "Командная строка сервера": "خط فرمان سرور", "Мониторинг": "پایش", "Телеметрия": "دورسنجی", "Демо-режим": "حالت نمایشی", "Неизвестный источник": "منبع ناشناخته" },
};

export function journalPresentation(type: string, data: Data, language: Locale, fallbackTitle: string, fallbackDescription: string) {
  if (language === "ru") return { title: fallbackTitle, description: fallbackDescription };
  const template = titles[language][type] ?? operationTitle(type, data, language) ?? type;
  const title = interpolate(template, data);
  return { title, description: description(data, language, fallbackDescription) };
}

export function journalActor(label: string, language: Locale) {
  if (language === "ru") return label;
  if (label.startsWith("API-токен «")) return `${language === "en" ? "API token" : language === "zh-CN" ? "API 令牌" : "توکن API"} ${label.slice(10)}`;
  return actors[language][label] ?? label;
}

function operationTitle(type: string, data: Data, language: Exclude<Locale, "ru">) {
  const service = String(data.service ?? "");
  const engine = engineName(data.engine);
  const templates = {
    en: { started: "{name} started", succeeded: "{name} completed", failed: "{name} failed", unavailable: "{name} unavailable", restored: "{name} restored" },
    "zh-CN": { started: "已开始{name}", succeeded: "已完成{name}", failed: "{name}失败", unavailable: "{name}不可用", restored: "{name}已恢复" },
    fa: { started: "{name} آغاز شد", succeeded: "{name} انجام شد", failed: "{name} ناموفق بود", unavailable: "{name} در دسترس نیست", restored: "{name} بازیابی شد" },
  }[language];
  const name = type.startsWith("service.") ? service : type.startsWith("engine.update") ? engine : type.startsWith("nginx.") ? "Nginx" : type.startsWith("app.update") ? "Outpost" : "";
  if (!name) return null;
  const phase = type.endsWith("_started") ? "started" : type.endsWith("_failed") || type.endsWith("unavailable") ? "failed" : type.endsWith("restored") ? "restored" : "succeeded";
  return templates[phase].replace("{name}", name);
}

function description(data: Data, language: Exclude<Locale, "ru">, fallback: string) {
  if (typeof data.connectionName === "string") return data.connectionName;
  if (data.browser || data.os) return [data.browser, data.os].filter(Boolean).join(" · ");
  if (data.fromVersion || data.previousVersion || data.version || data.toVersion) {
    const from = data.fromVersion ?? data.previousVersion;
    const to = data.version ?? data.toVersion;
    if (from && to) return `${from} → ${to}`;
    if (to) return `${language === "en" ? "Version" : language === "zh-CN" ? "版本" : "نسخه"} ${to}`;
  }
  if (typeof data.size === "number") {
    const size = new Intl.NumberFormat(language === "fa" ? "fa-IR" : language).format(Math.max(1, Math.round(data.size / 1024)));
    return `${language === "fa" ? "بایگانی رمزگذاری‌شده" : language === "zh-CN" ? "加密归档" : "Encrypted archive"} · ${size} KB`;
  }
  if (data.rulesCount || data.rules) return `${data.rulesCount ?? data.rules} ${language === "en" ? "rules" : language === "zh-CN" ? "条规则" : "قانون"}`;
  return /[А-Яа-яЁё]/.test(fallback) ? "" : fallback;
}

function interpolate(template: string, data: Data) {
  const values: Data = {
    ...data,
    version: data.targetVersion ?? data.newVersion ?? data.version ?? "—",
    engine: engineName(data.engine),
  };
  return template.replace(/\{([^}]+)\}/g, (match, key) => values[key] === undefined ? match : String(values[key]));
}

function engineName(value: unknown) {
  return value === "hysteria" ? "Hysteria 2" : value === "xray" ? "Xray" : String(value ?? "");
}
