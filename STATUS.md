# Состояние Outpost v1

Обновлено: 24 августа 2026.

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
- production web updater с stable/candidate channels, обнаружением GitHub Release и release notes, потоковой staging-загрузкой archive + Minisign, фиксированными asset URL/именами/размерами, подтверждением конкретной версии, persistent этапами операции и ожиданием целевой версии после restart;
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
- release manifest входит в `SHA256SUMS`, installer/updater проверяют detached signature до распаковки; release builder записывает tar entries как numeric `0:0`, распаковка не наследует UID сборочного runner, а установленное дерево релиза явно нормализуется до `root:root`;
- dependency override перевёл Imba toolchain на `esbuild 0.25.0`, `bun audit` чист.

## Проверено локально и на VPS

- TypeScript typecheck и Imba production build;
- 185 unit/integration tests, включая versioned engine preset merge/reconcile/conflict/rollback, SSE authorization/revision/cleanup/reconnect, versioned cache и Nginx gzip/no-buffering, единый allowlist навигации без скрытых страниц и legacy aliases, чистую схему `connections`, один credential set, provisioning/retry/rotate/archive/suspend/resume, golden-проверки пяти subscription renderers, реальный User-Agent Everywhere для универсальной ссылки, signed application update discovery/staging/release notes/channel/version binding/transient-unit restart recovery/persistent stages/bounded proxy timeout/периодический discovery, нормализацию ownership release, gRPC recovery, signed rule-set update/rollback, setup/DNS/root-agent contract/recovery, WebAuthn, journal, presence и pre-launch monitoring;
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
- первый прямой импорт универсального `/s/:token` в Everywhere 1.5 выявил регрессию `rc.12`: корневой URL всегда отдавал HTML-каталог, поэтому Mihomo завершался с `yaml: line 5: found character that cannot start any token`. Исправление `rc.13` вернуло User-Agent negotiation для `Everywhere/1.0 Clash/1.11.0`, сохранило HTML для браузера и explicit `/apps/:appId`; профильные тесты, полный `bun run check` и native subscription validation зелёные;
- одноразовый signed bridge `rc.12 -> rc.14` завершён без rollback и потери данных. HostKey работает на `rc.14`, candidate-канал включён, службы и monitoring зелёные; следующий candidate можно впервые устанавливать через web updater;
- полевой тест новой Everywhere-подписки выявил отдельную IPv6-регрессию: Brave Secure DNS передавал Mihomo готовые AAAA-адреса, а IPv4-only HostKey не имеет global IPv6/default route. Из-за этого Cloudflare/GitHub-сайты получали `ERR_CONNECTION_CLOSED`, хотя те же URL по IPv4 через Hysteria отвечали `200`. QUIC `UDP/443` при этом корректно попадал в системный `REJECT`. Локальный post-`rc.14` fix возвращает Mihomo TLS/HTTP/QUIC sniffing, добавляет fail-fast `::/0` для Mihomo/sing-box/Xray/INCY routes и проходит полный `bun run check`, native config validation и изолированный Hysteria-тест принудительного IPv6 literal с TLS SNI.
- первый запуск `rc.14 → rc.16` из web-панели успешно проверил подпись, распаковал release, мигрировал данные и переключил symlink/environment, но завис после `systemctl restart outpost-agent`: updater был дочерним процессом самого agent service, поэтому systemd уничтожил его вместе с cgroup до запуска Outpost и фиксации результата. На HostKey точечно выполнены оставшиеся штатные шаги; сейчас `rc.16`, Outpost, root-agent, Nginx, Hysteria и Xray active, внутренние/внешние health/ready зелёные, SQLite `quick_check=ok`, incoming очищен, зависшая операция закрыта как completed. У пяти application units ноль warning/error; kernel warning — только штатные `UFW BLOCK` внешних сканов и IPv6 multicast;
- post-`rc.16` исправление запускает `apply-update` в отдельном transient-unit systemd без привязанного pipe, сохраняет реальные этапы в SQLite и показывает их в модальном окне и Настройках после reload. Confirmation теперь подтверждает установку конкретной версии, показывает очищенные release notes из GitHub Release и не выносит Minisign в пользовательское решение; HTML-ответ 502 больше не маскируется ошибкой JSON parser. Полный локальный gate: 175 Bun tests/3657 assertions, TypeScript, production Imba build, Go tests, Bash syntax и ShellCheck.
- signed `rc.17` установлен на HostKey; переход из `rc.16` ожидаемо потребовал ручного завершения после self-termination старого agent. Recovery сохранил данные, закрыл operation/audit, очистил incoming/temp и оставил все application services и monitoring зелёными на `rc.17`.
- полные web-переходы `rc.17 → rc.18 → rc.19` завершены transient updater без rollback и потери данных; running binaries совпадают с подписанным `rc.19`, все services и monitoring зелёные, SQLite и 279 внутренних checksum проходят;
- HostKey запрещает парольный SSH-вход для `root`, сохраняя доступ по public key. Уже установленные `rc.17`–`rc.19` нормализованы до `root:root`; чистая установка и будущие updates закрепляют это через `tar --no-same-owner` и финальный `chown`.

## Оставшийся полевой gate

Чистая signed-установка, browser setup и полные web-переходы до `rc.19` на
HostKey завершены. Полевые тесты закрыли content negotiation, IPv6/Secure DNS,
bootstrap-ограничение старого updater и полный transient-unit/UI lifecycle.
Остаются:

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

Точный `rc.12` прошёл чистую установку и browser setup на HostKey. `rc.13`
опубликован и независимо проверен, но старый production backend не обнаруживает
release и не скачивает assets. Следующий checkpoint — публикация signed `rc.14`,
одноразовый bridge `rc.12 → rc.14` без изменения данных и затем отдельный
web-update на следующий candidate, которым проверяется новый механизм end-to-end.

## Кандидат 0.1.0-rc.14

Кандидат превращает прежнюю декоративную кнопку обновления в production flow.
Owner panel проверяет фиксированный публичный GitHub repository, поддерживает
stable и candidate channels, выбирает только более новую SemVer, требует точные
versioned archive/signature assets и ограничивает их размер. Загрузка идёт во
временные файлы под `/var/lib/outpost/incoming`; финальные имена появляются
только после успешной Minisign verification. Пользовательские URL в API не
принимаются.

После staging панель использует существующее preview/confirm. Root-agent заново
проверяет version/path/signature contract, а `apply-update` связывает target с
подписанным manifest, делает SQLite snapshot, атомарный switch и rollback.
Operation ID передаётся отдельным валидированным значением: updater фиксирует
success/failure в SQLite после readiness, а новый control plane восстанавливает
семантическое journal event. Браузер ждёт `/healthz` именно с target version.

Поскольку `rc.12` всегда возвращает `updates.available: false`, он не может сам
перейти на версию, где этот updater реализован. Это ограничение bootstrap старой
версии, а не дефект `rc.14`; первый переход остаётся одноразовым ручным bridge.

## Кандидат 0.1.0-rc.15

HostKey предоставляет только IPv4. Браузеры с собственным Secure DNS могут
передать TUN-клиенту уже разрешённый IPv6 literal, минуя `dns.ipv6: false` в
Mihomo. В `rc.14` такой TCP-сеанс уходил через Hysteria к недоступному IPv6 и
закрывался; домены с AAAA выглядели полностью или частично сломанными.

Кандидат содержит fail-closed fix: Mihomo восстанавливает hostname из HTTP/TLS/QUIC,
чтобы доменные правила и IPv4 server-side resolution снова работали, а
нераспознанный IPv6 отклоняется до catch-all. Эквивалентная защита добавлена в
sing-box, full Xray JSON и INCY routing profile. Активный Everywhere во время
диагностики не перезапускался и не изменялся. Кандидат предназначен для первого
полевого обновления `rc.14 → rc.15` через web updater панели.

## Кандидат 0.1.0-rc.16

Первая попытка web update остановилась безопасно до создания `update.apply`:
compiled `rc.14` вычислил trusted key как `/infra/release/minisign.pub`, хотя
установленный ключ находится в `/opt/outpost/current/infra/release/minisign.pub`.
Archive и signature были корректными, временные файлы удалены, текущий release
остался `rc.14`. `rc.16` выводит путь ключа из фактического
`OUTPOST_WEB_ROOT`, а installer задаёт его явно. Панель сохраняет prepare-error
в карточке версии, показывает progress во время download/apply/restart и
восстанавливает активное обновление из persistent `application_update` и
`operations` после reload страницы или control-plane restart.

## Кандидат 0.1.0-rc.17

Полевое обновление переключило release на `rc.16`, но установленный updater
оборвался на перезапуске root-agent: script выполнялся в cgroup agent service и
был уничтожен самим `systemctl restart outpost-agent`. Исправление запускает
script отдельным transient-unit systemd; его stdout остаётся в journal, поэтому
смерть клиента `systemd-run` не создаёт SIGPIPE для продолжающегося обновления.

Операция сохраняет в SQLite этапы проверки, снимка данных, установки,
перезапуска и readiness. UI показывает GitHub release notes до подтверждения,
а после подтверждения — фактическое сообщение и determinate progress. После
reload Настройки читают тот же persistent stage. Следующий полевой gate —
пройти обновление `rc.16 → rc.17` целиком из панели. На этом переходе запуск
ещё выполняет код `rc.16`; полный новый UI lifecycle и восстановление состояния
проверяются переходом `rc.17 → rc.18`.

## Кандидат 0.1.0-rc.18

Кандидат намеренно минимален: английский статус «Всё работает штатно» сокращён
с `Everything is working normally` до `Everything works`. Он предназначен для
первой полной полевой проверки нового updater и persistent progress переходом
`rc.17 → rc.18`; HostKey до ручного запуска из панели остаётся на `rc.17`.

## Кандидат 0.1.0-rc.19

Кандидат добавляет перенос на чистый сервер через браузер. После подключения
того же постоянного домена first-claim onboarding предлагает либо создать
новую панель, либо загрузить созданный Outpost архив `.age`/`.tar`. Пароль
зашифрованной копии передаётся root-agent через Unix socket и не попадает в
argv, SQLite или access log. После принятия архива интерфейс ждёт возвращения
восстановленного владельца и переводит пользователя на вход с прежним passkey.

Root restore принимает только точный format-1 layout без ссылок, devices,
дубликатов и неожиданных путей; проверяет master key, SQLite, владельца,
passkey, домен, XHTTP/gRPC secrets и native Xray config. Окружение собирается
из allowlist с текущими IP и версией сервера, Nginx пересобирается из доверенного
шаблона. Перед заменой данных создаётся rollback-снимок; после неё выполняются
миграции, проверка Nginx, пяти служб и `/readyz`. Fixed lock и API guard не дают
двум restore пересечься, а first-claim сохраняется при отказе для повторной
попытки.

Карточка переноса и onboarding переведены на четыре локали; upload ограничен
256 МБ и корректно показывает локализованные ошибки даже при HTML 413 от
Nginx. Полный локальный gate проходит: 181 Bun test/3670 assertions,
TypeScript, production Imba build, Go tests/vet/linux build, Bash и ShellCheck.

## Кандидат 0.1.0-rc.20

Кандидат завершает интерфейс обновлений: панель сама проверяет GitHub Releases
раз в шесть часов, публикует изменение через dashboard SSE и показывает
индикатор на Настройках. Карточка версии разделяет проверку и установку,
показывает целевую версию, а после успешного update перезагружает страницу уже
с assets нового release. Уточнены тексты состояния версии и DNS A-записи при
переносе сервера во всех четырёх локалях.

Release hardening устраняет наследование UID GitHub Actions runner: tarball
собирается с numeric owner `0:0`, CI проверяет ownership всех entries, а
bootstrap, installer и updater дополнительно извлекают без сохранения владельца
и нормализуют `/opt/outpost/releases` до `root:root`. Поэтому исправление
действует уже на переходе `rc.19 → rc.20`, хотя его запускает updater из
предыдущей версии.

Полный локальный gate проходит: 183 Bun tests/3691 assertions, TypeScript,
production Imba build, Go tests/vet/linux build, Bash/ShellCheck, actionlint,
native Mihomo/Xray validation, реальный XHTTP+gRPC transport integration,
dependency audit и gitleaks.

## Кандидат 0.1.0-rc.21

Кандидат объединяет очередной интерфейсный проход с управлением временным
доступом. В строке подключения появилось меню действий: подключение можно
приостановить и затем возобновить без перевыпуска постоянной ссылки, отдельно
отредактировать или удалить. Приостановленные подключения исключаются из
подписок, Hysteria auth, Xray recovery config, presence и активной телеметрии;
после возобновления прежний URL снова действует, а устаревший online-state не
показывается как текущий.

Pause/resume проходят через расширенный персистентный `connection_sync_jobs`.
SQLite блокирует ссылку до удаления UUID из обоих Xray inbounds, а при
возобновлении открывает её только после успешного возврата UUID. Failed и
прерванные операции повторяются после restart; миграция сохраняет старые jobs.
Это закрывает расхождение SQLite/Xray при сбое между внешним hot update и
фиксацией состояния.

Экран входа объясняет вход с passkey другого устройства. После успешного
cross-platform входа панель предлагает создать platform passkey на текущем
устройстве, а раздел Доступ объединяет добавление способов входа в отдельном
диалоге с явным предупреждением о правах владельца. Также уточнены таблицы
активности, mobile tabs каталога, удаление подключения, индикация проверки
версии и демонстрационные графики трафика; новые тексты добавлены во все четыре
локали.

Полный локальный gate проходит: 185 Bun tests/3752 assertions, TypeScript,
production Imba build, Go tests/vet/linux build, Bash/ShellCheck, actionlint,
native Mihomo/Xray validation, реальный XHTTP+gRPC transport integration,
dependency audit и gitleaks.

## Кандидат 0.1.0-rc.22

Кандидат содержит небольшой интерфейсный проход. Меню действий подключения
переведено с нативного `details` на управляемый popover: оно закрывается по
клику снаружи и `Escape`, а у нижнего края окна автоматически открывается
вверх. Скругление строки подключения теперь корректно стыкуется с раскрытой
статистикой.

Дублирующий progress bar обновления убран из компактной карточки версии в
Настройках. Фактический persistent progress, этапы и результат операции
по-прежнему отображаются в подтверждающем диалоге и восстанавливаются после
reload.

Полный локальный gate проходит: 185 Bun tests/3757 assertions, TypeScript,
production Imba build, Go tests/vet/linux build, Bash/ShellCheck, actionlint,
native Mihomo/Xray validation, реальный XHTTP+gRPC transport integration,
dependency audit и gitleaks.

## Кандидат 0.1.0-rc.23

Кандидат исправляет автоматическое обновление GeoIP/Geosite на установленном
сервере. Bun подставлял `NODE_ENV` при `--compile`, поэтому release-бинарник,
собранный без build-time `NODE_ENV=production`, навсегда сохранял
`production=false`: installer корректно передавал runtime environment, но
стартовый `refreshRulesets()` не запускался. На HostKey это оставило состояние
rulesets `idle`, пустой каталог и отсутствие ошибок — скачивание ни разу не
начиналось.

Production mode теперь определяется runtime-переменной `OUTPOST_ENV`, которую
создают installer, domain finalizer и restore. Updater добавляет её в старый
environment до запуска нового бинарника, поэтому переход с `rc.22` сам лечит
существующий сервер без ручной правки. Регрессионная проверка компилирует config
тем же Bun target и подтверждает, что `OUTPOST_ENV=production` читается уже при
запуске standalone-бинарника.

Полный локальный gate проходит: 186 Bun tests/3765 assertions, TypeScript,
production Imba build, Linux server и macOS/Linux CLI builds, Go tests/vet/build,
Bash/ShellCheck, native Mihomo/Xray validation и реальный XHTTP+gRPC transport
integration.
