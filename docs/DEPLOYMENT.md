# Развёртывание и эксплуатация

## Требования

- чистая Ubuntu 24.04 amd64;
- один публичный IPv4;
- снаружи доступны TCP 80/443 и UDP 443;
- доступ к web-консоли VPS или SSH для одной стартовой команды;
- бесплатный hostname в поддерживаемом DNS-сервисе либо собственный домен, DNS которого можно изменить.

Установка рядом с существующими сервисами не поддерживается. Если занят хотя бы
один из портов TCP 80, TCP 443 или UDP 443, installer завершится до любых
изменений и попросит чистый Ubuntu VPS. Альтернативного внешнего порта нет.

## Первая установка

1. Владелец вставляет одну команду в web-консоль хостера. Локальный `outpostctl` не требуется.
2. Installer проверяет Ubuntu и порты, верифицирует подписанный release, ставит control plane и получает короткоживущий Let's Encrypt certificate для public IP.
3. В консоль выводится фиксированный адрес `https://<ip>/`; setup открывается прямо в его корне.
4. Pre-launch UI предлагает получить бесплатный hostname через DuckDNS, FreeMyIP или dynv6 либо подключить собственный домен. Затем показывает точную A-запись и опрашивает DNS.
5. После подтверждения DNS сервер получает обычный certificate для домена, атомарно применяет Nginx/Hysteria/Xray configs, создаёт внутренний одноразовый claim и перенаправляет браузер на `https://<domain>/admin/onboarding?claim=...`.
6. Владелец и passkey создаются только на конечном HTTPS origin/RP ID. Claim хранится только как hash, действует 1 час и уничтожается после регистрации владельца.

IP certificate не используется как WebAuthn RP ID и не попадает в клиентские профили. После настройки он сохраняется и продлевается для безопасного предупреждения на `https://<ip>/`; через этот vhost не доступны WebAuthn, dashboard, мутации, подписки и transports. Внешний DNS-сервис выдаёт только hostname: certificate выпускает сама Outpost, а credentials или tokens этого сервиса панель в v1 не хранит.

Запустите в web-консоли VPS:

```bash
curl -fsSLo /tmp/outpost-install https://raw.githubusercontent.com/Outpost-VPN/outpost-vpn-server/main/infra/scripts/bootstrap && sudo bash /tmp/outpost-install
```

Для field test конкретного pre-release:

```bash
curl -fsSLo /tmp/outpost-install https://raw.githubusercontent.com/Outpost-VPN/outpost-vpn-server/main/infra/scripts/bootstrap && sudo env OUTPOST_VERSION=0.1.0-rc.15 bash /tmp/outpost-install
```

Bootstrap устанавливает `curl`, CA certificates и Minisign, определяет release, скачивает archive и signature с GitHub и проверяет встроенным public key до запуска release installer. Release installer повторно проверяет подпись, затем ставит Nginx, UFW, SQLite/age, pinned tunnel engines и актуальный Certbot из официального snap. Ubuntu 24.04 содержит Certbot 2.9, а IP certificates требуют Certbot 5.4+; поэтому apt-версия Certbot не используется.

`apt-get update` обновляет только индекс пакетов, а `apt-get install` добавляет зависимости Outpost. Installer не выполняет `full-upgrade`, не меняет kernel и не перезагружает VPS.

Если browser handoff первоначальной настройки был потерян или существующий
владелец потерял доступ к passkey, запустите server-local команду:

```bash
sudo outpostctl bootstrap-reset
```

До создания владельца команда аннулирует прежний initial claim и выдаёт новый
URL на уже подключённом постоянном домене. Для существующего владельца она
завершает активные сессии и выдаёт ограниченный recovery URL для регистрации
нового passkey, не открывая повторную настройку домена.

## Developer deploy

Для отладки release pipeline разработчик может собрать подписанный archive локально и передать его на чистый VPS по SSH:

```bash
bun install --frozen-lockfile
bun run build:cli:mac
./dist/outpostctl-darwin-arm64 deploy root@203.0.113.10
```

Developer deploy требует локальные Bun, Go, SSH, SCP и release signing key. Он запускает тот же IP-first installer и не является пользовательским installation surface.

Developer deploy также требует локальный Minisign key вне репозитория. Канонический public key находится в `infra/release/minisign.pub`; private key хранится отдельно и загружен как environment secret `release/MINISIGN_SECRET_KEY` в GitHub.

## Каталоги

```text
/opt/outpost/releases/<version>  immutable application bundles
/opt/outpost/current             active symlink
/opt/outpost/engines             versioned Hysteria/Xray
/etc/outpost                     environment and rendered configs
/var/lib/outpost                 SQLite, master key, runtime and backups
```

## Обновление

Владелец обновляет установленный Outpost в разделе «Настройки панели». Кнопка
«Проверить» читает публичные GitHub Releases из фиксированного репозитория.
Канал «Стабильные версии» пропускает pre-release; канал «Кандидаты на релиз»
также предлагает версии `-rc.*`. Установки текущего release candidate один раз
автоматически переводятся в канал кандидатов, после чего выбор сохраняется.

После выбора версии сервер сам загружает archive и `.minisig` во временные файлы
в `/var/lib/outpost/incoming`, проверяет точные имена, URL и размеры assets и
Minisign-подпись ключом из уже установленного release. Только после успешной
проверки файлы атомарно получают окончательные имена, а панель открывает
двухэтапное подтверждение. Заявленная версия привязана к имени archive и к
подписанному `manifest.json`; downgrade через панель отклоняется.

Во время применения control plane перезапускается, поэтому браузер ждёт
возвращения `/healthz` именно с целевой версией. Статус операции фиксируется в
SQLite самим привилегированным updater и после старта появляется в журнале.
Hysteria и Xray продолжают работать, если обновлению не требуется безопасное
согласование их versioned presets.

CLI ниже остаётся recovery/developer-путём для локально собранного подписанного
archive:

```bash
OUTPOST_VERSION=0.1.1 \
OUTPOST_AGENT_BINARY=dist/outpost-agent \
OUTPOST_MINISIGN_SECRET_KEY="$HOME/.config/outpost/release.key" \
OUTPOST_REQUIRE_SIGNATURE=1 bun run release:linux
./dist/outpostctl-darwin-arm64 update root@SERVER \
  --bundle release/outpost-0.1.1-linux-amd64.tar.gz \
  --signature release/outpost-0.1.1-linux-amd64.tar.gz.minisig
```

Updater сначала проверяет detached Minisign signature ключом из уже доверенной установленной версии и только затем распаковывает archive и сверяет внутренний `SHA256SUMS`, включая `manifest.json`. Он оставляет минимум две предыдущие версии. После неуспешного readiness автоматически восстанавливаются code symlink и предмиграционный SQLite snapshot. Успешно применённые входящие archive и signature удаляются.

GitHub workflow `Signed release` запускается только вручную из ветки `main` для уже существующего `v*` tag и делает checkout по точному `refs/tags/<tag>`. Tag обязан точно совпадать с версией в `package.json`. Build/test выполняются без ключа; отдельный job в environment `release`, ограниченном веткой `main`, получает private key, подписывает archive, повторно проверяет подпись и публикует immutable GitHub Release. Версии с дефисом, например `v0.1.0-rc.15`, помечаются как pre-release и не выбираются bootstrap-командой без явного `OUTPOST_VERSION`; web updater видит их только в канале кандидатов.

Workflow `Signed rule-set bundle` работает отдельно от application releases. Он ежедневно получает официальные SagerNet SRS, закрепляет upstream commits, включает source/license metadata, подписывает `rulesets.json` и обновляет стабильный release `rulesets`. Установленный сервер проверяет manifest раз в сутки, хранит активную и две предыдущие версии; ручное обновление доступно через owner API `POST /api/v1/rulesets/refresh`.

## Backup и restore

На сервере интерактивно:

```bash
sudo /opt/outpost/current/bin/outpostctl backup export /var/lib/outpost/backups/manual.age
```

UI создаёт тот же стандартный age passphrase archive, но шифрование выполняет root-agent без передачи passphrase в argv, SQLite или audit log.

Restore выполняется после установки, пока владелец ещё не создан:

```bash
sudo /opt/outpost/current/bin/outpostctl restore /path/to/backup.age
```

Архив содержит SQLite, master key, `/etc/outpost` и Nginx site config. Engine binaries и TLS certificates не включаются. Для переноса тот же домен нужно направить на новый IP и получить новый сертификат до restore.

## MCP

Создайте scoped API token в REST API и на локальном компьютере задайте:

```bash
export OUTPOST_URL=https://proxy.example.com
export OUTPOST_TOKEN=...
./dist/outpostctl-darwin-arm64 mcp
```

Публичный MCP-порт не используется. Повторное получение секретной ссылки подключения требует scope `connections:secret`. Перевыпуск credentials требует `connections:rotate` и выполняется только через `operation_preview`/`connection_rotate`, затем `operation_confirm` с неизменившимися action и payload.
