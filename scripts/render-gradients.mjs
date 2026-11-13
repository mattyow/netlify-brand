// Renders the 24 preset previews used across the hub with the gradient API engine.
process.env.GRADIENT_API_KEY ||= "local-render";
const KEY = process.env.GRADIENT_API_KEY;
const api = (await import(new URL("../netlify/functions/gradient-api.mjs", import.meta.url).href)).default;
const { writeFileSync } = await import("node:fs");
const H = { authorization: `Bearer ${KEY}` };
let r = await api(new Request("https://x.test/api/v1"), {}); console.log("index", r.status, (await r.json()).docsPage);
r = await api(new Request("https://x.test/api/v1/gradient?preset=1"), {}); console.log("nokey", r.status);
const tones = {};
for (let i = 1; i <= 24; i++) {
  const id = String(i).padStart(2, "0");
  for (const [suf, w, h] of [["sq", 640, 640], ["wide", 1600, 900]]) {
    const t0 = Date.now();
    r = await api(new Request(`https://x.test/api/v1/gradient?preset=${i}&width=${w}&height=${h}&output=webp&quality=80`, { headers: H }), {});
    if (r.status !== 200) { console.log(id, suf, r.status, await r.text()); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    writeFileSync(`${new URL("../public/assets/gradients/", import.meta.url).pathname}${id}-${suf}.webp`, buf);
    if (suf === "sq") tones[id] = r.headers.get("x-gradient-text-color");
    if (i === 1) console.log(id, suf, buf.length, Date.now() - t0, "ms");
  }
}
console.log(JSON.stringify(tones));
