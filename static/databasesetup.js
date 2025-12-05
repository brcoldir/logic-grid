// databasesetup.js
console.log("databasesetup.js loaded");

window.columnPresets = {};      // key -> config object
window.defaultPresetOrder = []; // sorted list of keys based on standard_order

async function loadColumnPresets() {
  try {
    const res = await fetch("/api/column-presets", { credentials: "include" });
    if (!res.ok) {
      console.error("loadColumnPresets status:", res.status);
      return;
    }

    const data = await res.json();
    const map = {};
    const order = [];

    data.forEach((row) => {
      // row.config is already the JSON blob we stored
      map[row.key] = row.config;
      if (row.standardOrder != null) {
        order.push({ key: row.key, order: row.standardOrder });
      }
    });

    order.sort((a, b) => a.order - b.order);
    window.columnPresets = map;
    window.defaultPresetOrder = order.map((o) => o.key);

    console.log("Column presets loaded:", Object.keys(window.columnPresets));

    // 🔹 After presets are loaded, repopulate all <select class="col-type"> if helper exists
    if (typeof refreshPresetDropdowns === "function") {
      refreshPresetDropdowns();
    }
  } catch (err) {
    console.error("loadColumnPresets error", err);
  }
}

// 🔹 expose it globally so auth.js can call it after login
window.loadColumnPresets = loadColumnPresets;

