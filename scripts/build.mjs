import { copyFile, mkdir, rm } from "node:fs/promises";
import { context } from "esbuild";

const watch = process.argv.includes("--watch");
const outdir = "dist";

const sharedOptions = {
  bundle: true,
  logLevel: "info",
  sourcemap: true,
  target: "es2020",
};

const codeOptions = {
  ...sharedOptions,
  entryPoints: ["src/code.ts"],
  outfile: `${outdir}/code.js`,
  format: "iife",
};

const uiOptions = {
  ...sharedOptions,
  entryPoints: ["src/ui.ts"],
  outfile: `${outdir}/ui.js`,
  format: "iife",
};

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await copyFile("src/ui.html", `${outdir}/ui.html`);

const codeContext = await context(codeOptions);
const uiContext = await context(uiOptions);

if (watch) {
  await Promise.all([codeContext.watch(), uiContext.watch()]);
  console.log("Watching plugin sources. Re-run build if src/ui.html changes.");
} else {
  await Promise.all([codeContext.rebuild(), uiContext.rebuild()]);
  await Promise.all([codeContext.dispose(), uiContext.dispose()]);
}
