const columns = [
  { key: "person", label: "人员" },
  { key: "examType", label: "考试大类" },
  { key: "examSubType", label: "考试类型" },
  { key: "position", label: "报考单位" },
  { key: "examTime", label: "考试时间" },
  { key: "note", label: "备注" },
  { key: "xingceScore", label: "行测分数" },
  { key: "shenlunScore", label: "申论分数" },
  { key: "writtenRank", label: "笔试排名" },
  { key: "interviewScore", label: "面试分数" },
  { key: "totalRank", label: "总排名" }
];

let rawData = [];
let viewData = [];
let sortKey = "examTime";
let sortDir = "desc";

const $ = (id) => document.getElementById(id);

function safeText(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

async function decryptDataEnc(password) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("当前环境不支持解密，请用 https 或 localhost 打开");

  const res = await fetch("./data.enc", { cache: "no-store" });
  if (!res.ok) throw new Error("data.enc 加载失败");
  const buf = await res.arrayBuffer();
  const u8 = new Uint8Array(buf);

  if (u8.length < 36) throw new Error("data.enc 格式错误");
  if (
    u8[0] !== 0x45 ||
    u8[1] !== 0x54 ||
    u8[2] !== 0x50 ||
    u8[3] !== 0x31
  ) {
    throw new Error("data.enc 格式错误");
  }

  const iter = new DataView(buf, 4, 4).getUint32(0, true);
  const salt = u8.slice(8, 24);
  const iv = u8.slice(24, 36);
  const ct = u8.slice(36);

  if (!password) throw new Error("请输入口令");
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
    ["decrypt"]
  );

  const plainBuf = await subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plainBuf);
}

function escapeHtml(s) {
  return safeText(s).replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

function sanitizeExcelCell(v) {
  const s = safeText(v);
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function getExportFileName() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `考试记录表_${y}${m}${day}_${hh}${mm}.xls`;
}

function buildExcelHtml(list) {
  const header = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
  const body = list
    .map((row) => {
      const tds = columns
        .map((col) => {
          let v = "";
          if (col.key.endsWith("Time")) v = normalizeDate(row[col.key]);
          else v = safeText(row[col.key]).trim();
          v = sanitizeExcelCell(v);
          return `<td>${escapeHtml(v)}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8" /></head><body><table border="1"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

function exportExcel(list) {
  const html = buildExcelHtml(list);
  const blob = new Blob(["\ufeff", html], {
    type: "application/vnd.ms-excel;charset=utf-8"
  });
  downloadBlob(blob, getExportFileName());
}

function parseNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function normalizeDate(v) {
  const s = safeText(v).trim();
  if (!s) return "";
  const t = Date.parse(s.replace(/-/g, "/"));
  if (Number.isNaN(t)) return s;
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const hasTime = /(\d{1,2}:\d{2})/.test(s);
  return hasTime ? `${y}-${m}-${day} ${hh}:${mm}` : `${y}-${m}-${day}`;
}

function compareValue(a, b) {
  const av = safeText(a).trim();
  const bv = safeText(b).trim();
  const at = Date.parse(av.replace(/-/g, "/"));
  const bt = Date.parse(bv.replace(/-/g, "/"));
  const ad = Number.isNaN(at) ? null : at;
  const bd = Number.isNaN(bt) ? null : bt;

  if (ad !== null || bd !== null) {
    const x = ad ?? -Infinity;
    const y = bd ?? -Infinity;
    return x - y;
  }
  return av.localeCompare(bv, "zh-Hans-CN", {
    numeric: true,
    sensitivity: "base"
  });
}

function renderThead() {
  const tr = $("theadRow");
  tr.innerHTML = "";

  for (const col of columns) {
    const th = document.createElement("th");
    const btn = document.createElement("div");
    btn.className = "th-btn";
    btn.textContent = col.label;

    btn.addEventListener("click", () => {
      if (sortKey === col.key) sortDir = sortDir === "asc" ? "desc" : "asc";
      else {
        sortKey = col.key;
        sortDir = "asc";
      }
      renderThead();
      applyFilters();
    });

    const indicator = document.createElement("span");
    indicator.className = "tag";
    indicator.textContent =
      sortKey === col.key ? (sortDir === "asc" ? "↑" : "↓") : "↕";

    btn.appendChild(indicator);
    th.appendChild(btn);
    tr.appendChild(th);
  }
}

function renderTbody(list) {
  const tbody = $("tbody");
  tbody.innerHTML = "";

  for (const row of list) {
    const tr = document.createElement("tr");

    for (const col of columns) {
      const td = document.createElement("td");

      if (col.key === "applyLink") {
        const url = safeText(row[col.key]).trim();
        if (url) {
          const a = document.createElement("a");
          a.href = url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = "打开";
          td.appendChild(a);
        } else td.textContent = "";
      } else if (col.key.endsWith("Time")) {
        const v = normalizeDate(row[col.key]);
        td.textContent = v;
      } else {
        const v = safeText(row[col.key]).trim();
        td.textContent = v;
      }

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }
}

function renderSummary(list) {
  const total = list.length;
  const byType = {};
  const byPerson = {};

  for (const x of list) {
    const t = safeText(x.examType).trim();
    byType[t] = (byType[t] || 0) + 1;
    const p = safeText(x.person).trim();
    byPerson[p] = (byPerson[p] || 0) + 1;
  }

  const typeParts = Object.entries(byType).map(([k, v]) => `${k} ${v}`);
  const personParts = Object.entries(byPerson).map(([k, v]) => `${k} ${v}`);
  const parts = [];
  if (personParts.length) parts.push(personParts.join(" · "));
  if (typeParts.length) parts.push(typeParts.join(" · "));
  $("summary").textContent = `当前展示 ${total} 条${parts.length ? ` · ${parts.join(" · ")}` : ""}`;
}

function rebuildPersonOptions() {
  const selected = safeText($("person").value).trim();
  const set = new Set();
  for (const x of rawData) {
    const p = safeText(x.person).trim();
    if (p) set.add(p);
  }

  const options = ["", ...Array.from(set).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))];
  const sel = $("person");
  sel.innerHTML = "";
  for (const v of options) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v ? v : "全部人员";
    sel.appendChild(opt);
  }

  if (options.includes(selected)) sel.value = selected;
  else sel.value = "";
}

function rebuildTypeOptions() {
  const selected = safeText($("type").value).trim();
  const set = new Set();
  for (const x of rawData) {
    const t = safeText(x.examType).trim();
    if (t) set.add(t);
  }

  const options = ["", ...Array.from(set).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))];
  const sel = $("type");
  sel.innerHTML = "";
  for (const v of options) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v ? v : "全部大类";
    sel.appendChild(opt);
  }

  if (options.includes(selected)) sel.value = selected;
  else sel.value = "";
}

function rebuildSubTypeOptions() {
  const type = safeText($("type").value).trim();
  const selected = safeText($("subType").value).trim();

  const set = new Set();
  for (const x of rawData) {
    const t = safeText(x.examType).trim();
    if (type && t !== type) continue;
    const s = safeText(x.examSubType).trim();
    if (s) set.add(s);
  }

  const options = ["", ...Array.from(set).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))];
  const sel = $("subType");
  sel.innerHTML = "";
  for (const v of options) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v ? v : "全部类型";
    sel.appendChild(opt);
  }

  if (options.includes(selected)) sel.value = selected;
  else sel.value = "";
}

function applyFilters() {
  const q = safeText($("q").value).trim().toLowerCase();
  const person = safeText($("person").value).trim();
  const type = safeText($("type").value).trim();
  const subType = safeText($("subType").value).trim();

  viewData = rawData.filter((x) => {
    if (person && safeText(x.person).trim() !== person) return false;
    if (type && safeText(x.examType).trim() !== type) return false;
    if (subType && safeText(x.examSubType).trim() !== subType) return false;
    if (!q) return true;

    const hay = Object.values(x)
      .map((v) => safeText(v).toLowerCase())
      .join(" ");

    return hay.includes(q);
  });

  viewData.sort((a, b) => {
    if (sortKey.endsWith("Time")) {
      const av = safeText(a[sortKey]).trim();
      const bv = safeText(b[sortKey]).trim();
      const at = Date.parse(av.replace(/-/g, "/"));
      const bt = Date.parse(bv.replace(/-/g, "/"));
      const ad = Number.isNaN(at) ? null : at;
      const bd = Number.isNaN(bt) ? null : bt;
      if (ad === null && bd === null) return 0;
      if (ad === null) return 1;
      if (bd === null) return -1;
      const c = ad - bd;
      return sortDir === "asc" ? c : -c;
    }

    if (sortKey.endsWith("Score") || sortKey.endsWith("Rank")) {
      const an = parseNumber(a[sortKey]);
      const bn = parseNumber(b[sortKey]);
      if (an === null && bn === null) return 0;
      if (an === null) return 1;
      if (bn === null) return -1;
      const c = an - bn;
      return sortDir === "asc" ? c : -c;
    }

    const c = compareValue(a[sortKey], b[sortKey]);
    return sortDir === "asc" ? c : -c;
  });

  renderTbody(viewData);
  renderSummary(viewData);
}

async function loadData(password) {
  const text = await decryptDataEnc(password);
  const json = JSON.parse(text);
  rawData = Array.isArray(json) ? json : json.records || [];
  rebuildPersonOptions();
  rebuildTypeOptions();
  rebuildSubTypeOptions();
  applyFilters();
}

function showApp() {
  const auth = $("auth");
  const app = $("app");
  auth.classList.add("hidden");
  auth.setAttribute("hidden", "");
  app.classList.remove("hidden");
  app.removeAttribute("hidden");
}

function showAuth() {
  const auth = $("auth");
  const app = $("app");
  app.classList.add("hidden");
  app.setAttribute("hidden", "");
  auth.classList.remove("hidden");
  auth.removeAttribute("hidden");
}

async function login() {
  try {
    const pw = $("password").value;
    $("authError").textContent = "";
    await loadData(pw);
    sessionStorage.setItem("authed", "1");
    sessionStorage.setItem("pw", pw);
    $("password").value = "";
    showApp();
  } catch (e) {
    sessionStorage.removeItem("authed");
    sessionStorage.removeItem("pw");
    showAuth();
    const msg = safeText(e?.message).trim();
    if (msg === "data.enc 加载失败" || msg.includes("格式错误")) {
      $("authError").textContent = msg;
      return;
    }
    if (msg.includes("不支持解密") || msg.includes("https")) {
      $("authError").textContent = msg;
      return;
    }
    $("authError").textContent = "口令不对";
  }
}

function logout() {
  sessionStorage.removeItem("authed");
  sessionStorage.removeItem("pw");
  $("password").value = "";
  showAuth();
}

function init() {
  renderThead();

  $("login").addEventListener("click", () => {
    login();
  });

  $("password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });

  $("logout").addEventListener("click", () => {
    logout();
  });

  $("exportExcel").addEventListener("click", () => {
    if (!viewData.length) {
      alert("没有可导出的数据");
      return;
    }
    exportExcel(viewData);
  });

  $("q").addEventListener("input", () => {
    applyFilters();
  });

  $("type").addEventListener("change", () => {
    rebuildSubTypeOptions();
    applyFilters();
  });

  $("person").addEventListener("change", () => {
    applyFilters();
  });

  $("subType").addEventListener("change", () => {
    applyFilters();
  });

  if (sessionStorage.getItem("authed") === "1" && sessionStorage.getItem("pw")) {
    showApp();
    loadData(sessionStorage.getItem("pw")).catch(() => logout());
  } else {
    showAuth();
  }
}

init();
