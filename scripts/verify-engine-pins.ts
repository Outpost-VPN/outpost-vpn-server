import {EngineReleases} from "../src/server/adapters/engine-releases";
import {engineIds, engines} from "../src/shared/engines";
import {verifiedDownload} from "./lib/verified-download";

// Exercise the exact signed catalog URLs, including redirects and archive bytes.
// Updating an already installed host does not exercise fresh-install downloads.
const releases = new EngineReleases();
for (const engine of engineIds) {
  if (engines[engine].archive === "bundled") continue;
  const artifact = await releases.resolve(engine, engines[engine].version);
  await verifiedDownload(artifact.url, artifact.checksum);
  console.log(`${engine} ${artifact.version}: pinned archive verified`);
}
