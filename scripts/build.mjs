// Wraps each src/pages/*.html body in the shared shell and writes it to public/.
// Page sources start with:  <!-- title: Page title | desc: Meta description | out: path/in/public.html -->
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const src = join(root, "src/pages");
const shell = readFileSync(join(root, "src/shell.html"), "utf8");

for (const file of readdirSync(src).filter(f => f.endsWith(".html"))) {
  const raw = readFileSync(join(src, file), "utf8");
  const m = raw.match(/^<!--\s*title:\s*(.*?)\s*\|\s*desc:\s*(.*?)\s*\|\s*out:\s*(.*?)\s*(\|\s*robots:\s*(.*?)\s*)?-->/);
  if (!m) throw new Error(`Missing header in ${file}`);
  const [, title, desc, out, , robots] = m;
  const body = raw.slice(m[0].length).trim();
  const html = shell
    .replaceAll("{{title}}", title)
    .replaceAll("{{desc}}", desc)
    .replace("{{robots}}", robots ? `<meta name="robots" content="${robots}">` : "")
    .replace("{{body}}", body);
  const dest = join(root, "public", out);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, html);
  console.log("built", out);
}
