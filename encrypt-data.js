const fs = require("node:fs");
const { webcrypto } = require("node:crypto");

const crypto = globalThis.crypto?.subtle ? globalThis.crypto : webcrypto;
const subtle = crypto.subtle;

function u32le(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

async function main() {
  const password = process.env.DATA_PASSWORD || process.argv[2];
  if (!password) {
    process.stderr.write("需要提供口令：DATA_PASSWORD=你的口令 node encrypt-data.js\n");
    process.exit(1);
  }

  const iter = Number(process.env.PBKDF2_ITER || 600000);
  if (!Number.isFinite(iter) || iter <= 0) {
    process.stderr.write("PBKDF2_ITER 必须是正整数\n");
    process.exit(1);
  }

  const input = process.env.DATA_JSON || "data.json";
  const output = process.env.DATA_ENC || "data.enc";
  const text = fs.readFileSync(input, "utf8");
  JSON.parse(text);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const baseKey = await subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const key = await subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const ct = new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text))
  );

  const out = Buffer.concat([
    Buffer.from("ETP1"),
    u32le(iter),
    Buffer.from(salt),
    Buffer.from(iv),
    Buffer.from(ct)
  ]);

  fs.writeFileSync(output, out);
  process.stdout.write(`已生成 ${output}\n`);
}

main().catch((e) => {
  process.stderr.write(`${e?.stack || e}\n`);
  process.exit(1);
});
