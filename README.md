# Matreshka — панель

Self-hosted-панель для одного владельца, его близких и устройств. Matreshka разворачивает и поддерживает Hysteria 2 и VLESS + XHTTP на одном домене, выдаёт подписки для INCY и Everywhere/Mihomo, публикует общие правила маршрутизации и считает трафик по людям и устройствам без истории посещённых доменов.

> Статус: `0.1.0`, pre-release. Локальные тесты, production-сборки и подписанный RC проходят; первая полевая установка ещё должна пройти VM/VPS gate из [STATUS.md](STATUS.md).

## Архитектура

```text
UDP/443 → Hysteria 2
TCP/443 → Nginx → секретный XHTTP path → Xray на localhost
                 → admin/API/subscriptions → Matreshka на localhost
                 → остальные запросы → нейтральная страница
```

- интерфейс — Imba, собранный `bimba`;
- control plane — Bun + TypeScript + SQLite;
- привилегированные операции — минимальный Go-agent с allowlist;
- CLI/MCP — `matreshkactl`;
- Nginx, Hysteria 2 и Xray — отдельные systemd-службы;
- изменяемые настройки и ревизии живут в SQLite, независимо от release-каталогов.
- активация и отзыв устройств синхронизируются с Xray через персистентный SQLite-outbox;
- release archive подписывается Minisign, а installer/updater проверяют подпись до распаковки.

Подробности: [архитектура](docs/ARCHITECTURE.md), [разработка](docs/DEVELOPMENT.md), [развёртывание](docs/DEPLOYMENT.md), [безопасность](docs/SECURITY.md).

## Структура репозитория

- `src/web/` — Imba-интерфейс панели.
- `src/server/` — Bun/TypeScript API, SQLite, авторизация и сервисы.
- `src/cli/` — CLI и локальный MCP-сервер.
- `agent/` — минимальный привилегированный Go-agent.
- `infra/` — Nginx, systemd и скрипты установки/обновления.
- `assets/` и `public/` — исходные и собранные web-ресурсы.
- `tests/` — unit и integration тесты control plane.
- `docs/` — архитектура, разработка, deployment и security model.

## Локальная разработка

Нужны Bun 1.3.13 и Go 1.24+.

```bash
bun install --frozen-lockfile
bun run check
bun run dev
```

Панель с демонстрационными данными откроется на `http://localhost:8181/admin/`, а интерактивный pre-launch preview — на `http://localhost:8181/admin/setup?bootstrap=preview`.

## Сборка и первый запуск

Целевой путь v1 не требует локального приложения и покупки домена: одна команда запускается в web-консоли VPS, после чего бесплатный hostname или собственный домен, DNS, HTTPS и владелец настраиваются в браузере. Passkey создаётся только после перехода на постоянный HTTPS-адрес.

Текущий developer deploy остаётся до реализации публичного server-side installer:

```bash
bun run build
MATRESHKA_AGENT_BINARY=dist/matreshka-agent \
MATRESHKA_MINISIGN_SECRET_KEY="$HOME/.config/matreshka/release.key" \
MATRESHKA_REQUIRE_SIGNATURE=1 bun run release:linux
./dist/matreshkactl-darwin-arm64 deploy root@SERVER --domain proxy.example.com
```

Этот developer deploy пока требует заранее направить A-запись на VPS. Целевой first-run flow описан в [документации по развёртыванию](docs/DEPLOYMENT.md).

## Лицензия

Matreshka распространяется по [GNU AGPL-3.0-only](LICENSE). Сведения о зависимостях — в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Именование

Публичное имя во всех языках интерфейса и документации пишется как `Matreshka`;
package name и GitHub-репозиторий используют `matreshka-panel`. Службы, CLI,
каталоги данных и environment variables используют `matreshka*` и
`MATRESHKA_*`; legacy-алиасов нет.
