// Browser start page: an address field and bookmarks. Web pages open as the plugin's external "page" panel.
// Data (layr.data): "bookmark:<id>" → {title, url, addedAt}; "recent" → [{title, url, at}] (newest first, max 12);
// "seeded" → true once the first bookmarks were added.
import "/_layr/layr.js";
const layr = window.layr;

const $ = (id) => document.getElementById(id);
const els = {
  go: $("go"),
  url: $("url"),
  tiles: $("tiles"),
  edit: $("edit"),
  add: $("add"),
  addForm: $("addForm"),
  bmTitle: $("bmTitle"),
  bmUrl: $("bmUrl"),
  recent: $("recent"),
  recentSection: $("recentSection"),
};

const STARTERS = [
  { title: "Wikipedia", url: "https://en.wikipedia.org" },
  { title: "PubMed", url: "https://pubmed.ncbi.nlm.nih.gov" },
  { title: "Google Scholar", url: "https://scholar.google.com" },
  { title: "DuckDuckGo", url: "https://duckduckgo.com" },
];
const MAX_RECENT = 12;
const SEARCH = "https://duckduckgo.com/?q=";

let bookmarks = []; // [{key, title, url, addedAt}]
let recent = [];
let editing = false;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** "example.org" → https://example.org; "two words" → a web search. */
export function toUrl(text) {
  const t = text.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(t)) return "http://" + t;
  if (!/\s/.test(t) && /^[^/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(t)) return "https://" + t;
  return SEARCH + encodeURIComponent(t);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** A stable color per host, for the letter icons. */
function colorFor(host) {
  let h = 0;
  for (const c of host) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 48%)`;
}

// ---------- opening ----------

async function openUrl(url, title) {
  try {
    await layr.panels.open("page", { url });
  } catch (err) {
    layr.ui.notify(`Couldn't open the page: ${err.message}`, "error");
    return;
  }
  recent = [{ title: title || hostOf(url), url, at: Date.now() }, ...recent.filter((r) => r.url !== url)].slice(
    0,
    MAX_RECENT
  );
  renderRecent();
  layr.data.set("recent", recent).catch(() => {});
  // Opened by "Open web page…": this start tab was only a way there, so it goes away.
  if (layr.info.params && layr.info.params.transient) layr.panel.close().catch(() => {});
}

// ---------- bookmarks ----------

async function loadBookmarks() {
  const rows = await layr.data.list({ prefix: "bookmark:", limit: 500 });
  bookmarks = rows
    .map((r) => ({ key: r.key, ...(r.value || {}) }))
    .filter((b) => typeof b.url === "string")
    .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
}

async function addBookmark(title, url) {
  const key = `bookmark:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const value = { title: title || hostOf(url), url, addedAt: Date.now() };
  await layr.data.set(key, value);
  bookmarks.push({ key, ...value });
  renderTiles();
  layr.events.emit("browser:bookmarks", { added: key }).catch(() => {});
}

async function removeBookmark(key) {
  await layr.data.delete(key);
  bookmarks = bookmarks.filter((b) => b.key !== key);
  renderTiles();
  layr.events.emit("browser:bookmarks", { removed: key }).catch(() => {});
}

function renderTiles() {
  document.body.classList.toggle("editing", editing);
  if (!bookmarks.length) {
    els.tiles.innerHTML = `<div class="layr-empty">No bookmarks yet. Press <b>Add</b> to keep a page here.</div>`;
    return;
  }
  els.tiles.innerHTML = bookmarks
    .map((b) => {
      const host = hostOf(b.url);
      // A letter, not the site's favicon: the page's CSP loads no images from outside (it would tell sites what
      // the user bookmarked, and any image address can carry data out).
      const letter = (b.title || host).charAt(0).toUpperCase();
      return `<a class="tile" href="${esc(b.url)}" data-key="${esc(b.key)}" title="${esc(b.url)}">
        <span class="tile-icon" style="--tile-color:${colorFor(host)}">${esc(letter)}</span>
        <span class="tile-name">${esc(b.title || host)}</span>
        <span class="tile-host">${esc(host)}</span>
        <button class="layr-button small icon danger tile-remove" data-remove="${esc(b.key)}" title="Remove"
          aria-label="Remove ${esc(b.title)}">×</button>
      </a>`;
    })
    .join("");
}

function renderRecent() {
  els.recentSection.hidden = !recent.length;
  els.recent.innerHTML = recent
    .map((r) => {
      const host = hostOf(r.url);
      return `<li data-url="${esc(r.url)}" title="${esc(r.url)}">
        <span class="r-dot" style="--tile-color:${colorFor(host)}"></span>
        <span class="r-title">${esc(r.title || host)}</span>
        <span class="r-host">${esc(host)}</span></li>`;
    })
    .join("");
}

function showAddForm(on, prefill) {
  els.addForm.hidden = !on;
  if (on) {
    els.bmTitle.value = prefill?.title || "";
    els.bmUrl.value = prefill?.url || "";
    (prefill?.url ? els.bmTitle : els.bmUrl).focus();
  }
}

// ---------- wiring ----------

function wire() {
  els.go.addEventListener("submit", (e) => {
    e.preventDefault();
    const url = toUrl(els.url.value);
    if (url) {
      openUrl(url, /^https?:/i.test(els.url.value.trim()) ? undefined : els.url.value.trim());
      els.url.value = "";
    }
  });

  els.tiles.addEventListener("click", (e) => {
    const remove = e.target.closest("[data-remove]");
    e.preventDefault();
    if (remove) {
      removeBookmark(remove.dataset.remove).catch((err) => layr.ui.notify(err.message, "error"));
      return;
    }
    if (editing) return;
    const tile = e.target.closest(".tile");
    if (!tile) return;
    const b = bookmarks.find((x) => x.key === tile.dataset.key);
    if (b) openUrl(b.url, b.title);
  });

  els.recent.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-url]");
    if (!li) return;
    const r = recent.find((x) => x.url === li.dataset.url);
    openUrl(li.dataset.url, r?.title);
  });

  $("clearRecent").onclick = () => {
    recent = [];
    renderRecent();
    layr.data.delete("recent").catch(() => {});
  };

  els.edit.onclick = () => {
    editing = !editing;
    els.edit.setAttribute("aria-pressed", String(editing));
    els.edit.textContent = editing ? "Done" : "Edit";
    renderTiles();
  };
  els.add.onclick = () => showAddForm(els.addForm.hidden);
  $("cancelAdd").onclick = () => showAddForm(false);
  els.addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const raw = els.bmUrl.value.trim();
    const url = raw && toUrl(raw);
    if (!url || url.startsWith(SEARCH)) {
      els.bmUrl.focus();
      layr.ui.notify("Give a web address, like pubmed.ncbi.nlm.nih.gov", "error");
      return;
    }
    try {
      await addBookmark(els.bmTitle.value.trim(), url);
      showAddForm(false);
    } catch (err) {
      layr.ui.notify(`Couldn't save the bookmark: ${err.message}`, "error");
    }
  });
  els.addForm.addEventListener("keydown", (e) => {
    if (e.key === "Escape") showAddForm(false);
  });

  // Ctrl+L here focuses the address field (the shell's Ctrl+L would open another start page).
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === "KeyL") {
      e.preventDefault();
      els.url.focus();
      els.url.select();
    }
  });

  // Another start tab changed the bookmarks.
  layr.events.on("browser:bookmarks", () => loadBookmarks().then(renderTiles));
}

async function main() {
  els.url.focus();
  try {
    await layr.ready;
  } catch (err) {
    els.tiles.innerHTML = `<div class="layr-empty layr-error">${esc(err.message)}</div>`;
    return;
  }
  wire();
  try {
    if (!(await layr.data.get("seeded"))) {
      for (const s of STARTERS) {
        await addBookmark(s.title, s.url);
        await new Promise((r) => setTimeout(r, 2)); // distinct addedAt, kept in this order
      }
      await layr.data.set("seeded", true);
    }
    await loadBookmarks();
    recent = (await layr.data.get("recent")) || [];
  } catch (err) {
    layr.ui.notify(`Couldn't load bookmarks: ${err.message}`, "error");
  }
  renderTiles();
  renderRecent();

  const params = layr.info.params || {};
  if (params.edit) {
    editing = false;
    els.edit.click();
  }
  if (params.url) els.url.value = params.url;
  els.url.focus();
}

main();
