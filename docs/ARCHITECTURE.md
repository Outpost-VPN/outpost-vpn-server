# Архитектура

## Процессы и границы привилегий

Outpost работает от отдельного непривилегированного пользователя и слушает только `127.0.0.1:8181`. Nginx — единственный публичный TCP edge. Hysteria самостоятельно занимает UDP/443. Xray слушает XHTTP на localhost:10000, gRPC на localhost:10001, а его API — localhost:10085.

Root-agent доступен только через `/run/outpost/agent.sock`, принимает JSON-запросы размером до 64 KiB и выполняет фиксированный набор действий: restart разрешённых служб, Nginx reload, однократный finalize домена, update, backup, применение конфигураций и динамическое изменение пользователей Xray. Произвольных команд и путей в контракте нет. Domain finalize запускается как отдельный фиксированный transient systemd unit, повторно проверяет DNS и переключает только заранее определённые файлы.

## Первый запуск

Основной installation surface — сам VPS, а не локальный компьютер. После одной команды в web-консоли хостера installer поднимает минимальный pre-launch control plane по публичному IP с короткоживущим доверенным TLS certificate. Пользователь открывает фиксированный корень `https://<IP>/`; install-time token, отдельного setup path и срока действия адреса нет. Модель первоначального доступа осознанно остаётся first-claim и предназначена только для новой установки на чистом VPS.

Pre-launch имеет одну задачу: принять постоянный hostname — бесплатный или на собственном домене, показать A-запись, дождаться DNS, получить domain certificate и атомарно применить final configs. Интерфейс рекомендует DuckDNS, FreeMyIP и dynv6, но не хранит их accounts или tokens: пользователь возвращает только полученный hostname. До этого движки, подписки и WebAuthn не активируются. Владелец и passkey всегда создаются на final HTTPS origin, потому что RP ID не должен меняться при переходе с IP на постоянный адрес.

После domain finalize сервер создаёт внутренний claim token с TTL 1 час, хранит только SHA-256 hash и возвращает его непосредственно тому же браузеру в переходе на `https://<domain>/admin/onboarding`. Claim повторно проверяется в начале и завершении WebAuthn registration и уничтожается после создания владельца. Это не install-time ссылка: до успешного finalize token не существует и в journal не записывается.

После настройки IP certificate сохраняется и автоматически продлевается. Отдельный IP-vhost оставляет доступными только корень с предупреждением, setup-статику, read-only `GET /api/v1/setup` и ACME challenge; dashboard, WebAuthn, setup mutations, subscriptions и transports по IP не публикуются. Domain-vhost принудительно задаёт обычный surface независимо от клиентских заголовков. `outpostctl` остаётся server-local и automation interface для doctor, backup/restore, emergency recovery и stdio MCP, но не является обязательным GUI installer.

## Данные

SQLite в `/var/lib/outpost/outpost.sqlite` — источник истины для владельца, passkeys, сессий, подключений, маршрутов, конфигурационных ревизий, трафика, операций, событий и настроек UI.

Credentials движков шифруются AES-256-GCM мастер-ключом `/var/lib/outpost/master.key`. Subscription token детерминированно выводится через HMAC-SHA-256 из мастер-ключа, connection ID и поколения credentials; в `connections` хранится только SHA-256 hash. Поэтому backup мастер-ключа сохраняет существующие URL, но база не содержит raw subscription tokens.

`connection_sync_jobs` — персистентный outbox между SQLite и Xray. Созданное подключение сразу получает credentials и состояние `provisioning`; control plane пытается добавить один UUID одновременно в XHTTP и gRPC inbounds. Через ту же очередь проходят приостановка и возобновление: ссылка и Hysteria auth блокируются в SQLite до завершения удаления UUID из обоих Xray inbounds, а при возобновлении открываются только после успешного возврата UUID. Частичный hot-update исправляется полным recovery config. Сбой оставляет retryable job, а старт control plane возвращает прерванные `running` jobs в очередь.

Состояния подключения: `provisioning`, `active`, `rotating`, `archiving`, `archived`; отдельный `suspended_at` временно блокирует активное подключение без замены его ссылки. В каждый момент действует только одно поколение credentials. Ротация немедленно инвалидирует прежнюю ссылку и Hysteria auth, затем персистентная задача заменяет credentials в движках. Приостановка, возобновление и архивирование используют повторяемые задачи, поэтому перезапуск control plane не оставляет SQLite и Xray в разных желаемых состояниях.

### Audit и пользовательский журнал

`audit_log` — полная техническая история доменных изменений с `before/after`. Таблица `events` — отдельный типизированный пользовательский журнал: каноническими являются `type`, категория, kind, severity, outcome и безопасный `data_json`, а русский title/description формирует `JournalService`. Значимые изменения связываются с audit через `audit_id`; общий transaction-helper записывает мутацию, audit и journal event атомарно.

`GET /api/v1/system/events` выполняет фильтрацию, поиск и cursor pagination на сервере. Dashboard получает последние восемь строк через тот же `JournalService`. Draft-редактирование маршрутов, preview подтверждений и другие технические промежуточные действия остаются только в audit и не перегружают пользовательскую ленту.

Перед записью journal payload рекурсивно очищается от token/password/passphrase/credentials/challenge, сетевых адресов, destination/domain и секретных URL/path. В журнал и presence не импортируются raw journald, access logs, Hysteria stream dump или Xray IP list. Автоматического удаления journal/audit в v1 нет; retention остаётся отдельной задачей.

### Presence и телеметрия

Один 30-секундный цикл собирает трафик и presence без повторных запросов. Hysteria параллельно запрашивает официальные `/traffic` и `/online`: число соединений является точным online-сигналом, два успешных отсутствия переводят подключение в offline, а ошибка API — в unknown. Xray закреплён на версии `26.7.28`: положительный delta пользовательских uplink/downlink счётчиков даёт online на две минуты; reset счётчика сам по себе активностью не считается.

`connection_presence` хранит независимое техническое состояние Hysteria/Xray. Публичный статус подключения агрегируется по правилу online > unknown > offline. `connections.first_seen_at` и `last_seen_at` обновляются только реальной активностью, а не временем опроса. В журнал один раз попадают первое использование, отсутствие более 24 часов и возвращение; ошибки телеметрии offline-инцидент не создают. Количество реальных людей и устройств Outpost не определяет.

Отдельный 60-секундный monitoring-service проверяет systemd, localhost-порты XHTTP/gRPC, диск и TLS. `monitor_states` хранит baseline и дедуплицирует инциденты: событие создаётся после двух ошибок, recovery — после одного успеха. Для диска действуют пороги 85%/95% и recovery ниже 80%, для TLS — 30/7 дней. Первый опрос после старта только устанавливает baseline. Owner-only диагностика показывает точный transport, порт и случайный path/service name.

## Подписки и маршруты

После `POST /api/v1/connections` подключение активируется сразу либо остаётся в персистентном `provisioning`. Owner-only `GET /api/v1/connections/:id/subscription` возвращает состояние и постоянный `/s/:token` после готовности. Одна ссылка может одновременно использоваться несколькими клиентами, а трафик и активность учитываются вместе. Для прекращения использования старой ссылки перевыпускается всё подключение через `POST /api/v1/connections/:id/rotate`.

- `mihomo` — Hysteria 2, XHTTP и gRPC, fallback-группа, DNS и маршруты;
- `sing-box` — Hysteria 2 и gRPC, `urltest`, TUN, DNS и remote SRS;
- `xray` — base64 из XHTTP и gRPC URI;
- `xray-json` — оба VLESS outbounds, observatory, balancer, DNS и routing;
- `links` — Hysteria/VLESS URI и совместимые INCY headers.

`GET /s/:token` — универсальный адрес: известный User-Agent получает подходящий renderer, неизвестный небраузерный клиент — Xray base64, а обычный браузер — каталог приложений. Параметр `platform` явно открывает нужную вкладку каталога. Ссылки и QR конкретных приложений используют стабильный `GET /s/:token/apps/:appId`; сырые форматы для ручного импорта доступны через `GET /s/:token/advanced/:target`. Устаревший `?format=...` возвращает `410`. Последний запрошенный формат не сохраняется: одна ссылка может обслуживать разные клиенты одновременно. Маршруты редактируются как draft, publish создаёт immutable revision, а URL доступа не меняется.

### GeoIP и Geosite

Отдельный workflow ежедневно собирает SRS из официальных `SagerNet/sing-geosite` и `SagerNet/sing-geoip`, записывает точные commits и лицензии, публикует versioned archive и подписанный Minisign manifest в отдельном release `rulesets`. Сервер проверяет подпись manifest, SHA-256 архива, безопасную структуру и наличие всех заявленных кодов, после чего атомарно переключает активный каталог и оставляет две предыдущие версии.

Ошибка подписи, checksum, структуры или отсутствующий код не затрагивает рабочую версию и появляется с конкретной причиной в журнале и health. SRS отдаются по `/rulesets/geosite/:code.srs` и `/rulesets/geoip/:code.srs` с ETag и суточным cache. Publish маршрутов с неизвестным кодом отклоняется до создания revision.

## Конфигурации движков

Raw editor хранит пользовательский template отдельно от rendered config. Protected placeholders отвечают за auth/users, Stats API, localhost listen, TLS и секретные paths. Применение проходит через preview → syntactic/protected validation → root-agent → native Xray validation → atomic replace → restart/health. При ошибке восстанавливается предыдущий файл. Для Hysteria, у которой нет validate-only команды, окончательной проверкой служит успешный systemd restart.

## Обновления

Код устанавливается в `/opt/outpost/releases/<version>`, активная версия выбирается symlink `/opt/outpost/current`. Данные и конфиги находятся за пределами release. Web updater получает metadata только из фиксированного GitHub-репозитория, отдельно выбирает stable/candidate channel, ограничивает имена и размеры assets, потоково пишет временные файлы и публикует их в incoming-каталоге только после проверки Minisign. Detached Minisign signature проверяется ключом из доверенной текущей версии до чтения manifest и распаковки; затем `SHA256SUMS` проверяет каждый файл release, включая manifest. Целевая версия связана с именем archive и manifest, downgrade отклоняется. Updater останавливает только control plane, делает SQLite checkpoint и snapshot, мигрирует новой CLI, переключает symlink и проверяет readiness. При ошибке возвращает предыдущие release и SQLite snapshot. Hysteria и Xray при обычном обновлении не останавливаются.
