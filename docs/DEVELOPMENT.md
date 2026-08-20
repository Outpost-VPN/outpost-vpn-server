# Разработка

## Команды

```bash
bun install --frozen-lockfile
bun run dev             # demo server on 127.0.0.1:8181
bun run dev:web         # Imba watcher
bun run check           # TypeScript + Imba + Bun tests
bun scripts/install-native-tools.ts
bun run check:subscriptions-native
bun run check:transports-integration
bun run build            # server and CLIs
cd agent && go test ./...
shellcheck infra/scripts/apply-update infra/scripts/install infra/scripts/deploy-remote
actionlint .github/workflows/*.yml
```

Файлы Imba используют tabs. Пользовательские строки должны добавляться в `src/web/i18n.imba`, даже если v1 отображает только русский.

## Структура

```text
src/server/              API, SQLite, adapters and services
src/web/                 Imba application
src/cli/                 outpostctl and MCP server
agent/                   privileged Go helper
infra/                   install/update/backup scripts and units
tests/                   Bun unit/integration/golden tests
docs/design/             four accepted UI references
```

## Правила изменений

- settings из UI всегда сохраняются в SQLite через migrations; `localStorage` не является source of truth;
- defaults добавляются через `INSERT OR IGNORE`, не overwrite;
- engine template не меняется автоматически при обновлении preset;
- любой новый root-agent action требует строгой policy, unit test и preview/confirmation contract;
- subscription renderer не должен знать о приложениях: соответствие app → format/deep link хранится только в versioned catalog;
- subscription output меняется только с golden tests, проверкой официальной документации технологии и native `mihomo`/`sing-box`/`xray` validation;
- GeoIP/Geosite bundle обязан содержать точные upstream commits и licenses; подписанный manifest проверяется отдельно от application release;
- secret-bearing paths должны оставаться с `access_log off`;
- application update не должен перезапускать Hysteria/Xray.
- release manifest должен входить в `SHA256SUMS`, а detached signature всегда проверяется до archive extraction;
- GitHub Actions подключаются только по полному commit SHA.

## Acceptance

Полная готовность v1 определяется не только CI, но и полевыми критериями из [STATUS.md](../STATUS.md). VM/VPS сценарии нельзя заменять моками в отчёте о готовности.
