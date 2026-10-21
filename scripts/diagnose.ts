import {diagnose} from "../src/cli/diagnose";
try {await diagnose(Bun.argv.slice(2));} catch {console.error("Diagnostic runner failed; inspect diagnostic_get for recorded stages and check the interface and native client binaries."); process.exitCode = 1;}
