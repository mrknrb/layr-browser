// The History page's own computing: day headings, search, names (node --test test/history.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayLabel, filterRows, hostOf, permissionName } from "../panels/history-lib.js";

test("day headings: today, yesterday, then the date", () => {
  const now = new Date(2026, 10, 19, 15, 0).getTime();
  assert.equal(dayLabel(new Date(2026, 10, 19, 0, 5).getTime(), now), "Today");
  assert.equal(dayLabel(new Date(2026, 10, 18, 23, 59).getTime(), now), "Yesterday");
  assert.match(dayLabel(new Date(2026, 10, 10).getTime(), now), /2026/);
});

test("search keeps rows whose address or title has every word", () => {
  const rows = [
    { id: "1", value: { url: "https://en.wikipedia.org/wiki/Enzyme", title: "Enzyme - Wikipedia" } },
    { id: "2", value: { url: "https://pubmed.ncbi.nlm.nih.gov/123", title: "Lipase activity" } },
  ];
  assert.deepEqual(filterRows(rows, "").map((r) => r.id), ["1", "2"]);
  assert.deepEqual(filterRows(rows, "wiki enzyme").map((r) => r.id), ["1"]);
  assert.deepEqual(filterRows(rows, "LIPASE pubmed").map((r) => r.id), ["2"]);
  assert.deepEqual(filterRows(rows, "nothing"), []);
});

test("hosts and permission names", () => {
  assert.equal(hostOf("https://www.example.org/a"), "example.org");
  assert.equal(hostOf("not a url"), "not a url");
  assert.equal(permissionName("geoLocation"), "Location");
  assert.equal(permissionName("newKind"), "newKind");
});
