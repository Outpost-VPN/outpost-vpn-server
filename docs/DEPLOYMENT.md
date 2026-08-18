# Развёртывание и эксплуатация

## Требования

- чистая Ubuntu 24.04 amd64;
- один публичный IPv4;
- снаружи доступны TCP 80/443 и UDP 443;
- доступ к web-консоли VPS или SSH для одной стартовой команды;
- бесплатный hostname в поддерживаемом DNS-сервисе либо собственный домен, DNS которого можно изменить.

## Целевая первая установка v1

1. Владелец вставляет одну команду в web-консоль хостера. Локальный `matreshkactl` не требуется.
2. Installer проверяет Ubuntu и порты, верифицирует подписанный release, ставит control plane и получает короткоживущий Let's Encrypt certificate для public IP.
3. В консоль выводится одноразовая `https://<ip>/admin/setup?...` ссылка, действующая 1 час.
4. Pre-launch UI предлагает получить бесплатный hostname через DuckDNS, FreeMyIP или dynv6 либо подключить собственный домен. Затем показывает точную A-запись и опрашивает DNS.
5. После подтверждения DNS сервер получает обычный certificate для домена, атомарно применяет Nginx/Hysteria/Xray configs и перенаправляет браузер на `https://<domain>/admin/onboarding?...`.
6. Владелец и passkey создаются только на конечном HTTPS origin/RP ID. После этого IP-bootstrap отключается.

Временный IP certificate не используется как WebAuthn RP ID и не попадает в клиентские профили. Он защищает только pre-launch сессию. Внешний DNS-сервис выдаёт только hostname: certificate выпускает сама Matreshka, а credentials или tokens этого сервиса панель в v1 не хранит.

## Текущий developer deploy

Пока server-side installer не реализован, разработчик заранее направляет A-запись на VPS и запускает deploy из monorepo:

```bash
bun install --frozen-lockfile
bun run build:cli:mac
./dist/matreshkactl-darwin-arm64 deploy root@203.0.113.10 --domain proxy.example.com
```

Developer deploy по-прежнему требует локальные Bun, Go, SSH и SCP. Это временное ограничение текущей реализации, а не контракт продукта.

Developer deploy также требует локальный Minisign key вне репозитория. Канонический public key находится в `infra/release/minisign.pub`; private key хранится отдельно и загружен как environment secret `release/MINISIGN_SECRET_KEY` в GitHub.

## Каталоги

```text
/opt/matreshka/releases/<version>  immutable application bundles
/opt/matreshka/current             active symlink
/opt/matreshka/engines             versioned Hysteria/Xray
/etc/matreshka                     environment and rendered configs
/var/lib/matreshka                 SQLite, master key, runtime and backups
```

## Обновление

```bash
MATRESHKA_VERSION=0.1.1 \
MATRESHKA_AGENT_BINARY=dist/matreshka-agent \
MATRESHKA_MINISIGN_SECRET_KEY="$HOME/.config/matreshka/release.key" \
MATRESHKA_REQUIRE_SIGNATURE=1 bun run release:linux
./dist/matreshkactl-darwin-arm64 update root@SERVER \
  --bundle release/matreshka-0.1.1-linux-amd64.tar.gz \
  --signature release/matreshka-0.1.1-linux-amd64.tar.gz.minisig
```

Updater сначала проверяет detached Minisign signature ключом из уже доверенной установленной версии и только затем распаковывает archive и сверяет внутренний `SHA256SUMS`, включая `manifest.json`. Он оставляет минимум две предыдущие версии. После неуспешного readiness автоматически восстанавливаются code symlink и предмиграционный SQLite snapshot.

GitHub workflow `Signed release` запускается только вручную для уже существующего `v*` tag. Build/test выполняются без ключа; отдельный job в environment `release` получает private key, подписывает archive, повторно проверяет подпись и публикует immutable GitHub Release. Текущий тариф приватного репозитория не поддерживает required reviewer для environment, поэтому ручной `workflow_dispatch` является обязательным approval gate.

## Backup и restore

На сервере интерактивно:

```bash
sudo /opt/matreshka/current/bin/matreshkactl backup export /var/lib/matreshka/backups/manual.age
```

UI создаёт тот же стандартный age passphrase archive, но шифрование выполняет root-agent без передачи passphrase в argv, SQLite или audit log.

Restore выполняется после установки, пока владелец ещё не создан:

```bash
sudo /opt/matreshka/current/bin/matreshkactl restore /path/to/backup.age
```

Архив содержит SQLite, master key, `/etc/matreshka` и Nginx site config. Engine binaries и TLS certificates не включаются. Для переноса тот же домен нужно направить на новый IP и получить новый сертификат до restore.

## MCP

Создайте scoped API token в REST API и на локальном компьютере задайте:

```bash
export MATRESHKA_URL=https://proxy.example.com
export MATRESHKA_TOKEN=...
./dist/matreshkactl-darwin-arm64 mcp
```

Публичный MCP-порт не используется. Деструктивные действия требуют `operation_preview`, затем `operation_confirm` с неизменившимися action и payload.
