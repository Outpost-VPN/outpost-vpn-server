import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MatreshkaDatabase } from "../src/server/db/database";

export function database() {
  const directory = mkdtempSync(join(tmpdir(), "matreshka-test-"));
  const db = new MatreshkaDatabase(join(directory, "test.sqlite"));
  return {
    db,
    directory,
    close() {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
