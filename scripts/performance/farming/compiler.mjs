import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { declarations, compilerSources } from "./workloads.mjs";

const start = performance.now();
const cpuStart = process.cpuUsage();
const require = createRequire(import.meta.url);
const ts = require("typescript");
const libraryDirectory = dirname(require.resolve("typescript"));
const libraries = new Map(readdirSync(libraryDirectory)
  .filter((name) => /^lib\..*\.d\.ts$/.test(name))
  .map((name) => [`/lib/${name}`, readFileSync(join(libraryDirectory, name), "utf8")]));
const sources = compilerSources();
const source = sources[process.argv[2]];
if (source === undefined) throw new Error("Unknown compiler workload");
const files = new Map([...libraries, ["/main.ts", source], ["/api.d.ts", declarations]]);
let emitted = "";
const options = {
  strict: true, noEmitOnError: true, target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext,
  lib: ["lib.es2023.d.ts"], types: [], skipLibCheck: false,
};
const host = {
  getSourceFile: (name, languageVersion) => files.has(name) ? ts.createSourceFile(name, files.get(name), languageVersion) : undefined,
  getDefaultLibFileName: () => "/lib/lib.es2023.d.ts",
  getDefaultLibLocation: () => "/lib",
  writeFile: (name, text) => { if (name === "/main.js") emitted = text; },
  getCurrentDirectory: () => "/", getDirectories: () => [],
  fileExists: (name) => files.has(name), readFile: (name) => files.get(name),
  getCanonicalFileName: (name) => name, useCaseSensitiveFileNames: () => true, getNewLine: () => "\n",
};
const program = ts.createProgram(["/main.ts", "/api.d.ts"], options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
const result = program.emit();
const usage = process.cpuUsage(cpuStart);
process.send({
  version: ts.version, workload: process.argv[2], wallMs: performance.now() - start,
  cpuMs: (usage.user + usage.system) / 1000, rss: process.memoryUsage().rss,
  maxRssKiB: process.resourceUsage().maxRSS, sourceBytes: Buffer.byteLength(source),
  emittedBytes: Buffer.byteLength(emitted), emitted,
  errors: [...diagnostics, ...result.diagnostics].map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
});
process.disconnect();
