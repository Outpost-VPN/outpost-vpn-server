import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OutpostDatabase } from "../src/server/db/database";

export function database() {
  const directory = mkdtempSync(join(tmpdir(), "outpost-test-"));
  const db = new OutpostDatabase(join(directory, "test.sqlite"));
  return {
    db,
    directory,
    close() {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
