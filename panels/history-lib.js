// What the History page computes, kept apart from the page so tests run it (test/history.test.mjs).

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** "Today", "Yesterday", else the date. */
export function dayLabel(at, now = Date.now()) {
  const d = new Date(at);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((start - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

/** Rows whose address or title has every word of the query. */
export function filterRows(rows, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((r) => {
    const hay = `${r.value.url} ${r.value.title || ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function permissionName(kind) {
  return (
    {
      camera: "Camera",
      microphone: "Microphone",
      geoLocation: "Location",
      notifications: "Notifications",
      clipboardRead: "Clipboard",
      otherSensors: "Sensors",
    }[kind] || kind
  );
}
