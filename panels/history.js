// Browser › History: the history the shell keeps for outside pages, downloads, recently closed tabs and the browser's
// settings (docs/ARCHITECTURE.md › Web panels › The browser). What the shell writes into this plugin's data:
// collection "history" {url, title, at}; "downloads" [{url, path, total, at}]; "closed" [{url, title}];
// "zoom:<host>" → factor; "perm:<origin>|<kind>" → true (allowed) | false (blocked); "desktop:<site>" → true (a
// phone shows the site's desktop site). After changing them here it tells
// the shell with browser:history, browser:downloads, browser:permissions; Clear browsing data is browser:clear {kinds}
// (a WebView2 COREWEBVIEW2_BROWSING_DATA_KINDS mask), which the shell runs in the web view profile.
import "/_layr/layr.js";
import { dayLabel, filterRows, hostOf, permissionName } from "./history-lib.js";
const layr = window.layr;

const $ = (id) => document.getElementById(id);
const PAGE = 200;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let rows = []; // [{id, value: {url, title, at}}], newest first
let exhausted = false;

// ---------- tabs ----------

function show(tab) {
  document.querySelectorAll("[role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  document.querySelectorAll("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== tab));
  ({ history: renderHistory, downloads: loadDownloads, closed: loadClosed, settings: loadSettings })[tab]?.();
}

// ---------- history ----------

async function loadMore() {
  const before = rows.length ? rows[rows.length - 1].id : undefined;
  const page = await layr.db.list("history", before ? { limit: PAGE, before } : { limit: PAGE });
  rows.push(...page.filter((r) => r.value && typeof r.value.url === "string"));
  exhausted = page.length < PAGE;
}

function renderHistory() {
  const q = $("search").value;
  const shown = filterRows(rows, q);
  $("more").hidden = exhausted;
  if (!shown.length) {
    $("historyList").innerHTML = `<div class="layr-empty">${q ? "Nothing matches." : "No history yet."}</div>`;
    return;
  }
  let html = "";
  let day = "";
  for (const r of shown) {
    const d = dayLabel(r.value.at);
    if (d !== day) {
      if (day) html += "</ul>";
      html += `<h2>${esc(d)}</h2><ul class="layr-list">`;
      day = d;
    }
    const time = new Date(r.value.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    html += `<li data-url="${esc(r.value.url)}" title="${esc(r.value.url)}">
      <span class="time">${esc(time)}</span>
      <span class="title">${esc(r.value.title || hostOf(r.value.url))}</span>
      <span class="host">${esc(hostOf(r.value.url))}</span>
      <button class="layr-button small icon ghost" data-delete="${esc(r.id)}" title="Remove from the history"
        aria-label="Remove">×</button></li>`;
  }
  $("historyList").innerHTML = html + "</ul>";
}

async function clearHistory() {
  if (!confirm("Clear the whole history? Bookmarks stay.")) return;
  for (;;) {
    const page = await layr.db.list("history", { limit: 500 });
    if (!page.length) break;
    for (const r of page) await layr.db.delete("history", r.id);
  }
  rows = [];
  exhausted = true;
  renderHistory();
  await layr.events.emit("browser:history", { cleared: true });
}

function open(url) {
  layr.panels.open("page", { url }).catch((err) => layr.ui.notify(`Couldn't open it: ${err.message}`, "error"));
}

// ---------- downloads, closed tabs ----------

async function loadDownloads() {
  const list = (await layr.data.get("downloads")) || [];
  $("downloadsList").innerHTML = list.length
    ? list
        .map((d) => {
          const name = (d.path || "").split(/[\\/]/).pop() || hostOf(d.url);
          const when = d.at ? new Date(d.at).toLocaleString() : "";
          return `<li title="${esc(d.path || d.url)}"><span class="title">${esc(name)}</span>
            <span class="host">${esc(when)}</span>
            <button class="layr-button small ghost" data-copy="${esc(d.path || "")}">Copy path</button></li>`;
        })
        .join("")
    : `<div class="layr-empty">No downloads yet.</div>`;
}

async function loadClosed() {
  const list = (await layr.data.get("closed")) || [];
  $("closedList").innerHTML = list.length
    ? list
        .map(
          (c) => `<li data-url="${esc(c.url)}" title="${esc(c.url)}"><span class="title">${esc(c.title || hostOf(c.url))}</span>
            <span class="host">${esc(hostOf(c.url))}</span></li>`
        )
        .join("")
    : `<div class="layr-empty">No closed tabs. Ctrl+Shift+T brings back the last one.</div>`;
}

// ---------- settings ----------

async function loadSettings() {
  const s = await layr.settings.get();
  $("searchEngine").value = s.searchEngine || "duckduckgo";
  for (const id of ["keepHistory", "savePasswords", "fillForms"]) $(id).checked = !!s[id];

  const perms = await layr.data.list({ prefix: "perm:", limit: 1000 });
  $("permList").innerHTML = perms.length
    ? perms
        .map((r) => {
          const [origin, kind] = r.key.slice(5).split("|");
          return `<li><span class="title">${esc(hostOf(origin))}</span>
            <span class="host">${esc(permissionName(kind))}</span>
            <select class="layr-select small" data-perm="${esc(r.key)}">
              <option value="allow" ${r.value === true ? "selected" : ""}>Allowed</option>
              <option value="block" ${r.value === false ? "selected" : ""}>Blocked</option>
            </select>
            <button class="layr-button small icon ghost" data-unperm="${esc(r.key)}" title="Ask again" aria-label="Forget">×</button></li>`;
        })
        .join("")
    : `<div class="layr-empty">No site asked yet. Sites ask in a bar above their page.</div>`;

  const zooms = await layr.data.list({ prefix: "zoom:", limit: 1000 });
  $("zoomList").innerHTML = zooms.length
    ? zooms
        .map(
          (r) => `<li><span class="title">${esc(r.key.slice(5))}</span>
            <span class="host">${Math.round(r.value * 100)}%</span>
            <button class="layr-button small icon ghost" data-unzoom="${esc(r.key)}" title="Back to 100%" aria-label="Reset">×</button></li>`
        )
        .join("")
    : `<div class="layr-empty">Every site at 100%. Ctrl+wheel or Ctrl+plus zooms a site, and it keeps it.</div>`;

  const desktops = await layr.data.list({ prefix: "desktop:", limit: 1000 });
  $("desktopList").innerHTML = desktops.length
    ? desktops
        .map(
          (r) => `<li><span class="title">${esc(r.key.slice(8))}</span>
            <button class="layr-button small icon ghost" data-undesktop="${esc(r.key)}" title="Back to its phone site" aria-label="Forget">×</button></li>`
        )
        .join("")
    : `<div class="layr-empty">No site yet. On a phone, the page menu's Desktop site shows a site as on a computer, and it keeps it.</div>`;
}

async function clearData() {
  const kinds = [...document.querySelectorAll("[data-kind]:checked")].reduce((m, el) => m | Number(el.dataset.kind), 0);
  const history = document.querySelector("[data-clear=history]").checked;
  if (!kinds && !history) return;
  if (!confirm("Clear the chosen browsing data? This can't be undone.")) return;
  if (history) {
    for (;;) {
      const page = await layr.db.list("history", { limit: 500 });
      if (!page.length) break;
      for (const r of page) await layr.db.delete("history", r.id);
    }
    await layr.data.delete("closed");
    rows = [];
    await layr.events.emit("browser:history", { cleared: true });
  }
  if (kinds) await layr.events.emit("browser:clear", { kinds });
  else layr.ui.notify("History cleared", "success");
}

// ---------- wiring ----------

function wire() {
  document.querySelector(".tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[role=tab]");
    if (b) show(b.dataset.tab);
  });
  let timer = null;
  $("search").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      // Searching reaches further back: up to 5000 visits are read.
      while ($("search").value && !exhausted && rows.length < 5000) await loadMore();
      renderHistory();
    }, 200);
  });
  $("more").onclick = async () => {
    await loadMore();
    renderHistory();
  };
  $("clearHistory").onclick = () => clearHistory().catch((err) => layr.ui.notify(err.message, "error"));
  $("historyList").addEventListener("click", async (e) => {
    const del = e.target.closest("[data-delete]");
    if (del) {
      await layr.db.delete("history", del.dataset.delete);
      rows = rows.filter((r) => r.id !== del.dataset.delete);
      renderHistory();
      layr.events.emit("browser:history", { removed: del.dataset.delete }).catch(() => {});
      return;
    }
    const li = e.target.closest("li[data-url]");
    if (li) open(li.dataset.url);
  });
  $("closedList").addEventListener("click", (e) => {
    const li = e.target.closest("li[data-url]");
    if (li) open(li.dataset.url);
  });
  $("downloadsList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy]");
    if (b && b.dataset.copy) navigator.clipboard.writeText(b.dataset.copy).then(() => layr.ui.notify("Copied", "success"));
  });
  $("clearDownloads").onclick = async () => {
    await layr.data.delete("downloads");
    await layr.events.emit("browser:downloads", { cleared: true });
    loadDownloads();
  };
  $("searchEngine").onchange = (e) => layr.settings.set("searchEngine", e.target.value);
  for (const id of ["keepHistory", "savePasswords", "fillForms"]) {
    $(id).onchange = (e) => layr.settings.set(id, e.target.checked);
  }
  $("permList").addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-perm]");
    if (!sel) return;
    await layr.data.set(sel.dataset.perm, sel.value === "allow");
    layr.events.emit("browser:permissions", {}).catch(() => {});
  });
  $("permList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-unperm]");
    if (!b) return;
    await layr.data.delete(b.dataset.unperm);
    layr.events.emit("browser:permissions", {}).catch(() => {});
    loadSettings();
  });
  $("zoomList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-unzoom]");
    if (!b) return;
    await layr.data.delete(b.dataset.unzoom);
    layr.events.emit("browser:permissions", {}).catch(() => {});
    loadSettings();
  });
  $("desktopList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-undesktop]");
    if (!b) return;
    await layr.data.delete(b.dataset.undesktop);
    layr.events.emit("browser:permissions", {}).catch(() => {});
    loadSettings();
  });
  $("clearData").onclick = () => clearData().catch((err) => layr.ui.notify(err.message, "error"));
  // The single History tab opened again for another part (the shell's History, Downloads, Browser settings).
  layr.events.on("layr:panel.params", ({ params }) => show((params && params.tab) || "history"));
  layr.events.on("browser:history", () => {
    rows = [];
    exhausted = false;
    loadMore().then(renderHistory);
  });
}

async function main() {
  try {
    await layr.ready;
  } catch (err) {
    $("historyList").innerHTML = `<div class="layr-empty layr-error">${esc(err.message)}</div>`;
    return;
  }
  wire();
  try {
    await loadMore();
  } catch (err) {
    layr.ui.notify(`Couldn't read the history: ${err.message}`, "error");
  }
  show((layr.info.params && layr.info.params.tab) || "history");
}

main();
