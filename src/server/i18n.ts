import { accept, locale, resolve, type Locale } from "../shared/i18n";

const messages: Record<Locale, Record<string, string>> = {
  en: {
    "Сессия истекла — войдите снова": "Your session has expired. Sign in again.",
    "API token не имеет нужного scope": "The API token does not have the required scope.",
    "Действие доступно только владельцу панели": "This action is available only to the panel owner.",
    "Проверьте введённые данные": "Check the entered data.",
    "Внутренняя ошибка": "Internal error.",
    "Запрос слишком большой": "The request is too large.",
    "Ожидался корректный JSON": "Valid JSON was expected.",
    "Владелец ещё не создан": "The owner has not been created yet.",
    "Сначала подключите постоянный домен": "Connect a permanent domain first.",
    "Продолжение первоначальной настройки недействительно или истекло": "The initial setup handoff is invalid or has expired.",
    "Ссылка восстановления недействительна или истекла": "The recovery link is invalid or has expired.",
    "Ссылка не найдена или отозвана": "The link was not found or has been revoked.",
    "Формат подписки не поддерживается": "This subscription format is not supported.",
    "Подключение не найдено": "Connection not found.",
    "Операция не разрешена": "This operation is not allowed.",
    "DNS-запись пока не найдена — проверьте адрес и попробуйте ещё раз": "The DNS record was not found yet. Check the address and try again.",
    "DNS-запись подтверждена, но сервер не смог завершить настройку домена — попробуйте ещё раз": "DNS was verified, but the server could not finish domain setup. Try again.",
    "Первоначальная настройка домена уже завершена": "Initial domain setup has already been completed.",
    "Первоначальная настройка уже выполняется": "Initial setup is already in progress.",
    "Нужна действующая сессия владельца": "A valid owner session is required.",
    "Passkey не прошёл проверку": "The passkey could not be verified.",
    "Не удалось подтвердить passkey": "The passkey could not be confirmed.",
    "Не удалось проверить TLS-сертификат": "The TLS certificate could not be checked.",
    "Сервер не отдал срок TLS-сертификата": "The server did not return the TLS certificate expiry date.",
    "Последнее правило уже существует": "The final catch-all rule already exists.",
    "Правило с таким условием уже существует": "A rule with this condition already exists.",
    "Защищённое системное правило нельзя менять": "This protected system rule cannot be changed.",
    "Защищённое системное правило нельзя удалить": "This protected system rule cannot be deleted.",
    "Список правил для сортировки неполон": "The rule order is incomplete.",
    "Правило «всё остальное» должно быть последним": "The catch-all rule must remain last.",
    "Правило «локальная сеть» должно быть первым": "The local network rule must remain first.",
    "Нельзя опубликовать пустой набор маршрутов": "An empty route set cannot be published.",
    "Пока нет опубликованных правил": "No route rules have been published yet.",
    "Ревизия маршрутов не найдена": "Route revision not found.",
    "Правило не найдено": "Route rule not found.",
    "Укажите IP-адрес или CIDR, например 192.0.2.1 или 2001:db8::/32": "Enter an IP address or CIDR such as 192.0.2.1 or 2001:db8::/32.",
    "Укажите полный домен, например example.com": "Enter a complete domain such as example.com.",
    "Укажите доменный суффикс, например example.com или ru": "Enter a domain suffix such as example.com or ru.",
    "Укажите код GeoSite/GeoIP без префикса, например google или ru": "Enter a GeoSite/GeoIP code without a prefix, such as google or ru.",
  },
  ru: {},
  "zh-CN": {
    "Сессия истекла — войдите снова": "会话已过期，请重新登录。",
    "API token не имеет нужного scope": "API 令牌没有所需的权限范围。",
    "Действие доступно только владельцу панели": "此操作仅限面板所有者。",
    "Проверьте введённые данные": "请检查输入的数据。",
    "Внутренняя ошибка": "内部错误。",
    "Запрос слишком большой": "请求过大。",
    "Ожидался корректный JSON": "需要有效的 JSON。",
    "Владелец ещё не создан": "尚未创建所有者。",
    "Сначала подключите постоянный домен": "请先连接永久域名。",
    "Продолжение первоначальной настройки недействительно или истекло": "初始设置的继续凭据无效或已过期。",
    "Ссылка восстановления недействительна или истекла": "恢复链接无效或已过期。",
    "Ссылка не найдена или отозвана": "链接不存在或已撤销。",
    "Формат подписки не поддерживается": "不支持此订阅格式。",
    "Подключение не найдено": "未找到连接。",
    "Операция не разрешена": "不允许执行此操作。",
    "DNS-запись пока не найдена — проверьте адрес и попробуйте ещё раз": "尚未找到 DNS 记录。请检查地址后重试。",
    "DNS-запись подтверждена, но сервер не смог завершить настройку домена — попробуйте ещё раз": "DNS 已验证，但服务器无法完成域名设置。请重试。",
    "Первоначальная настройка домена уже завершена": "初始域名设置已完成。",
    "Первоначальная настройка уже выполняется": "初始设置已在进行中。",
    "Нужна действующая сессия владельца": "需要有效的所有者会话。",
    "Passkey не прошёл проверку": "无法验证通行密钥。",
    "Не удалось подтвердить passkey": "无法确认通行密钥。",
    "Не удалось проверить TLS-сертификат": "无法检查 TLS 证书。",
    "Сервер не отдал срок TLS-сертификата": "服务器未返回 TLS 证书到期日期。",
    "Последнее правило уже существует": "最终的全匹配规则已存在。",
    "Правило с таким условием уже существует": "具有此条件的规则已存在。",
    "Защищённое системное правило нельзя менять": "无法修改此受保护的系统规则。",
    "Защищённое системное правило нельзя удалить": "无法删除此受保护的系统规则。",
    "Список правил для сортировки неполон": "规则排序列表不完整。",
    "Правило «всё остальное» должно быть последним": "全匹配规则必须保持在最后。",
    "Правило «локальная сеть» должно быть первым": "本地网络规则必须保持在最前。",
    "Нельзя опубликовать пустой набор маршрутов": "无法发布空的路由规则集。",
    "Пока нет опубликованных правил": "尚未发布路由规则。",
    "Ревизия маршрутов не найдена": "未找到路由修订版本。",
    "Правило не найдено": "未找到路由规则。",
    "Укажите IP-адрес или CIDR, например 192.0.2.1 или 2001:db8::/32": "请输入 IP 地址或 CIDR，例如 192.0.2.1 或 2001:db8::/32。",
    "Укажите полный домен, например example.com": "请输入完整域名，例如 example.com。",
    "Укажите доменный суффикс, например example.com или ru": "请输入域名后缀，例如 example.com 或 ru。",
    "Укажите код GeoSite/GeoIP без префикса, например google или ru": "请输入不带前缀的 GeoSite/GeoIP 代码，例如 google 或 ru。",
  },
  fa: {
    "Сессия истекла — войдите снова": "نشست شما منقضی شده است. دوباره وارد شوید.",
    "API token не имеет нужного scope": "توکن API مجوز لازم را ندارد.",
    "Действие доступно только владельцу панели": "این عملیات فقط برای مالک پنل در دسترس است.",
    "Проверьте введённые данные": "داده‌های واردشده را بررسی کنید.",
    "Внутренняя ошибка": "خطای داخلی.",
    "Запрос слишком большой": "درخواست بیش از حد بزرگ است.",
    "Ожидался корректный JSON": "JSON معتبر مورد انتظار بود.",
    "Владелец ещё не создан": "مالک هنوز ایجاد نشده است.",
    "Сначала подключите постоянный домен": "ابتدا یک دامنهٔ دائمی متصل کنید.",
    "Продолжение первоначальной настройки недействительно или истекло": "مجوز ادامهٔ تنظیم اولیه نامعتبر یا منقضی شده است.",
    "Ссылка восстановления недействительна или истекла": "پیوند بازیابی نامعتبر یا منقضی شده است.",
    "Ссылка не найдена или отозвана": "پیوند پیدا نشد یا لغو شده است.",
    "Формат подписки не поддерживается": "این قالب اشتراک پشتیبانی نمی‌شود.",
    "Подключение не найдено": "اتصال پیدا نشد.",
    "Операция не разрешена": "این عملیات مجاز نیست.",
    "DNS-запись пока не найдена — проверьте адрес и попробуйте ещё раз": "رکورد DNS هنوز پیدا نشد. آدرس را بررسی و دوباره تلاش کنید.",
    "DNS-запись подтверждена, но сервер не смог завершить настройку домена — попробуйте ещё раз": "DNS تأیید شد، اما سرور نتوانست تنظیم دامنه را کامل کند. دوباره تلاش کنید.",
    "Первоначальная настройка домена уже завершена": "راه‌اندازی اولیهٔ دامنه قبلاً تکمیل شده است.",
    "Первоначальная настройка уже выполняется": "تنظیم اولیه هم‌اکنون در حال انجام است.",
    "Нужна действующая сессия владельца": "یک نشست معتبر مالک لازم است.",
    "Passkey не прошёл проверку": "کلید عبور تأیید نشد.",
    "Не удалось подтвердить passkey": "تأیید کلید عبور انجام نشد.",
    "Не удалось проверить TLS-сертификат": "بررسی گواهی TLS ممکن نشد.",
    "Сервер не отдал срок TLS-сертификата": "سرور تاریخ انقضای گواهی TLS را برنگرداند.",
    "Последнее правило уже существует": "قانون نهایی برای همهٔ موارد از قبل وجود دارد.",
    "Правило с таким условием уже существует": "قانونی با این شرط از قبل وجود دارد.",
    "Защищённое системное правило нельзя менять": "این قانون محافظت‌شدهٔ سیستم قابل تغییر نیست.",
    "Защищённое системное правило нельзя удалить": "این قانون محافظت‌شدهٔ سیستم قابل حذف نیست.",
    "Список правил для сортировки неполон": "فهرست ترتیب قوانین ناقص است.",
    "Правило «всё остальное» должно быть последним": "قانون همهٔ موارد باید در انتها بماند.",
    "Правило «локальная сеть» должно быть первым": "قانون شبکهٔ محلی باید در ابتدا بماند.",
    "Нельзя опубликовать пустой набор маршрутов": "مجموعهٔ خالی قوانین مسیریابی قابل انتشار نیست.",
    "Пока нет опубликованных правил": "هنوز هیچ قانون مسیریابی منتشر نشده است.",
    "Ревизия маршрутов не найдена": "نسخهٔ قوانین مسیریابی پیدا نشد.",
    "Правило не найдено": "قانون مسیریابی پیدا نشد.",
    "Укажите IP-адрес или CIDR, например 192.0.2.1 или 2001:db8::/32": "یک نشانی IP یا CIDR مانند 192.0.2.1 یا 2001:db8::/32 وارد کنید.",
    "Укажите полный домен, например example.com": "یک دامنهٔ کامل مانند example.com وارد کنید.",
    "Укажите доменный суффикс, например example.com или ru": "یک پسوند دامنه مانند example.com یا ru وارد کنید.",
    "Укажите код GeoSite/GeoIP без префикса, например google или ru": "کد GeoSite/GeoIP را بدون پیشوند وارد کنید، مانند google یا ru.",
  },
};

const codes: Record<string, string> = {
  "Сессия истекла — войдите снова": "auth.session_expired",
  "API token не имеет нужного scope": "auth.insufficient_scope",
  "Действие доступно только владельцу панели": "auth.owner_required",
  "Запрос слишком большой": "request.too_large",
  "Ожидался корректный JSON": "request.invalid_json",
  "Владелец ещё не создан": "owner.not_initialized",
  "Сначала подключите постоянный домен": "setup.domain_required",
  "Продолжение первоначальной настройки недействительно или истекло": "auth.claim_invalid",
  "Ссылка восстановления недействительна или истекла": "auth.recovery_invalid",
  "Первоначальная настройка уже выполняется": "setup.in_progress",
  "Нужна действующая сессия владельца": "auth.session_required",
  "Ссылка не найдена или отозвана": "subscription.not_found",
  "Формат подписки не поддерживается": "subscription.format_unsupported",
  "Подключение не найдено": "connection.not_found",
  "Операция не разрешена": "operation.not_allowed",
  "Последнее правило уже существует": "route.catch_all_exists",
  "Правило с таким условием уже существует": "route.duplicate",
  "Защищённое системное правило нельзя менять": "route.system_update_forbidden",
  "Защищённое системное правило нельзя удалить": "route.system_delete_forbidden",
  "Список правил для сортировки неполон": "route.order_incomplete",
  "Правило «всё остальное» должно быть последним": "route.catch_all_last",
  "Правило «локальная сеть» должно быть первым": "route.local_first",
  "Нельзя опубликовать пустой набор маршрутов": "route.empty",
  "Пока нет опубликованных правил": "route.not_published",
  "Ревизия маршрутов не найдена": "route.revision_not_found",
  "Правило не найдено": "route.not_found",
  "Укажите IP-адрес или CIDR, например 192.0.2.1 или 2001:db8::/32": "route.cidr_invalid",
  "Укажите полный домен, например example.com": "route.domain_invalid",
  "Укажите доменный суффикс, например example.com или ru": "route.suffix_invalid",
  "Укажите код GeoSite/GeoIP без префикса, например google или ru": "route.geo_invalid",
};

export function requestLanguage(request: Request, url: URL, owner?: { language?: Locale; scopes?: string[] } | null): Locale {
  const explicit = url.searchParams.get("lang");
  if (explicit !== null) return locale(explicit) ?? "en";
  if (owner?.language && !owner.scopes) return owner.language;
  const requested = request.headers.get("x-outpost-language");
  const cached = requestCookie(request, "outpost_language");
  return resolve([requested, cached, accept(request.headers.get("accept-language"))]);
}

export function localize(message: string, language: Locale) {
  if (language === "ru") return message;
  const translated = messages[language][message] ?? messages.en[message];
  if (translated) return translated;
  if (!/[А-Яа-яЁё]/.test(message)) return message;
  return language === "en" ? "The request could not be completed."
    : language === "zh-CN" ? "无法完成请求。"
      : "انجام درخواست ممکن نشد.";
}

const presentationMessages: Record<Exclude<Locale, "ru">, Record<string, string>> = {
  en: {
    "Перезапустить службу": "Restart service",
    "Проверить и перечитать Nginx": "Validate and reload Nginx",
    "Сначала будет выполнен nginx -t": "nginx -t will run first",
    "Обновить Outpost": "Update Outpost",
    "Подпись Minisign будет проверена до распаковки": "The Minisign signature will be verified before unpacking",
    "Будет создан снимок SQLite": "An SQLite snapshot will be created",
    "Работающий движок перезапустится только при безопасном обновлении его системного пресета": "A running engine will restart only when its system preset can be updated safely",
    "Создать резервную копию": "Create backup",
    "Архив будет защищён отдельным паролем": "The archive will be protected with a separate password",
    "Архив будет создан без шифрования": "The archive will be created without encryption",
    "Прежняя ссылка и credentials сразу перестанут работать": "The old link and credentials will stop working immediately",
    "Все использующие это подключение устройства потребуется подключить заново": "Every device using this connection will need to reconnect",
    "Операция поставлена в очередь": "Operation queued",
    "Передаём операцию root-agent": "Sending operation to root-agent",
    "Перевыпускаем credentials": "Rotating credentials",
    "Готово": "Done",
    "operation.queued": "Operation queued",
    "operation.delegating": "Sending operation to root-agent",
    "operation.credentials_rotating": "Rotating credentials",
    "operation.completed": "Done",
  },
  "zh-CN": {
    "Перезапустить службу": "重启服务",
    "Проверить и перечитать Nginx": "验证并重新加载 Nginx",
    "Сначала будет выполнен nginx -t": "将先运行 nginx -t",
    "Обновить Outpost": "更新 Outpost",
    "Подпись Minisign будет проверена до распаковки": "解压前将验证 Minisign 签名",
    "Будет создан снимок SQLite": "将创建 SQLite 快照",
    "Работающий движок перезапустится только при безопасном обновлении его системного пресета": "仅当系统预设可安全更新时，正在运行的引擎才会重启",
    "Создать резервную копию": "创建备份",
    "Архив будет защищён отдельным паролем": "归档将使用单独密码保护",
    "Архив будет создан без шифрования": "归档将不加密",
    "Прежняя ссылка и credentials сразу перестанут работать": "旧链接和凭据将立即失效",
    "Все использующие это подключение устройства потребуется подключить заново": "使用此连接的所有设备都需要重新连接",
    "Операция поставлена в очередь": "操作已排队",
    "Передаём операцию root-agent": "正在将操作发送给 root-agent",
    "Перевыпускаем credentials": "正在轮换凭据",
    "Готово": "完成",
    "operation.queued": "操作已排队",
    "operation.delegating": "正在将操作发送给 root-agent",
    "operation.credentials_rotating": "正在轮换凭据",
    "operation.completed": "完成",
  },
  fa: {
    "Перезапустить службу": "راه‌اندازی مجدد سرویس",
    "Проверить и перечитать Nginx": "اعتبارسنجی و بارگذاری دوبارهٔ Nginx",
    "Сначала будет выполнен nginx -t": "ابتدا nginx -t اجرا می‌شود",
    "Обновить Outpost": "به‌روزرسانی Outpost",
    "Подпись Minisign будет проверена до распаковки": "امضای Minisign پیش از بازکردن بررسی می‌شود",
    "Будет создан снимок SQLite": "یک snapshot از SQLite ساخته می‌شود",
    "Работающий движок перезапустится только при безопасном обновлении его системного пресета": "موتور در حال اجرا فقط در صورت به‌روزرسانی امن پیش‌تنظیم سیستمی آن راه‌اندازی مجدد می‌شود",
    "Создать резервную копию": "ایجاد نسخهٔ پشتیبان",
    "Архив будет защищён отдельным паролем": "بایگانی با گذرواژه‌ای جداگانه محافظت می‌شود",
    "Архив будет создан без шифрования": "بایگانی بدون رمزگذاری ساخته می‌شود",
    "Прежняя ссылка и credentials сразу перестанут работать": "پیوند و اطلاعات اتصال قبلی فوراً از کار می‌افتند",
    "Все использующие это подключение устройства потребуется подключить заново": "همهٔ دستگاه‌های استفاده‌کننده از این اتصال باید دوباره متصل شوند",
    "Операция поставлена в очередь": "عملیات در صف قرار گرفت",
    "Передаём операцию root-agent": "عملیات به root-agent فرستاده می‌شود",
    "Перевыпускаем credentials": "اطلاعات اتصال در حال تعویض است",
    "Готово": "انجام شد",
    "operation.queued": "عملیات در صف قرار گرفت",
    "operation.delegating": "عملیات به root-agent فرستاده می‌شود",
    "operation.credentials_rotating": "اطلاعات اتصال در حال تعویض است",
    "operation.completed": "انجام شد",
  },
};

export function localizePresentation<T>(value: T, language: Locale): T {
  if (language === "ru") return value;
  return walkPresentation(value, language, false) as T;
}

function walkPresentation(value: unknown, language: Exclude<Locale, "ru">, translateScalars: boolean): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return translateScalars ? presentationText(value, language) : value;
  if (Array.isArray(value)) return value.map((item) => walkPresentation(item, language, translateScalars));
  if (typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const localizable = ["title", "message", "description", "changes", "error"].includes(key);
    result[key] = walkPresentation(item, language, localizable);
  }
  return result;
}

function presentationText(value: string, language: Exclude<Locale, "ru">) {
  const exact = presentationMessages[language][value];
  if (exact) return exact;
  const connection = value.match(/^Перевыпустить подключение «(.+)»$/);
  if (connection) return language === "en" ? `Rotate connection “${connection[1]}”`
    : language === "zh-CN" ? `轮换连接“${connection[1]}”`
      : `تعویض اطلاعات اتصال «${connection[1]}»`;
  const update = value.match(/^Обновить (.+) до (.+)$/);
  if (update) return language === "en" ? `Update ${update[1]} to ${update[2]}`
    : language === "zh-CN" ? `将 ${update[1]} 更新至 ${update[2]}`
      : `به‌روزرسانی ${update[1]} به ${update[2]}`;
  const service = value.match(/^(Запустить|Остановить) (.+)$/);
  if (service) {
    const verb = language === "en" ? (service[1] === "Запустить" ? "Start" : "Stop")
      : language === "zh-CN" ? (service[1] === "Запустить" ? "启动" : "停止")
        : service[1] === "Запустить" ? "راه‌اندازی" : "توقف";
    return `${verb} ${service[2]}`;
  }
  return localize(value, language);
}

export function errorCode(message: string, status: number) {
  return codes[message] ?? `service.${status}`;
}

export function languageCookie(language: Locale) {
  return `outpost_language=${encodeURIComponent(language)}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

function requestCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}
