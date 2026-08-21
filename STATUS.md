# Состояние Outpost v1

Обновлено: 21 августа 2026.

## Реализовано

- monorepo Bun/TypeScript + Imba/bimba + Go-agent + CLI/MCP;
- responsive UI с единой навигацией: Главная, Подключения, Протоколы, Маршруты, Журнал, Доступ и Настройки; отдельно — login, pre-launch с бесплатным hostname или своим доменом и onboarding;
- WebAuthn passkeys, сессии, bootstrap reset и scoped API-токены;
- единые подключения с собственными credentials, автоматической provisioning-очередью, ротацией и архивированием;
- одна универсальная ссылка подключения в форматах Mihomo, sing-box, Xray URI, Xray JSON и links; ею может пользоваться любое количество людей и физических устройств без попытки различать их;
- Hysteria 2 как основной transport, VLESS XHTTP как основной TCP fallback и VLESS gRPC как совместимый TCP fallback на одном TCP/443;
- versioned каталог приложений с форматными deep links/QR, уровнями «проверено»/«совместимо» и universal cards;
- draft/publish/diff/rollback маршрутов и защищённые defaults;
- статистика Hysteria/Xray с delta после restart и rollup 5m → 1h → 1d;
- реальный типизированный журнал с audit links, server-side фильтрами, поиском, cursor pagination и структурированным diff;
- технический presence подключений: Hysteria `/online`, Xray activity delta и состояния online/offline/unknown;
- события первого появления, отсутствия более 24 часов и возвращения без спама от регулярных refresh;
- фоновый мониторинг systemd, XHTTP/gRPC localhost listeners, telemetry, диска, TLS и rule-set updater с конкретной причиной сбоя;
- privacy-redaction журнала: credentials, tokens, passphrase, IP и destination history не сохраняются;
- raw templates движков с protected blocks, preview/diff, ревизиями, validator и rollback;
- versioned presets Hysteria/Xray с семантическим three-way merge `старый preset + пользовательский template + новый preset`: пользовательские поля, удаления и YAML-комментарии сохраняются, массивы совмещаются по `tag`/`name`/`id`, системная политика защищена, а конфликты остаются для явного разрешения;
- Nginx one-domain split, отключённые secret URL logs, systemd hardening и UFW;
- pinned Hysteria/Xray с SHA-256;
- отдельно публикуемый подписанный GeoIP/Geosite SRS bundle из официальных SagerNet sources: manifest, SHA-256, source commits, licenses, atomic switch и две rollback-версии;
- immutable releases, migration snapshot и автоматический rollback обновления;
- переносимый age-backup из CLI и UI, restore на установке без владельца;
- локальный stdio MCP с двухэтапным подтверждением опасных операций;
- единое внутреннее именование `outpost` для служб, бинарников, CLI,
  каталогов данных, environment variables, cookie и UI-префиксов без
  legacy-алиасов;
- CI для Bun/Imba/TypeScript, Linux build, macOS CLI и Go-agent.
- публичный server-side bootstrap: одна команда на чистой Ubuntu 24.04, signed GitHub Release, Certbot 5.4+ из snap и trusted short-lived IP certificate;
- pre-launch API без install-time token проверяет DNS, root-agent повторно валидирует domain/IPv4 и атомарно переключает Nginx/Hysteria/Xray на final domain certificate;
- IP Nginx показывает setup прямо на `https://<IP>/`; после настройки сохраняет IP certificate и разрешает только предупреждение, setup assets, read-only setup status и ACME, не публикуя WebAuthn, owner dashboard, мутации, подписки или transports;
- UI entrypoint механически разнесён по feature-модулям; `app.imba` содержит только composition root;
- dashboard синхронизируется через authenticated SSE с монотонной revision, heartbeat и 30-секундным polling fallback; навигация и мутации сохраняют текущий snapshot и обновляют его неблокирующе;
- единый dashboard snapshot включает security-состояние, а открытый журнал повторяет текущий запрос при новой revision с сохранением фильтров;
- production edge сжимает JavaScript, CSS и JSON через gzip; HTML всегда ревалидируется, а versioned JS/CSS получают годовой immutable cache;
- owner dashboard отделён от минимального `/api/v1/status`, поэтому `status:read` не раскрывает подключения, маршруты, settings, configs и tokens;
- WebAuthn challenge не хранит raw setup claim/recovery token; claim имеет TTL, повторно проверяется при завершении, однократно потребляется, просроченные challenge чистятся, незавершённые записи ограничены;
- персистентный connection-sync outbox завершает activation/rotate/archive в БД только после синхронизации Xray, повторяет interrupted/failed jobs и сразу инвалидирует старую ссылку при ротации или архивировании;
- Nginx hardening: default Host/SNI servers, fixed-domain redirect, rate/body limits, HSTS и fixed upstream Host;
- actions pinned по commit SHA, release workflow запускается вручную из `main`, checkout делает только точный `refs/tags/<tag>`, затем workflow подписывает Minisign и публикует GitHub Release через environment secret;
- release manifest входит в `SHA256SUMS`, installer/updater проверяют detached signature до распаковки;
- dependency override перевёл Imba toolchain на `esbuild 0.25.0`, `bun audit` чист.

## Проверено локально и на VPS

- TypeScript typecheck и Imba production build;
- 165 unit/integration tests, включая versioned engine preset merge/reconcile/conflict/rollback, SSE authorization/revision/cleanup/reconnect, versioned cache и Nginx gzip/no-buffering, единый allowlist навигации без скрытых страниц и legacy aliases, чистую схему `connections`, один credential set, provisioning/retry/rotate/archive, golden-проверки пяти subscription renderers, реальный User-Agent Everywhere для универсальной ссылки, gRPC recovery, signed rule-set update/rollback, setup/DNS/root-agent contract/recovery, WebAuthn, journal, presence и pre-launch monitoring;
- сгенерированные Mihomo, sing-box и Xray JSON профили приняты нативными `mihomo 1.19.30`, `sing-box 1.13.19` и `xray 26.7.28`;
- Go policy tests и статический linux/amd64 agent build;
- standalone Linux server/CLI и macOS CLI builds;
- desktop/mobile browser QA основных страниц и модальных сценариев;
- shellcheck bootstrap/install/finalize scripts и actionlint workflows;
- Nginx template проходит `nginx -t` на Nginx 1.31 (совместимый `listen ... http2` оставлен для Ubuntu 24.04);
- локальный transport e2e поднимает настоящий Nginx и Xray на одном TLS edge, проходит через XHTTP и gRPC и подтверждает Mihomo fallback при недоступном Hysteria/UDP;
- подписанный локальный `outpost-0.1.0-rc.1-linux-amd64.tar.gz`: Minisign verify, все внутренние SHA-256 и отрицательный tamper test проходят;
- Minisign private key находится вне репозитория с mode `0600` и загружен в GitHub environment `release`; public key закоммичен.
- Gitleaks 8.30.1 просканировал исходное дерево: реальных секретов не найдено; pinned public Xray SHA-256 документирован в точечном allowlist.
- GitHub-репозиторий публичен, `main` защищена обязательными CI-проверками и squash PR; включены secret scanning, push protection и Dependabot security updates;
- signed workflow успешно опубликовал pre-release [`v0.1.0-rc.2`](https://github.com/Outpost-VPN/outpost-vpn-server/releases/tag/v0.1.0-rc.2); archive SHA-256 `a6c84eb9fba0d1653f26ca03d08179760751b0d91c023d6766346c836f3ed8e0`;
- публичная one-line установка `v0.1.0-rc.2` прошла на Ubuntu 24.04 amd64: detached Minisign signature и внутренний `SHA256SUMS` подтверждены на сервере;
- Let's Encrypt выдал trusted short-lived certificate с IP SAN `57.131.140.147`; внешние `/healthz`, `/readyz` и setup page доступны по HTTPS без отключения TLS verification;
- Nginx, Outpost и root-agent active/enabled, UFW active; Xray и Hysteria остаются disabled до browser-перехода на конечный домен;
- Gitleaks повторно проверил текущее дерево и всю Git-историю перед публикацией: секретов и legacy-названия нет; `bun audit` не нашёл уязвимостей.
- signed workflow опубликовал pre-release [`v0.1.0-rc.8`](https://github.com/Outpost-VPN/outpost-vpn-server/releases/tag/v0.1.0-rc.8) из точного зелёного `main`; анонимная загрузка повторно прошла detached Minisign, внешний portable SHA-256, внутренний `SHA256SUMS` и manifest `linux-amd64`;
- чистая установка `v0.1.0-rc.8` прошла на HostKey Ubuntu 24.04 amd64 даже при вызывающем `umask 077`: Certbot выдал trusted short-lived IP certificate, Nginx, Outpost и root-agent active, UFW active, `/readyz` и setup page доступны;
- полевая установка выявила и закрыла три дефекта до `rc.8`: transient restart snapd при установке Certbot, недопустимый IP в TLS SNI monitoring probe и неявный mode временного ACME-файла; rollback после каждой неуспешной попытки оставлял Outpost paths, services и порты чистыми;
- после установки Outpost пережил следующий цикл мониторинга без warning/error и рестартов; IP certificate проверен с `verify_ip`, а `/etc/outpost/outpost.env` имеет mode `0640` и владельца `root:outpost`.
- security pre-release [`v0.1.0-rc.9`](https://github.com/Outpost-VPN/outpost-vpn-server/releases/tag/v0.1.0-rc.9) обновил runtime `golang.org/x/crypto` до `0.52.0` и Go toolchain до 1.25; `govulncheck` не нашёл достигаемых уязвимостей, а число открытых Dependabot alerts стало нулевым;
- HostKey обновлён с `rc.8` на `rc.9` встроенным signed updater без потери setup state; running root-agent исполняется из release `rc.9`, его SHA-256 совпадает с signed archive, после monitoring interval у Outpost и agent ноль рестартов и warning/error.
- полевая попытка точного `rc.9` на заново переустановленном HostKey воспроизвела race пакетного default Nginx: локальный ACME preflight получил `404` до certificate order, rollback оставил Outpost paths, services и порты чистыми;
- [`v0.1.0-rc.10`](https://github.com/Outpost-VPN/outpost-vpn-server/releases/tag/v0.1.0-rc.10) запускает Nginx только после подготовки setup vhost и probe; точная публичная one-line установка прошла на полностью чистой Ubuntu 24.04 amd64, production IP certificate получен без rollback;
- browser setup завершён на `outpost.semenova.icu`: DNS указывает на HostKey, trusted Let's Encrypt domain certificate действует до 2026-11-19, владелец и passkey созданы, Hysteria/Xray включены;
- полевая установка обнаружила ложные pre-launch incidents для намеренно выключенных engines/transports/telemetry и штатного 160-часового IP certificate; [`v0.1.0-rc.11`](https://github.com/Outpost-VPN/outpost-vpn-server/releases/tag/v0.1.0-rc.11) подавляет эти probes до domain setup и использует renewal-aware TLS thresholds `warning < 3 дней`, `critical < 1 дня`;
- `rc.11` опубликован из точного зелёного `main`, анонимно проверен по Minisign, внешнему SHA-256 `9e8b3880bba6721ef1dd8e965d2005025ff04c71b242cc83f1a4ff1b27975f24`, внутреннему `SHA256SUMS` и manifest; signed updater перевёл HostKey без повторного ACME order или rollback;
- Nginx, Outpost, root-agent, Hysteria и Xray active/enabled с нулём рестартов и warning/error; все services, transports, telemetry, disk и TLS остаются healthy/available после нескольких monitoring intervals. Running root-agent SHA-256 совпадает с анонимно скачанным signed archive.
- точный signed `rc.12` установлен на заново переустановленный HostKey одной публичной post-install командой; все release-файлы совпали с проверенным архивом, browser setup завершён на `outpost.semenova.icu`, а services, transports, telemetry, disk, TLS и SQLite прошли полевую проверку без рестартов и incidents;
- первый прямой импорт универсального `/s/:token` в Everywhere 1.5 выявил регрессию `rc.12`: корневой URL всегда отдавал HTML-каталог, поэтому Mihomo завершался с `yaml: line 5: found character that cannot start any token`. Исправление `rc.13` вернуло User-Agent negotiation для `Everywhere/1.0 Clash/1.11.0`, сохранило HTML для браузера и explicit `/apps/:appId`; профильные тесты, полный `bun run check` и native subscription validation зелёные. HostKey намеренно остаётся на `rc.12` до ручного обновления через веб-панель.

## Оставшийся полевой gate

Чистая signed-установка `rc.12` и browser setup на HostKey завершены. Первый прямой импорт нашёл и закрыл в `rc.13` ошибку content negotiation универсальной ссылки; для продолжения клиентского gate нужно вручную обновить HostKey через веб-панель. После его развёртывания остаются:

1. прямой импорт минимум в один Mihomo-, sing-box- и Xray-клиент без обязательного browser step;
2. Hysteria UDP/443, XHTTP и gRPC через общий TCP/443 и автоматическое переключение при недоступном UDP;
3. добавление и отзыв одного UUID одновременно в обоих Xray inbounds, включая частичный сбой hot update;
4. маршруты с GeoIP/Geosite, загрузка SRS, суточное обновление и сохранение рабочей версии при сломанной подписи/checksum;
5. немедленная инвалидация прежней ссылки при ротации и архивировании, включая незавершённый provisioning;
6. проверка Nginx, application и audit logs на отсутствие subscription token, XHTTP path и gRPC service name;
7. traffic/presence обоих движков, остановка/восстановление служб и конкретные health/journal incidents;
8. намеренно сломанный application update с автоматическим rollback и age export/restore;
9. WebAuthn e2e на final domain.

До прохождения gate проект следует считать pre-release, а не production-ready.

## Кандидат 0.1.0-rc.13

Кандидат основан на полном составе `rc.12` и точечно исправляет полевую
регрессию универсальной ссылки: клиентский User-Agent снова выбирает нужный
renderer, а обычный браузер по тому же URL продолжает получать каталог
приложений. Legacy `?format=...` не возвращён; явные app/advanced URLs остаются
каноническими.

Перед публикацией закрыты отказные сценарии первоначального claim handoff,
кэширования secret subscription responses, dashboard reconnect после restart,
rollback domain finalization и нового CLI/MCP error envelope. Полный локальный
gate проходит: `bun run check` (165 тестов), Go tests/vet/static build,
ShellCheck, native Mihomo/sing-box/Xray validation, XHTTP/gRPC/Mihomo transport
integration, Linux server/CLI и macOS CLI builds, dependency audit и release
archive verification.

Точный `rc.12` прошёл чистую установку и browser setup на HostKey. Следующий
checkpoint после публикации signed `rc.13` — ручное обновление HostKey через
веб-панель и повторный импорт той же универсальной ссылки в Everywhere.
