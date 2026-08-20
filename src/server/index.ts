import { config } from "./config";
import { OutpostDatabase } from "./db/database";
import { HttpApplication } from "./http";
import { seedDemo } from "./demo";

const db = new OutpostDatabase();
const app = new HttpApplication(db);

app.connectionSync.recoverInterrupted();
if (config.demo) await seedDemo(app);

const bootstrapUrl = app.auth.ensureBootstrap();
if (bootstrapUrl) {
  console.info("\nOutpost готова к первоначальной настройке.");
  console.info(`Одноразовая ссылка (действует 1 час): ${bootstrapUrl}\n`);
}

const server = Bun.serve({
  hostname: config.hostname,
  port: config.port,
  fetch: (request) => app.fetch(request),
});

console.info(`Outpost ${config.version} слушает ${server.url.origin}${config.adminPath}/`);

const trafficTimer = setInterval(() => void app.traffic.collect(), 30_000);
const monitoringTimer = setInterval(() => void app.monitoring.collect(), 60_000);
const connectionSyncTimer = setInterval(() => void app.connectionSync.drain(), 5_000);
const rulesetTimer = setInterval(() => void app.rulesets.refresh(), config.rulesetCheckHours * 60 * 60 * 1_000);
void app.traffic.collect();
void app.monitoring.collect();
void app.connectionSync.drain();
if (config.production && !config.setup) void app.rulesets.refresh();

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    clearInterval(trafficTimer);
    clearInterval(monitoringTimer);
    clearInterval(connectionSyncTimer);
    clearInterval(rulesetTimer);
    db.close();
    server.stop(true);
    process.exit(0);
  });
}
