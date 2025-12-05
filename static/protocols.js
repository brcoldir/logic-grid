// protocols.js
console.log("protocols.js loaded");

// These are shared between builder & auth
let lastProtocolId = null;
let lastLoadedName = null;

// DOM references that relate to protocols specifically
const protocolNameInput = document.getElementById("protocolName");
const saveProtocolBtn = document.getElementById("saveProtocolBtn");
const savedProtocolsSelect = document.getElementById("savedProtocols");
const loadProtocolBtn = document.getElementById("loadProtocolBtn");

// --- Saving current protocol to backend ---

async function saveCurrentProtocol() {
  if (!protocolNameInput) {
    alert("Protocol name input not found");
    return;
  }

  let name = protocolNameInput.value.trim();
  if (!name) {
    name = prompt("Enter a name for this protocol:");
    if (!name) return;
    protocolNameInput.value = name;
  }

  // Build full protocol (with scoringConfigs) from builder.js
  const fullProtocol = generateJson(); // defined in builder.js
  if (!fullProtocol) {
    alert("Unable to build protocol JSON.");
    return;
  }

  // Decide whether we are updating or creating new
  let idToSend = lastProtocolId || 0;
  if (lastLoadedName && name !== lastLoadedName) {
    idToSend = 0;          // force create new
    lastProtocolId = null; // clear local pointer
  }

  try {
    const res = await fetch("/api/protocols", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        id: idToSend,
        name,
        data: JSON.stringify(fullProtocol),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("save protocol error body:", text);
      alert("Failed to save protocol (see console).");
      return;
    }

    const respJson = await res.json();
    if (respJson.id) {
      lastProtocolId = respJson.id;
      lastLoadedName = name;
    }

    alert("Protocol saved.");
    await fetchSavedProtocols();
  } catch (err) {
    console.error("saveCurrentProtocol error:", err);
    alert("Failed to save protocol (network error).");
  }
}

// --- Loading lists of protocols for dropdown ---

async function fetchSavedProtocols() {
  if (!savedProtocolsSelect) return;

  try {
    const res = await fetch("/api/protocols", {
      credentials: "include",
    });

    if (!res.ok) {
      console.error("fetchSavedProtocols status:", res.status);
      return;
    }

    const data = await res.json();
    const list = Array.isArray(data) ? data : [];

    savedProtocolsSelect.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "-- choose saved protocol --";
    savedProtocolsSelect.appendChild(defaultOpt);

    list.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;

      let label = p.name || "(unnamed protocol)";
      if (p.is_public) {
        label = "🌍 " + label;
      }

      opt.textContent = label;
      savedProtocolsSelect.appendChild(opt);
    });
  } catch (err) {
    console.error("fetchSavedProtocols error:", err);
  }
}

// --- Load selected protocol from dropdown ---

async function loadSelectedProtocol() {
  if (!savedProtocolsSelect) return;

  const id = savedProtocolsSelect.value;
  if (!id) {
    alert("Please choose a protocol to load.");
    return;
  }

  await loadProtocolById(id);
}

// --- Load a protocol by id (also used by auth.js when ?protocolId=ID) ---

async function loadProtocolById(id) {
  if (!id) return;

  try {
    const res = await fetch(`/api/protocols?id=${encodeURIComponent(id)}`, {
      credentials: "include",
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("loadProtocolById error body:", text);
      alert("Failed to load protocol (see console).");
      return;
    }

    const p = await res.json(); // {id, name, data, ...}

    lastProtocolId = p.id || null;
    lastLoadedName = p.name || null;

    if (protocolNameInput) {
      protocolNameInput.value = p.name || "";
    }

    let protocol;
    try {
      protocol = JSON.parse(p.data || "{}");
    } catch (err) {
      console.error("Saved protocol JSON is invalid:", err);
      alert("Saved protocol JSON is invalid; see console.");
      return;
    }

    // Hand off to builder
    applyProtocolToUI(protocol); // from builder.js

    // Xtract-safe export JSON (no scoringConfigs)
    if (output) {
      const exportProtocol = stripUiMeta(protocol);
      output.value = JSON.stringify(exportProtocol, null, 2);
    }

    // Keep dropdown selection in sync
    if (savedProtocolsSelect) {
      const options = Array.from(savedProtocolsSelect.options);
      const match = options.find((opt) => String(opt.value) === String(p.id));
      if (match) {
        savedProtocolsSelect.value = String(p.id);
      }
    }

    console.log("Protocol loaded.");
  } catch (err) {
    console.error("loadProtocolById error:", err);
    alert("Failed to load protocol (network error).");
  }
}

// --- Strip UI-only metadata before export ---

function stripUiMeta(fullProtocol) {
  if (!fullProtocol || typeof fullProtocol !== "object") return fullProtocol;

  const clean = {
    protocol_id: fullProtocol.protocol_id,
    version_number: fullProtocol.version_number,
    columns: [],
    namedFunctions: fullProtocol.namedFunctions || {},
    calculationRules: fullProtocol.calculationRules || [],
  };

  clean.columns = (fullProtocol.columns || []).map((col) => {
    const {
      id,
      name,
      abbr,
      backgroundColor,
      possibleValues,
      autoFill,
      useAsStartingDilution,
      showWhenPrescribing,
      positiveValues,
    } = col;

    const out = {
      id,
      name,
      abbr,
      backgroundColor,
    };

    if (autoFill) out.autoFill = autoFill;
    if (showWhenPrescribing) out.showWhenPrescribing = true;
    if (Array.isArray(possibleValues) && possibleValues.length > 0) {
      out.possibleValues = possibleValues;
    }
    if (useAsStartingDilution) out.useAsStartingDilution = true;
    if (Array.isArray(positiveValues) && positiveValues.length > 0) {
      out.positiveValues = positiveValues;
    }

    return out;
  });

  return clean;
}

// Hook up buttons
if (saveProtocolBtn) {
  saveProtocolBtn.addEventListener("click", saveCurrentProtocol);
}
if (loadProtocolBtn) {
  loadProtocolBtn.addEventListener("click", loadSelectedProtocol);
}
