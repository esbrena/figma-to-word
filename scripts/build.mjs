import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { context } from "esbuild";

const watch = process.argv.includes("--watch");
const outdir = "dist";

const sharedOptions = {
  bundle: true,
  logLevel: "info",
  sourcemap: watch ? "inline" : false,
  target: "es2017",
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
  write: false,
  plugins: [
    {
      name: "inline-ui-script",
      setup(build) {
        build.onEnd(async (result) => {
          if (result.errors.length > 0 || !result.outputFiles) {
            return;
          }

          const script = result.outputFiles.find((file) => file.path.endsWith(".js"));

          if (!script) {
            throw new Error("UI bundle was not generated.");
          }

          const html = await readFile("src/ui.html", "utf8");
          const inlinedHtml = html.replace(
            '<script src="./ui.js"></script>',
            () => `<script>\n${script.text}\n</script>`,
          );

          await writeFile(`${outdir}/ui.html`, inlinedHtml);
        });
      },
    },
  ],
};

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const codeContext = await context(codeOptions);
const uiContext = await context(uiOptions);

if (watch) {
  await Promise.all([codeContext.watch(), uiContext.watch()]);
  console.log("Watching plugin sources. Re-run build if src/ui.html changes.");
} else {
  await Promise.all([codeContext.rebuild(), uiContext.rebuild()]);
  await Promise.all([codeContext.dispose(), uiContext.dispose()]);
}
