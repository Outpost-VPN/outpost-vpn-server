import { config } from "./config";
import { OutpostDatabase } from "./db/database";
import { HttpApplication } from "./http";
import { seedDemo } from "./demo";

const db = new OutpostDatabase();
const app = new HttpApplication(db);

app.connectionSync.recoverInterrupted();
if (config.demo) await seedDemo(app);

const server = Bun.serve({
  hostname: config.hostname,
  port: config.port,
  // Signed release staging may spend up to three minutes downloading from
  // GitHub before the handler returns a response. Bun caps this value at 255s.
  idleTimeout: 255,
  fetch: (request) => app.fetch(request),
});

console.info(`Outpost ${config.version} слушает ${server.url.origin}${config.adminPath}/`);

const trafficTimer = setInterval(() => void app.collectTraffic(), 30_000);
const monitoringTimer = setInterval(() => void app.collectMonitoring(), 60_000);
const connectionSyncTimer = setInterval(() => void app.syncConnections(), 5_000);
const rulesetTimer = setInterval(() => void app.refreshRulesets(), config.rulesetCheckHours * 60 * 60 * 1_000);
const updateTimer = setInterval(() => void app.checkUpdates(), config.updateCheckHours * 60 * 60 * 1_000);
void app.collectTraffic();
void app.collectMonitoring();
void app.syncConnections();
if (config.production && !config.setup) {
  void app.refreshRulesets();
  void app.checkUpdates();
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    clearInterval(trafficTimer);
    clearInterval(monitoringTimer);
    clearInterval(connectionSyncTimer);
    clearInterval(rulesetTimer);
    clearInterval(updateTimer);
    db.close();
    server.stop(true);
    process.exit(0);
  });
}
