import { config } from "./config";
import { MatreshkaDatabase } from "./db/database";
import { HttpApplication } from "./http";
import { seedDemo } from "./demo";

const db = new MatreshkaDatabase();
const app = new HttpApplication(db);

app.deviceSync.recoverInterrupted();
if (config.demo) await seedDemo(app);

const bootstrapUrl = app.auth.ensureBootstrap();
if (bootstrapUrl) {
  console.info("\nMatreshka готова к первоначальной настройке.");
  console.info(`Одноразовая ссылка (действует 1 час): ${bootstrapUrl}\n`);
}

const server = Bun.serve({
  hostname: config.hostname,
  port: config.port,
  fetch: (request) => app.fetch(request),
});

console.info(`Matreshka ${config.version} слушает ${server.url.origin}${config.adminPath}/`);

const trafficTimer = setInterval(() => void app.traffic.collect(), 30_000);
const monitoringTimer = setInterval(() => void app.monitoring.collect(), 60_000);
const deviceSyncTimer = setInterval(() => void app.deviceSync.drain(), 5_000);
void app.traffic.collect();
void app.monitoring.collect();
void app.deviceSync.drain();

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    clearInterval(trafficTimer);
    clearInterval(monitoringTimer);
    clearInterval(deviceSyncTimer);
    db.close();
    server.stop(true);
    process.exit(0);
  });
}
