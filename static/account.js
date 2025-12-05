console.log("account.js loaded");

const accountAuthStatus = document.getElementById("accountAuthStatus");
const accountUserEmail = document.getElementById("accountUserEmail");
const accountLogoutBtn = document.getElementById("accountLogoutBtn");

const changePasswordForm = document.getElementById("changePasswordForm");
const currentPasswordInput = document.getElementById("currentPassword");
const newPasswordInput = document.getElementById("newPassword");
const confirmNewPasswordInput = document.getElementById("confirmNewPassword");

const protocolListEl = document.getElementById("protocolList");
const noProtocolsMessage = document.getElementById("noProtocolsMessage");

let currentUserIsAdmin = false;

// Column preset DOM refs
const presetList = document.getElementById("presetList");
const presetForm = document.getElementById("presetForm");
const presetKeyInput = document.getElementById("presetKeyInput");
const presetLabelInput = document.getElementById("presetLabelInput");
const presetOrderInput = document.getElementById("presetOrderInput");
const presetConfigInput = document.getElementById("presetConfigInput");
const presetFormResetBtn = document.getElementById("presetFormResetBtn");
const presetFormError = document.getElementById("presetFormError");

// Column-config field refs
const presetColId = document.getElementById("presetColId");
const presetColName = document.getElementById("presetColName");
const presetColAbbr = document.getElementById("presetColAbbr");
const presetColBg = document.getElementById("presetColBg");

const presetAllowInt = document.getElementById("presetAllowInt");
const presetAllowStr = document.getElementById("presetAllowStr");
const presetIntMin = document.getElementById("presetIntMin");
const presetIntMax = document.getElementById("presetIntMax");
const presetStrOptions = document.getElementById("presetStrOptions");

const presetTabBehavior = document.getElementById("presetTabBehavior");
const presetUseStartDil = document.getElementById("presetUseStartDil");
const presetShowWhenPrescribing = document.getElementById(
  "presetShowWhenPrescribing"
);

const presetAutoFillValue = document.getElementById("presetAutoFillValue");
const presetAutoFillOverwrite = document.getElementById(
  "presetAutoFillOverwrite"
);
const presetAutoFillSetNeg = document.getElementById("presetAutoFillSetNeg");
const presetAutoFillSetPos = document.getElementById("presetAutoFillSetPos");

const presetHasPositive = document.getElementById("presetHasPositive");
const presetPositiveIntMin = document.getElementById("presetPositiveIntMin");
const presetPositiveStrOptions = document.getElementById(
  "presetPositiveStrOptions"
);

const presetEditorContainer = document.getElementById("presetEditorContainer");
const newPresetBtn = document.getElementById("newPresetBtn");
const presetCancelBtn = document.getElementById("presetCancelBtn");




// ---------- Auth / /me ----------

async function checkAccountAuth() {
  try {
    const res = await fetch("/me", { credentials: "include" });

    console.log("checkAccountAuth /me status:", res.status);

    if (!res.ok) {
      // Read the body for debugging
      const text = await res.text();
      console.error("checkAccountAuth /me body:", text);

      // Only redirect if clearly unauthorized
      if (res.status === 401 || res.status === 403) {
        window.location.href = "/";
      }
      return;
    }

    const user = await res.json();
    showAccountLoggedIn(user);
  } catch (err) {
    console.error("checkAccountAuth error", err);
    // Optional: only redirect on hard failures, or just stay on page
    // window.location.href = "/";
  }
}


function showAccountLoggedIn(user) {
  accountAuthStatus.style.display = "flex";
  accountUserEmail.textContent = user.email || "";
  currentUserIsAdmin = !!user.is_admin;

  // Correct function
  loadAccountProtocols();
  loadAccountColumnPresets();
}





// ---------- Logout ----------

if (accountLogoutBtn) {
  accountLogoutBtn.addEventListener("click", async () => {
    try {
      await fetch("/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("logout error", err);
    }
    window.location.href = "/";
  });
}

// ---------- Change password ----------

if (changePasswordForm) {
  changePasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmNewPassword = confirmNewPasswordInput.value;

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      alert("Please fill out all fields.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      alert("New passwords do not match.");
      return;
    }

    try {
      const res = await fetch("/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("change-password error:", res.status, text);

        if (res.status === 400) {
          alert(text || "Invalid request.");
        } else if (res.status === 401) {
          alert("Current password is incorrect.");
        } else {
          alert("Failed to change password (see console).");
        }
        return;
      }

      alert("Password updated successfully.");
      changePasswordForm.reset();
    } catch (err) {
      console.error("changePasswordForm error:", err);
      alert("Failed to change password (network error).");
    }
  });
}

// ---------- Saved protocols list ----------

// ---------- Saved protocols list ----------

async function loadAccountProtocols() {
  if (!protocolListEl) return;

  try {
    const res = await fetch("/api/protocols?scope=account", {
      credentials: "include",
    });

    if (!res.ok) {
      console.error("loadAccountProtocols status:", res.status);
      if (noProtocolsMessage) {
        noProtocolsMessage.textContent =
          "Failed to load protocols. Please try again.";
      }
      return;
    }

    const data = await res.json();
    const list = Array.isArray(data) ? data : [];

    protocolListEl.innerHTML = "";

    if (!list.length) {
      if (noProtocolsMessage) {
        noProtocolsMessage.textContent =
          "You do not have any saved protocols yet.";
      }
      return;
    }

    if (noProtocolsMessage) {
      noProtocolsMessage.textContent = "";
    }

    list.forEach((p) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.gap = "8px";
      row.style.padding = "6px 0";
      row.style.borderBottom = "1px solid #1f2937";

      const nameSpan = document.createElement("span");
      nameSpan.textContent = p.name || "(unnamed protocol)";
      nameSpan.style.fontSize = "13px";

      if (p.is_public) {
        const badge = document.createElement("span");
        badge.textContent = "Public";
        badge.style.marginLeft = "8px";
        badge.style.fontSize = "11px";
        badge.style.padding = "2px 6px";
        badge.style.borderRadius = "999px";
        badge.style.border = "1px solid #22c55e";
        badge.style.color = "#22c55e";
        nameSpan.appendChild(badge);
      }

      const rightSide = document.createElement("div");
      rightSide.style.display = "flex";
      rightSide.style.gap = "6px";

      // Open
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.textContent = "Open";
      openBtn.addEventListener("click", () => {
        if (!p.id) return;
        window.location.href = `/?protocolId=${encodeURIComponent(p.id)}`;
      });

      // 🔹 Make public (only if not already public)
      const makePublicBtn = document.createElement("button");
      makePublicBtn.type = "button";
      makePublicBtn.textContent = "Make public";

      if (p.is_public) {
        makePublicBtn.disabled = true;
        makePublicBtn.textContent = "Public";
      } else {
        makePublicBtn.addEventListener("click", async () => {
          if (!p.id) return;
          try {
            const res = await fetch("/api/protocols", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                id: p.id,
                makePublic: true,
              }),
            });

            if (!res.ok) {
              const text = await res.text();
              console.error("makePublic error:", res.status, text);
              alert("Failed to make protocol public (see console).");
              return;
            }

            alert("Protocol is now public and visible to all users.");
            await loadAccountProtocols();
          } catch (err) {
            console.error("makePublic network error:", err);
            alert("Failed to make protocol public (network error).");
          }
        });
      }

      // Delete
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.textContent = "Delete";
      deleteBtn.style.background = "#ef4444";
      deleteBtn.style.color = "#fff";

      deleteBtn.addEventListener("click", async () => {
        if (!p.id) return;
        if (!confirm(`Delete protocol "${p.name}"? This cannot be undone.`)) {
          return;
        }

        try {
          const res = await fetch("/api/protocols", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              id: p.id,
              delete: true,
            }),
          });

          if (!res.ok) {
            const text = await res.text();
            console.error("delete protocol error:", res.status, text);
            alert("Failed to delete protocol (see console).");
            return;
          }

          await loadAccountProtocols();
        } catch (err) {
          console.error("delete protocol error:", err);
          alert("Failed to delete protocol (network error).");
        }
      });

      // Order: Open | Make public | Delete
      rightSide.appendChild(openBtn);
      rightSide.appendChild(makePublicBtn);
      rightSide.appendChild(deleteBtn);

      row.appendChild(nameSpan);
      row.appendChild(rightSide);

      protocolListEl.appendChild(row);
    });
  } catch (err) {
    console.error("loadAccountProtocols error:", err);
    if (noProtocolsMessage) {
      noProtocolsMessage.textContent =
        "Failed to load protocols (network error).";
    }
  }
}

async function loadAccountColumnPresets() {
  if (!presetList) return;

  presetList.innerHTML = '<p class="muted">Loading presets...</p>';

  try {
    const res = await fetch("/api/column-presets", { credentials: "include" });
    if (!res.ok) {
      presetList.innerHTML = '<p class="muted">Unable to load presets.</p>';
      return;
    }

    const presets = await res.json();
    if (!Array.isArray(presets) || presets.length === 0) {
      presetList.innerHTML =
        '<p class="muted">No column presets defined yet.</p>';
      return;
    }

    const frag = document.createDocumentFragment();

    presets.forEach((p) => {
      const row = document.createElement("div");
      row.className = "protocol-row";

      const main = document.createElement("div");
      main.className = "protocol-main";

      const title = document.createElement("div");
      title.className = "protocol-title";
      title.textContent = p.label || p.key;

      const meta = document.createElement("div");
      meta.className = "protocol-meta";
      meta.textContent =
        `key: ${p.key}` +
        (p.standardOrder != null ? ` · order ${p.standardOrder}` : "");

      main.appendChild(title);
      main.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "protocol-actions";

      // Edit button: loads into the form
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn-ghost small";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => {
        if (presetKeyInput) presetKeyInput.value = p.key || "";
        if (presetLabelInput) presetLabelInput.value = p.label || "";
        if (presetOrderInput)
          presetOrderInput.value =
            p.standardOrder != null ? String(p.standardOrder) : "";

        const cfg = p.config || {};

        if (presetColId) presetColId.value = cfg.id || "";
        if (presetColName) presetColName.value = cfg.name || "";
        if (presetColAbbr) presetColAbbr.value = cfg.abbr || "";
        if (presetColBg) presetColBg.value = cfg.backgroundColor || "#DDDDDD";

        if (presetAllowInt) presetAllowInt.checked = !!cfg.allowInt;
        if (presetAllowStr) presetAllowStr.checked = !!cfg.allowStr;

        if (presetIntMin)
          presetIntMin.value =
            cfg.intMin !== undefined && cfg.intMin !== null
              ? cfg.intMin
              : "";
        if (presetIntMax)
          presetIntMax.value =
            cfg.intMax !== undefined && cfg.intMax !== null
              ? cfg.intMax
              : "";

        if (presetStrOptions) {
          const opts = Array.isArray(cfg.strOptions) ? cfg.strOptions : [];
          presetStrOptions.value = opts.join(", ");
        }

        if (presetTabBehavior)
          presetTabBehavior.value = cfg.tabBehavior || "nextColumn";
        if (presetUseStartDil)
          presetUseStartDil.checked = !!cfg.useAsStartingDilution;
        if (presetShowWhenPrescribing)
          presetShowWhenPrescribing.checked = !!cfg.showWhenPrescribing;

        if (presetAutoFillValue)
          presetAutoFillValue.value =
            cfg.autoFillValue !== undefined && cfg.autoFillValue !== null
              ? String(cfg.autoFillValue)
              : "";

        if (presetAutoFillOverwrite)
          presetAutoFillOverwrite.checked = !!cfg.autoFillOverwrite;
        if (presetAutoFillSetNeg)
          presetAutoFillSetNeg.checked = !!cfg.autoFillSetNeg;
        if (presetAutoFillSetPos)
          presetAutoFillSetPos.checked = !!cfg.autoFillSetPos;

        if (presetHasPositive) presetHasPositive.checked = !!cfg.hasPositive;

        if (presetPositiveIntMin)
          presetPositiveIntMin.value =
            cfg.positiveIntMin !== undefined && cfg.positiveIntMin !== null
              ? cfg.positiveIntMin
              : "";

        if (presetPositiveStrOptions) {
          const pOpts = Array.isArray(cfg.positiveStrOptions)
            ? cfg.positiveStrOptions
            : [];
          presetPositiveStrOptions.value = pOpts.join(", ");
        }

        // Keep hidden JSON clean (optional)
        if (presetConfigInput) {
          try {
            presetConfigInput.value = JSON.stringify(cfg, null, 2);
          } catch {
            presetConfigInput.value = "";
          }
        }

        if (presetFormError) {
          presetFormError.style.display = "none";
          presetFormError.textContent = "";
        }

        // Show the editor when editing an existing preset
        if (presetEditorContainer) {
          presetEditorContainer.classList.remove("hidden");
        }
      });

      actions.appendChild(editBtn);

      // Delete button (admin only)
      if (currentUserIsAdmin) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "btn-danger small";
        delBtn.textContent = "Delete";
        delBtn.addEventListener("click", async () => {
          if (!confirm(`Delete preset "${p.label || p.key}"?`)) return;
          try {
            const delRes = await fetch(
              `/api/column-presets?key=${encodeURIComponent(p.key)}`,
              {
                method: "DELETE",
                credentials: "include",
              }
            );
            if (!delRes.ok && delRes.status !== 204) {
              alert("Failed to delete preset.");
              return;
            }
            await loadAccountColumnPresets();
          } catch (err) {
            console.error("delete preset error", err);
            alert("Error deleting preset.");
          }
        });
        actions.appendChild(delBtn);
      }

      row.appendChild(main);
      row.appendChild(actions);
      frag.appendChild(row);
    });

    presetList.innerHTML = "";
    presetList.appendChild(frag);
  } catch (err) {
    console.error("loadAccountColumnPresets error", err);
    presetList.innerHTML = '<p class="muted">Error loading presets.</p>';
  }
}


if (presetForm) {
  presetForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (presetFormError) {
      presetFormError.style.display = "none";
      presetFormError.textContent = "";
    }

    const key = (presetKeyInput?.value || "").trim();
    const label = (presetLabelInput?.value || "").trim();
    const orderStr = (presetOrderInput?.value || "").trim();

    if (!key || !label) {
      if (presetFormError) {
        presetFormError.textContent = "Key and label are required.";
        presetFormError.style.display = "block";
      }
      return;
    }

    // Build config from structured fields
    const id = (presetColId?.value || "").trim();
    const name = (presetColName?.value || "").trim();
    const abbr = (presetColAbbr?.value || "").trim();
    const bg = presetColBg?.value || "#DDDDDD";

    const allowInt = !!(presetAllowInt && presetAllowInt.checked);
    const allowStr = !!(presetAllowStr && presetAllowStr.checked);

    const intMinStr = (presetIntMin?.value || "").trim();
    const intMaxStr = (presetIntMax?.value || "").trim();

    const intMin =
      intMinStr === "" ? null : Number.isNaN(Number(intMinStr)) ? null : Number(intMinStr);
    const intMax =
      intMaxStr === "" ? null : Number.isNaN(Number(intMaxStr)) ? null : Number(intMaxStr);

    const strOptsStr = (presetStrOptions?.value || "").trim();
    const strOptions = strOptsStr
      ? strOptsStr
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      : [];

    const tabBehavior = presetTabBehavior?.value || "nextColumn";
    const useAsStartingDilution = !!(
      presetUseStartDil && presetUseStartDil.checked
    );
    const showWhenPrescribing = !!(
      presetShowWhenPrescribing && presetShowWhenPrescribing.checked
    );

    const autoFillValue = (presetAutoFillValue?.value || "").trim();
    const autoFillOverwrite = !!(
      presetAutoFillOverwrite && presetAutoFillOverwrite.checked
    );
    const autoFillSetNeg = !!(presetAutoFillSetNeg && presetAutoFillSetNeg.checked);
    const autoFillSetPos = !!(presetAutoFillSetPos && presetAutoFillSetPos.checked);

    const hasPositive = !!(presetHasPositive && presetHasPositive.checked);

    const posIntStr = (presetPositiveIntMin?.value || "").trim();
    const positiveIntMin =
      posIntStr === "" ? null : Number.isNaN(Number(posIntStr)) ? null : Number(posIntStr);

    const posStrStr = (presetPositiveStrOptions?.value || "").trim();
    const positiveStrOptions = posStrStr
      ? posStrStr
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
      : [];

    // Build config object that matches what builder.js expects in applyColumnPreset
    const cfg = {
      id,
      name,
      abbr,
      backgroundColor: bg,
      allowInt,
      allowStr,
      intMin,
      intMax,
      strOptions,
      tabBehavior,
      useAsStartingDilution,
      hasPositive,
      positiveIntMin,
      positiveStrOptions,
      showWhenPrescribing,
      autoFillValue,
      autoFillOverwrite,
      autoFillSetNeg,
      autoFillSetPos,
    };

    // Optional: keep hidden JSON in sync (for debugging)
    if (presetConfigInput) {
      presetConfigInput.value = JSON.stringify(cfg, null, 2);
    }




    const payload = {
      key,
      label,
      config: cfg,
    };

    if (orderStr) {
      const n = Number(orderStr);
      if (!Number.isNaN(n)) payload.standardOrder = n;
    }

    try {
      const res = await fetch("/api/column-presets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        console.error("save preset failed:", res.status, text);
        throw new Error(text || `save failed with status ${res.status}`);
      }

      clearPresetForm();

      if (presetEditorContainer) {
        presetEditorContainer.classList.add("hidden");
      }

      await loadAccountColumnPresets();


    } catch (err) {
      console.error("save preset error", err);
      if (presetFormError) {
        presetFormError.textContent = "Failed to save preset.";
        presetFormError.style.display = "block";
      }
    }
  });
}

function clearPresetForm() {
  if (!presetForm) return;

  presetForm.reset();

  if (presetFormError) {
    presetFormError.style.display = "none";
    presetFormError.textContent = "";
  }

  if (presetConfigInput) {
    presetConfigInput.value = "";
  }
}


if (presetFormResetBtn && presetForm) {
  presetFormResetBtn.addEventListener("click", () => {
    clearPresetForm();
  });
}


if (newPresetBtn && presetEditorContainer) {
  newPresetBtn.addEventListener("click", () => {
    clearPresetForm();
    presetEditorContainer.classList.remove("hidden");
  });
}

if (presetCancelBtn && presetEditorContainer) {
  presetCancelBtn.addEventListener("click", () => {
    clearPresetForm();
    presetEditorContainer.classList.add("hidden");
  });
}



// ---------- Boot ----------

document.addEventListener("DOMContentLoaded", () => {
  checkAccountAuth();
});

