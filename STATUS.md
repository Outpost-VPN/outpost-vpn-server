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
- pre-launch API проверяет bootstrap token и DNS, root-agent повторно валидирует domain/IPv4 и атомарно переключает Nginx/Hysteria/Xray на final domain certificate;
- временный IP Nginx разрешает только setup UI/API и не публикует WebAuthn или owner dashboard;
- UI entrypoint механически разнесён по feature-модулям; `app.imba` содержит только composition root;
- owner dashboard отделён от минимального `/api/v1/status`, поэтому `status:read` не раскрывает подключения, маршруты, settings, configs и tokens;
- WebAuthn challenge не хранит raw bootstrap token, просроченные записи чистятся, незавершённые записи ограничены;
- персистентный connection-sync outbox завершает activation/rotate/archive в БД только после синхронизации Xray, повторяет interrupted/failed jobs и сразу инвалидирует старую ссылку при ротации или архивировании;
- Nginx hardening: default Host/SNI servers, fixed-domain redirect, rate/body limits, HSTS и fixed upstream Host;
- actions pinned по commit SHA, release workflow запускается вручную из `main`, checkout делает только точный `refs/tags/<tag>`, затем workflow подписывает Minisign и публикует GitHub Release через environment secret;
- release manifest входит в `SHA256SUMS`, installer/updater проверяют detached signature до распаковки;
- dependency override перевёл Imba toolchain на `esbuild 0.25.0`, `bun audit` чист.

## Проверено локально и на VPS

- TypeScript typecheck и Imba production build;
- 104 unit/integration tests, включая единый allowlist навигации без скрытых страниц и legacy aliases, чистую схему `connections`, один credential set, provisioning/retry/rotate/archive, golden-проверки пяти subscription renderers, gRPC recovery, signed rule-set update/rollback, setup/DNS/root-agent contract, WebAuthn, journal, presence и monitoring;
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
- чистая установка `v0.1.0-rc.8` прошла на HostKey Ubuntu 24.04 amd64 даже при вызывающем `umask 077`: Certbot выдал trusted short-lived IP certificate, Nginx, Outpost и root-agent active, UFW active, `/readyz` и одноразовая setup page доступны;
- полевая установка выявила и закрыла три дефекта до `rc.8`: transient restart snapd при установке Certbot, недопустимый IP в TLS SNI monitoring probe и неявный mode временного ACME-файла; rollback после каждой неуспешной попытки оставлял Outpost paths, services и порты чистыми;
- после установки Outpost пережил следующий цикл мониторинга без warning/error и рестартов; IP certificate проверен с `verify_ip`, а `/etc/outpost/outpost.env` имеет mode `0640` и владельца `root:outpost`.

## Оставшийся полевой gate

Универсальные подключения реализованы и проверены локально, а чистая signed-установка на новом HostKey завершена. Дальше нужен browser setup и оставшийся end-to-end gate:

1. выбор конечного hostname/домена, DNS/certificate switch и создание владельца/passkey без legacy data;
2. прямой импорт минимум в один Mihomo-, sing-box- и Xray-клиент без обязательного browser step;
3. Hysteria UDP/443, XHTTP и gRPC через общий TCP/443 и автоматическое переключение при недоступном UDP;
4. добавление и отзыв одного UUID одновременно в обоих Xray inbounds, включая частичный сбой hot update;
5. маршруты с GeoIP/Geosite, загрузка SRS, суточное обновление и сохранение рабочей версии при сломанной подписи/checksum;
6. немедленная инвалидация прежней ссылки при ротации и архивировании, включая незавершённый provisioning;
7. проверка Nginx, application и audit logs на отсутствие subscription token, XHTTP path и gRPC service name;
8. traffic/presence обоих движков, остановка/восстановление служб и конкретные health/journal incidents;
9. намеренно сломанный application update с автоматическим rollback и age export/restore;
10. WebAuthn e2e на final domain.

До прохождения gate проект следует считать pre-release, а не production-ready.
