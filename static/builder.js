console.log("logicgrid builder.js loaded");


// -----------------------------
// Standard namedFunctions snippets
// -----------------------------
const AUTO_FILL_FUNCTION =
    "  if (row[committedColumnId] === null) {\r\n" +
    "    return {\r\n" +
    "      type: 'setValue',\r\n" +
    "      value: columns[committedColumnIdx].autoFill.value,\r\n" +
    "      columnId: columns[committedColumnIdx].id\r\n" +
    "    }\r\n" +
    "  }";

// -----------------------------
// DOM references
// -----------------------------
const columnCountInput = document.getElementById("columnCount");
const buildColumnsBtn = document.getElementById("buildColumnsBtn");
const columnsContainer = document.getElementById("columnsContainer");
const generateJsonBtn = document.getElementById("generateJsonBtn");
const output = document.getElementById("output");
const addColumnBtn = document.getElementById("addColumnBtn");
const addPresetColumnsBtn = document.getElementById("addPresetColumnsBtn");
const removePresetColumnsBtn = document.getElementById("removePresetColumnsBtn");




// Scoring UI
const scoringContainer = document.getElementById("scoringContainer");
const addScoreFnBtn = document.getElementById("addScoreFnBtn");
const refreshScoringColsBtn = document.getElementById("refreshScoringColsBtn");


// Create a bottom "Add Trigger/Rule" button under the scoring section
let addScoreFnBtnBottom = null;
let scoringFooterRow = null;

if (scoringContainer && addScoreFnBtn && scoringContainer.parentNode) {
    const footerRow = document.createElement("div");
    footerRow.className = "row scoring-trigger-footer";

    addScoreFnBtnBottom = document.createElement("button");
    addScoreFnBtnBottom.type = "button";
    addScoreFnBtnBottom.textContent = "Add additional Trigger/Rule";

    // Reuse styling from the top button if it has classes
    if (addScoreFnBtn.className) {
        addScoreFnBtnBottom.className = addScoreFnBtn.className;
    }

    footerRow.appendChild(addScoreFnBtnBottom);

    // Insert the footer row immediately after the scoringContainer
    scoringContainer.parentNode.insertBefore(
        footerRow,
        scoringContainer.nextSibling
    );

    // 🔹 Keep a reference and HIDE it until at least one trigger exists
    scoringFooterRow = footerRow;
    scoringFooterRow.style.display = "none";
}



// -----------------------------
// Event listeners
// -----------------------------
if (buildColumnsBtn) {
    buildColumnsBtn.addEventListener("click", buildColumns);
}
if (generateJsonBtn) {
    generateJsonBtn.addEventListener("click", generateJson);
}
if (addColumnBtn) {
    addColumnBtn.addEventListener("click", addColumn);
}
if (addPresetColumnsBtn) {
    addPresetColumnsBtn.addEventListener("click", addPresetColumns);
}
if (removePresetColumnsBtn) {
    removePresetColumnsBtn.addEventListener("click", removePresetColumns);
}



function handleAddScoringTrigger() {
    const colCards = columnsContainer.querySelectorAll(".column-card");

    if (!colCards.length) {
        alert("Please build columns first (set 'Number of columns' and click 'Build Columns').");
        columnCountInput.focus();
        return;
    }

    const idx = scoringContainer.children.length;
    scoringContainer.appendChild(createScoringCard(idx));

    // 🔹 Now that we have at least one trigger, show the bottom button row
    if (scoringFooterRow && scoringContainer.children.length > 0) {
        scoringFooterRow.style.display = "flex";
    }
}


if (addScoreFnBtn && scoringContainer) {
    // start disabled until columns are built at least once
    addScoreFnBtn.disabled = true;
    addScoreFnBtn.addEventListener("click", handleAddScoringTrigger);
}

if (addScoreFnBtnBottom && scoringContainer) {
    addScoreFnBtnBottom.disabled = true;
    addScoreFnBtnBottom.addEventListener("click", handleAddScoringTrigger);
}

if (refreshScoringColsBtn && scoringContainer) {
    refreshScoringColsBtn.addEventListener("click", () => {
        refreshScoringColumnDropdowns();
        alert("Scoring column dropdowns refreshed from current columns.");
    });
}





// -----------------------------
// Renumber column cards based on DOM order
// -----------------------------
function renumberColumns() {
    if (!columnsContainer) return;
    const cards = columnsContainer.querySelectorAll(".column-card");
    const lastIdx = cards.length - 1;

    cards.forEach((card, idx) => {
        card.dataset.index = idx;
        const header = card.querySelector("h3");
        if (header) {
            header.textContent = `Column ${idx + 1}`;
        }

        // Show/hide move buttons based on position
        const upBtn = card.querySelector(".col-move-up-btn");
        const downBtn = card.querySelector(".col-move-down-btn");

        if (upBtn) {
            upBtn.style.display = idx === 0 ? "none" : "inline-flex";
        }
        if (downBtn) {
            downBtn.style.display = idx === lastIdx ? "none" : "inline-flex";
        }
    });

    // keep the numeric input in sync
    if (columnCountInput) {
        columnCountInput.value = cards.length;
    }

    // any time columns are reindexed/changed, refresh scoring dropdowns
    refreshScoringColumnDropdowns();
}




// -----------------------------
// Insert a column before an existing card
// -----------------------------
function insertColumnBefore(existingCard) {
    if (!columnsContainer || !existingCard) return;

    const cards = Array.from(columnsContainer.children);
    const newIndex = cards.indexOf(existingCard);
    const newCard = createColumnCard(newIndex);

    columnsContainer.insertBefore(newCard, existingCard);

    // renumber everything after the insert
    renumberColumns();

    // ensure scoring rules can be added once any column exists
    if (addScoreFnBtn) {
        addScoreFnBtn.disabled = false;
    }
    if (addScoreFnBtnBottom) {
        addScoreFnBtnBottom.disabled = false;
    }
}

// -----------------------------
// Move a column up or down
// direction: -1 = up, +1 = down
// -----------------------------
function moveColumn(card, direction) {
    if (!columnsContainer || !card) return;

    const cards = Array.from(columnsContainer.querySelectorAll(".column-card"));
    const index = cards.indexOf(card);
    if (index === -1) return;

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= cards.length) {
        return; // out of bounds, ignore
    }

    const target = cards[newIndex];

    if (direction === 1) {
        // moving down → insert AFTER target
        columnsContainer.insertBefore(card, target.nextSibling);
    } else {
        // moving up → insert BEFORE target
        columnsContainer.insertBefore(card, target);
    }

    // renumber & refresh scoring column dropdowns
    renumberColumns();
}


// -----------------------------
// Remove a column
// -----------------------------
function removeColumn(card) {
    if (!columnsContainer || !card) return;

    columnsContainer.removeChild(card);

    // renumber remaining columns and keep columnCount in sync
    renumberColumns();
}

// -----------------------------
// Add a single column (no wipe)
// -----------------------------
function addColumn() {
    if (!columnsContainer) return;

    // Use current number of cards as the new index
    const index = columnsContainer.children.length;
    const newCard = createColumnCard(index);
    columnsContainer.appendChild(newCard);

    renumberColumns();

    // Ensure scoring rules can be added once any column exists
    if (addScoreFnBtn) {
        addScoreFnBtn.disabled = false;
    }
    if (addScoreFnBtnBottom) {
        addScoreFnBtnBottom.disabled = false;
    }
}

// -----------------------------
// Build empty columns (full reset)
// -----------------------------
function buildColumns() {
    const count = parseInt(columnCountInput.value, 10) || 0;
    columnsContainer.innerHTML = "";

    for (let i = 0; i < count; i++) {
        columnsContainer.appendChild(createColumnCard(i));
    }

    renumberColumns();

    // now that columns exist, allow scoring rules
    if (addScoreFnBtn) {
        addScoreFnBtn.disabled = false;
    }
    if (addScoreFnBtnBottom) {
        addScoreFnBtnBottom.disabled = false;
    }
}


function getColumnPresetOptionsHtml() {
    const presets = window.columnPresets || {};
    let html = '<option value="">Custom</option>';

    // Prefer the standard order, if provided
    const order = getDefaultPresetSet();
    const used = new Set();

    order.forEach((key) => {
        const p = presets[key];
        if (!p) return;
        used.add(key);
        const label = p.label || key;
        const safeLabel = escapeHtml(label);
        html += `<option value="${key}">${safeLabel}</option>`;
    });

    // Add any remaining presets not in defaultPresetOrder (alphabetically)
    Object.keys(presets)
        .sort()
        .forEach((key) => {
            if (used.has(key)) return;
            const p = presets[key];
            if (!p) return;
            const label = p.label || key;
            const safeLabel = escapeHtml(label);
            html += `<option value="${key}">${safeLabel}</option>`;
        });

    return html;
}

function refreshPresetDropdowns() {
    const optionsHtml = getColumnPresetOptionsHtml();
    const selects = document.querySelectorAll(".col-type");

    selects.forEach((sel) => {
        const current = sel.value;   // remember current selection if any
        sel.innerHTML = optionsHtml;

        if (current) {
            const has = Array.from(sel.options).some(o => o.value === current);
            if (has) {
                sel.value = current;
            }
        }
    });
}


// -----------------------------
// Create a column card UI
// -----------------------------
function createColumnCard(index) {
    const card = document.createElement("div");
    card.className = "column-card";
    card.dataset.index = index;

    const presetOptionsHtml = getColumnPresetOptionsHtml();

    card.innerHTML = `
  <div class="row column-header-row">
    <button type="button" class="col-insert-before-btn">
      Insert column above
    </button>
    
    <button type="button" class="col-move-up-btn hover-info">
      ↑
      <span class="tooltip">Move column up</span>
    </button>
    <button type="button" class="col-move-down-btn hover-info">
      ↓
      <span class="tooltip">Move column down</span>
    </button>
    <button type="button" class="col-remove-btn btn-ghost">
          Remove
    </button>

    <div style="flex: 1;"></div>

    <button type="button" class="col-toggle-btn btn-ghost-neutral">
      Collapse
    </button>
  </div>

  <div class="column-body">
    <div class="row">
      <label style="flex: 1;">Column Preset
        <select class="col-type">
          ${presetOptionsHtml}
        </select>
      </label>
    </div>
  


    <div class="row">
      <label>ID
        <input type="text" class="col-id" placeholder="e.g. Score" />
      </label>
      <label>Name
        <input type="text" class="col-name" placeholder="Display name" />
      </label>
      <label>Abbr
        <input type="text" class="col-abbr" placeholder="e.g. S" />
      </label>
      <label>Background Color
        <select class="col-bg">
          <option value="#FFFFFF">White</option>
          <option value="#DDDDDD">Light Grey</option>
          <option value="#E0F0FF">Light Blue</option>
          <option value="#FFE0E0">Light Pink</option>
          <option value="#FFFFE0">Light Yellow</option>
        </select>
      </label>
    </div>

    <div class="boxed-section">
      <h4>Value type</h4>

      <div class="row">
        <label style="flex: 1;">
          <select class="col-valuetype">
            <option value="both">Allow integers and strings</option>
            <option value="int">Integers only</option>
            <option value="str">Strings only</option>
          </select>
        </label>

        <label style="display:none;">
          <input type="checkbox" class="col-allowint" checked />
          Allow Int
        </label>
        <label style="display:none;">
          <input type="checkbox" class="col-allowstr" />
          Allow Strings
        </label>
      </div>

      <div class="row int-config">
        <label style="display:none;">
          Int Min
          <input type="number" class="col-intmin" value="0" />
        </label>
        <label>Int Max
          <input type="number" class="col-intmax" placeholder="e.g. 40" />
        </label>
      </div>

      <div class="row str-config">
        <label>String Options (comma-separated)
          <input type="text" class="col-stropts" placeholder="- , + , ++ , +++" />
        </label>
      </div>
    </div>

    <div class="boxed-section">
      <h4>Settings</h4>
      <div class="row">
        <label>Tab Behavior
          <select class="col-tab">
            <option value="nextColumn">Next column</option>
            <option value="nextRow">Next row</option>
            <option value="nextRowPrevColumn">Next row, back one column</option>
          </select>
        </label>

        <label>Use as base value
          <select class="col-use-start-dil">
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>

        <label>Show when reporting
          <select class="col-show-when-prescribing">
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
      </div>
    </div>

    <div class="boxed-section">
      <h4>Autofill</h4>

      <div class="row autofill-group">
        <label class="hover-info">
          <input type="checkbox" class="col-autofill-enabled" />
          Enable autofill
          <span class="tooltip">
            When enabled, commits will automatically set values or references according to these settings.
          </span>
        </label>

        <div class="autofill-settings" style="display:none;">
          <label>Value
            <input type="text" class="col-autofill-value" placeholder="e.g. 0 or -" />
          </label>

          <label>Overwrite existing
            <select class="col-autofill-overwrite-mode">
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>

          <label>Autofill references?
            <select class="col-autofill-control-mode">
              <option value="none">None</option>
              <option value="negative">Negative reference</option>
              <option value="positive">Positive reference</option>
              <option value="both">Both references</option>
            </select>
          </label>
        </div>
      </div>
    </div>

    <div class="boxed-section">
      <h4>Positive values</h4>

      <div class="row">
        <label>
          <input type="checkbox" class="col-has-positive" />
          Enable positive values
        </label>

        <div class="positive-config" style="display:none;">
          <label>Positive Int Min
            <input type="number" class="col-positive-intmin" />
          </label>
          <label>Positive String Options
            <input type="text" class="col-positive-stropts" placeholder="#3 , #4 , #5" />
          </label>
        </div>
      </div>
    </div>
  </div>
`;


    // Insert column above this one
    const insertBtn = card.querySelector(".col-insert-before-btn");
    if (insertBtn) {
        insertBtn.addEventListener("click", () => {
            insertColumnBefore(card);
        });
    }

    // Remove this column
    const removeBtn = card.querySelector(".col-remove-btn");
    if (removeBtn) {
        removeBtn.addEventListener("click", () => {
            removeColumn(card);
        });
    }

    // Move this column up
    const moveUpBtn = card.querySelector(".col-move-up-btn");
    if (moveUpBtn) {
        moveUpBtn.addEventListener("click", () => {
            moveColumn(card, -1);
        });
    }

    // Move this column down
    const moveDownBtn = card.querySelector(".col-move-down-btn");
    if (moveDownBtn) {
        moveDownBtn.addEventListener("click", () => {
            moveColumn(card, 1);
        });
    }

    // Collapse / expand this column
    const toggleBtn = card.querySelector(".col-toggle-btn");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            const collapsed = card.classList.toggle("collapsed");
            toggleBtn.textContent = collapsed ? "Expand" : "Collapse";
        });
    }



    // Column type preset handler
    const typeSelect = card.querySelector(".col-type");

    typeSelect.addEventListener("change", (e) => {
        const presetKey = e.target.value;
        if (presetKey) {
            applyColumnPreset(card, presetKey);
            // Remember where this card came from so we can remove presets later
            card.dataset.presetKey = presetKey;
        } else {
            // Switched back to "Custom"
            delete card.dataset.presetKey;
        }
    });


    // Value type toggle logic
    const valueTypeSelect = card.querySelector(".col-valuetype");
    const allowIntCb = card.querySelector(".col-allowint");
    const allowStrCb = card.querySelector(".col-allowstr");
    const intRow = card.querySelector(".int-config");
    const strRow = card.querySelector(".str-config");

    function applyValueType(value) {
        if (value === "int") {
            allowIntCb.checked = true;
            allowStrCb.checked = false;
            intRow.style.display = "flex";
            strRow.style.display = "none";
        } else if (value === "str") {
            allowIntCb.checked = false;
            allowStrCb.checked = true;
            intRow.style.display = "none";
            strRow.style.display = "flex";
        } else {
            // both
            allowIntCb.checked = true;
            allowStrCb.checked = true;
            intRow.style.display = "flex";
            strRow.style.display = "flex";
        }
    }

    valueTypeSelect.addEventListener("change", (e) => {
        applyValueType(e.target.value);
    });

    // default: both
    applyValueType("both");

    // Positive values toggle
    const hasPositiveCb = card.querySelector(".col-has-positive");
    const positiveRow = card.querySelector(".positive-config");

    function syncPositiveVisibility() {
        positiveRow.style.display = hasPositiveCb.checked ? "flex" : "none";
    }

    hasPositiveCb.addEventListener("change", syncPositiveVisibility);
    syncPositiveVisibility();

    // Autofill visibility toggle
    const autofillEnabledCb = card.querySelector(".col-autofill-enabled");
    const autofillSettingsRow = card.querySelector(".autofill-settings");

    function syncAutofillVisibility() {
        autofillSettingsRow.style.display = autofillEnabledCb.checked ? "flex" : "none";
    }

    autofillEnabledCb.addEventListener("change", syncAutofillVisibility);
    syncAutofillVisibility();

    return card;
}


// -----------------------------
// Create a scoring rule card UI (one per trigger column)
// -----------------------------
function createScoringCard(index) {
    const card = document.createElement("div");
    card.className = "column-card score-card";
    card.dataset.index = index;

    const optionsHtml = getColumnOptionsHtml();

    card.innerHTML = `
    <div class="row score-header-row">
      <h3 style="margin: 0;">Scoring Rules for Trigger ${index + 1}</h3>
      <div style="flex: 1;"></div>
      <button type="button" class="score-toggle-btn btn-ghost-neutral">
        Collapse
      </button>
    </div>

    <div class="score-body">
      <div class="row">
        <label>Trigger Column
          <select class="score-trigger-col">
            ${optionsHtml}
          </select>
        </label>
        <label>Score references?
          <select class="score-scope">
            <option value="neither">Neither (standard items only)</option>
            <option value="positive">Positive only</option>
            <option value="negative">Negative only</option>
          </select>
        </label>
        <label>Require References?
          <select class="score-require-controls">
            <option value="none">No reference requirement</option>
            <option value="positive">Require positive reference</option>
            <option value="negative">Require negative reference</option>
            <option value="both">Require both references</option>
          </select>
        </label>
      </div>

      <div class="score-rules-container"></div>

      <div class="row" style="align-items: center; gap: 8px;">
        <button type="button" class="add-score-row-btn">
          Add new scoring rule
        </button>
        <span style="font-size: 12px; opacity: 0.8;">
          Creates a separate scoring rule for this trigger (like another IF / ELSE IF block).
        </span>
      </div>
    </div>
  `;

    const rulesContainer = card.querySelector(".score-rules-container");
    const addRowBtn = card.querySelector(".add-score-row-btn");
    const scoreBody = card.querySelector(".score-body");
    const toggleBtn = card.querySelector(".score-toggle-btn");

    if (toggleBtn && scoreBody) {
        toggleBtn.addEventListener("click", () => {
            const collapsed = card.classList.toggle("collapsed");
            toggleBtn.textContent = collapsed ? "Expand" : "Collapse";
        });
    }

    function addRuleRow() {
        const row = document.createElement("div");
        row.className = "score-rule-row";

        row.innerHTML = `
    <div class="boxed-section score-condition-box">
      <div class="score-conditions">
        <div class="row score-condition-row">
          <label>Condition Column
            <select class="score-cond-col">
              ${optionsHtml}
            </select>
          </label>
          <label>Operator
            <select class="score-op">
              <option value="always">Always (no condition)</option>
              <option value=">">&gt;</option>
              <option value=">=">&gt;=</option>
              <option value="<">&lt;</option>
              <option value="<=">&lt;=</option>
              <option value="==">==</option>
              <option value="!=">!=</option>
            </select>
          </label>
          <label>Threshold
            <input type="text" class="score-thresh" placeholder="e.g. 3" />
          </label>
          <label>Compare to
            <select class="score-thresh-base">
              <option value="zero">0</option>
              <option value="negative">Negative reference</option>
              <option value="positive">Positive reference</option>
            </select>
          </label>
          </div>

        <div class="row score-add-condition-row">
          <button type="button" class="add-extra-condition-btn">
            Add AND condition (within this rule)
          </button>
        </div>
      </div>
    
      <div class="score-updates">
        <div class="row score-update-row">
          <label>Update Column
            <select class="score-update-col">
              ${optionsHtml}
            </select>
          </label>
          <label>Value
            <input type="text" class="score-update-val" placeholder="e.g. #5" />
          </label>
          </div>

        <div class="row score-add-update-row">
          <button type="button" class="add-update-col-btn">
            Update additional columns
          </button>
        </div>
      </div>
    </div>
  `;

        const conditionsWrapper = row.querySelector(".score-conditions");
        const baseCondRow = row.querySelector(".score-condition-row");
        const addCondBtn = row.querySelector(".add-extra-condition-btn");

        const updatesWrapper = row.querySelector(".score-updates");
        const baseUpdateRow = row.querySelector(".score-update-row");
        const addUpdateBtn = row.querySelector(".add-update-col-btn");

        // ---------- NEW: helpers to add "Remove" buttons with min-1 guard ----------

        function wireConditionRowRemove(condRow) {
            if (!condRow) return;

            let removeBtn = condRow.querySelector(".remove-condition-btn");
            if (!removeBtn) {
                removeBtn = document.createElement("button");
                removeBtn.type = "button";
                removeBtn.className = "remove-condition-btn";
                removeBtn.textContent = "Remove";

                // styling is up to you; inline is fine to start
                removeBtn.style.marginLeft = "0.5rem";

                condRow.appendChild(removeBtn);
            }

            removeBtn.addEventListener("click", (e) => {
                e.preventDefault();
                const allRows = conditionsWrapper.querySelectorAll(".score-condition-row");
                if (allRows.length <= 1) {
                    // do not remove the last remaining condition
                    return;
                }
                condRow.remove();
            });
        }

        function wireUpdateRowRemove(updateRow) {
            if (!updateRow) return;

            let removeBtn = updateRow.querySelector(".remove-update-btn");
            if (!removeBtn) {
                removeBtn = document.createElement("button");
                removeBtn.type = "button";
                removeBtn.className = "remove-update-btn";
                removeBtn.textContent = "Remove";

                removeBtn.style.marginLeft = "0.5rem";

                updateRow.appendChild(removeBtn);
            }

            removeBtn.addEventListener("click", (e) => {
                e.preventDefault();
                const allRows = updatesWrapper.querySelectorAll(".score-update-row");
                if (allRows.length <= 1) {
                    // do not remove the last remaining update row
                    return;
                }
                updateRow.remove();
            });
        }

        // Wire remove button for the initial rows
        wireConditionRowRemove(baseCondRow);
        wireUpdateRowRemove(baseUpdateRow);

        // --- per-rule "add condition" behaviour (AND conditions) ---
        function addConditionRow() {
            const clone = baseCondRow.cloneNode(true);

            const colSel = clone.querySelector(".score-cond-col");
            const opSel = clone.querySelector(".score-op");
            const threshInput = clone.querySelector(".score-thresh");
            const baseSel = clone.querySelector(".score-thresh-base");

            if (colSel) colSel.value = "";
            if (opSel) opSel.value = "always";
            if (threshInput) threshInput.value = "";
            if (baseSel) baseSel.value = "zero";

            // wire remove behavior for this cloned row
            wireConditionRowRemove(clone);

            conditionsWrapper.insertBefore(
                clone,
                conditionsWrapper.querySelector(".score-add-condition-row")
            );
        }

        // expose for hydration
        row._addConditionRow = addConditionRow;

        if (addCondBtn) {
            addCondBtn.addEventListener("click", (e) => {
                e.preventDefault();
                addConditionRow();
            });
        }

        // --- per-rule "add update column" behaviour ---
        function addUpdateRow() {
            const clone = baseUpdateRow.cloneNode(true);
            const colSel = clone.querySelector(".score-update-col");
            const valInput = clone.querySelector(".score-update-val");

            if (colSel) colSel.value = "";
            if (valInput) valInput.value = "";

            // wire remove behavior for this cloned row
            wireUpdateRowRemove(clone);

            updatesWrapper.insertBefore(
                clone,
                row.querySelector(".score-add-update-row")
            );
        }

        row._addUpdateRow = addUpdateRow;

        if (addUpdateBtn) {
            addUpdateBtn.addEventListener("click", (e) => {
                e.preventDefault();
                addUpdateRow();
            });
        }

        rulesContainer.appendChild(row);
    }


    // First scoring rule by default
    addRuleRow();

    addRowBtn.addEventListener("click", (e) => {
        e.preventDefault();
        addRuleRow();
    });

    return card;
}



// -----------------------------
// Apply per-column preset
// -----------------------------
function applyColumnPreset(card, presetKey) {
    // Pull from global presets loaded by databasesetup.js
    const allPresets = window.columnPresets || {};
    const preset = allPresets[presetKey];
    if (!preset) return;

    // Tag this card so we know it came from a preset
    card.dataset.presetKey = presetKey;

    // Keep dropdown in sync in case this was triggered programmatically
    const typeSelect = card.querySelector(".col-type");
    if (typeSelect) {
        typeSelect.value = presetKey;
    }

    const idInput = card.querySelector(".col-id");

    const nameInput = card.querySelector(".col-name");
    const abbrInput = card.querySelector(".col-abbr");
    const bgInput = card.querySelector(".col-bg");
    const allowIntCb = card.querySelector(".col-allowint");
    const allowStrCb = card.querySelector(".col-allowstr");
    const intMinInput = card.querySelector(".col-intmin");
    const intMaxInput = card.querySelector(".col-intmax");
    const strOptsInput = card.querySelector(".col-stropts");
    const tabSelect = card.querySelector(".col-tab");
    const useStartDilSelect = card.querySelector(".col-use-start-dil");
    const showWhenSelect = card.querySelector(".col-show-when-prescribing");

    const autoFillValueInput = card.querySelector(".col-autofill-value");
    const overwriteSelect = card.querySelector(".col-autofill-overwrite-mode");
    const controlModeSelect = card.querySelector(".col-autofill-control-mode");


    const hasPositiveCb = card.querySelector(".col-has-positive");
    const positiveIntMinInput = card.querySelector(".col-positive-intmin");
    const positiveStrOptsInput = card.querySelector(".col-positive-stropts");

    if (idInput) idInput.value = preset.id || "";
    if (nameInput) nameInput.value = preset.name || "";
    if (abbrInput) abbrInput.value = preset.abbr || "";
    if (bgInput) bgInput.value = preset.backgroundColor || "#DDDDDD";

    if (allowIntCb) allowIntCb.checked = !!preset.allowInt;
    if (allowStrCb) allowStrCb.checked = !!preset.allowStr;

    if (intMinInput) {
        intMinInput.value =
            preset.intMin !== undefined && preset.intMin !== null ? preset.intMin : "";
    }
    if (intMaxInput) {
        intMaxInput.value =
            preset.intMax !== undefined && preset.intMax !== null ? preset.intMax : "";
    }

    if (strOptsInput) {
        strOptsInput.value = (preset.strOptions || []).join(", ");
    }

    if (tabSelect && preset.tabBehavior) {
        tabSelect.value = preset.tabBehavior;
    }

    if (useStartDilSelect) {
        useStartDilSelect.value = preset.useAsStartingDilution ? "yes" : "no";
    }

    if (showWhenSelect) {
        showWhenSelect.value = preset.showWhenPrescribing ? "yes" : "no";
    }


    if (autoFillValueInput) {
        autoFillValueInput.value =
            preset.autoFillValue !== undefined && preset.autoFillValue !== null
                ? preset.autoFillValue
                : "";
    }

    if (overwriteSelect) {
        overwriteSelect.value = preset.autoFillOverwrite ? "yes" : "no";
    }

    if (controlModeSelect) {
        let mode = "none";
        if (preset.autoFillSetNeg && preset.autoFillSetPos) {
            mode = "both";
        } else if (preset.autoFillSetNeg) {
            mode = "negative";
        } else if (preset.autoFillSetPos) {
            mode = "positive";
        }
        controlModeSelect.value = mode;
    }





    if (hasPositiveCb) {
        hasPositiveCb.checked = !!preset.hasPositive;
    }

    if (positiveIntMinInput) {
        positiveIntMinInput.value =
            preset.positiveIntMin !== undefined && preset.positiveIntMin !== null
                ? preset.positiveIntMin
                : "";
    }


    if (positiveStrOptsInput && preset.positiveStrOptions) {
        positiveStrOptsInput.value = preset.positiveStrOptions.join(", ");
    }

    const autofillEnabledCb = card.querySelector(".col-autofill-enabled");
    const autofillSettingsRow = card.querySelector(".autofill-settings");
    if (autofillEnabledCb && autofillSettingsRow) {
        const enable =
            (preset.autoFillValue !== undefined && preset.autoFillValue !== null && preset.autoFillValue !== "") ||
            preset.autoFillOverwrite ||
            preset.autoFillSetNeg ||
            preset.autoFillSetPos;

        autofillEnabledCb.checked = enable;
        autofillSettingsRow.style.display = enable ? "flex" : "none";
    }

    // --- sync new UI helpers ---

    // Sync value type dropdown + show/hide rows
    const valueTypeSelect = card.querySelector(".col-valuetype");
    const allowIntCb2 = card.querySelector(".col-allowint");
    const allowStrCb2 = card.querySelector(".col-allowstr");
    const intRow2 = card.querySelector(".int-config");
    const strRow2 = card.querySelector(".str-config");

    let vt = "both";
    if (allowIntCb2.checked && !allowStrCb2.checked) vt = "int";
    else if (!allowIntCb2.checked && allowStrCb2.checked) vt = "str";
    else vt = "both";

    if (valueTypeSelect) valueTypeSelect.value = vt;

    if (vt === "int") {
        intRow2.style.display = "flex";
        strRow2.style.display = "none";
    } else if (vt === "str") {
        intRow2.style.display = "none";
        strRow2.style.display = "flex";
    } else {
        intRow2.style.display = "flex";
        strRow2.style.display = "flex";
    }

    // Sync positive row visibility
    const hasPositiveCb2 = card.querySelector(".col-has-positive");
    const positiveRow2 = card.querySelector(".positive-config");
    if (positiveRow2) {
        positiveRow2.style.display = hasPositiveCb2 && hasPositiveCb2.checked ? "flex" : "none";
    }

}

function sanitizeForFunctionName(text) {
    return (text || "").replace(/[^A-Za-z0-9]+/g, "");
}





function getColumnOptionsHtml() {
    const cards = columnsContainer.querySelectorAll(".column-card");
    let opts = '<option value="">-- Select column --</option>';

    cards.forEach((card, idx) => {
        const idVal = card.querySelector(".col-id").value.trim();
        const nameVal = card.querySelector(".col-name").value.trim();
        const label = idVal || nameVal || `Column ${idx + 1}`;
        const value = idVal || nameVal;

        if (value) {
            const safeValue = escapeHtml(value);
            const safeLabel = escapeHtml(label);
            opts += `<option value="${safeValue}">${safeLabel}</option>`;
        }
    });

    return opts;
}



function refreshScoringColumnDropdowns() {
    if (!scoringContainer) return;

    const optionsHtml = getColumnOptionsHtml();

    function refreshSelect(select) {
        if (!select) return;

        const current = select.value;         // remember what was selected
        select.innerHTML = optionsHtml;       // rebuild <option> list

        if (current) {
            const hasOption = Array.from(select.options).some(
                (opt) => opt.value === current
            );
            if (hasOption) {
                select.value = current;           // restore selection if still valid
            }
        }
    }

    const triggerSelects = scoringContainer.querySelectorAll(".score-trigger-col");
    const condSelects = scoringContainer.querySelectorAll(".score-cond-col");
    const updateSelects = scoringContainer.querySelectorAll(".score-update-col");

    triggerSelects.forEach(refreshSelect);
    condSelects.forEach(refreshSelect);
    updateSelects.forEach(refreshSelect);
}




// -----------------------------
// Apply protocol-level template
// -----------------------------
function applyTemplate() {
    const templateSelect = document.getElementById("templateSelect");
    const key = templateSelect.value;
    if (!key) return;

    const tpl = templates[key];
    if (!tpl) return;

    // Set protocol id/version if you still have these inputs
    const protoIdEl = document.getElementById("protocolId");
    const verEl = document.getElementById("versionNumber");
    if (protoIdEl) protoIdEl.value = tpl.protocol_id;
    if (verEl) verEl.value = tpl.version_number;

    // Build column cards based on template length
    const cols = tpl.columns || [];
    columnCountInput.value = cols.length;
    buildColumns();

    const cards = columnsContainer.querySelectorAll(".column-card");

    cols.forEach((col, i) => {
        const card = cards[i];
        if (!card) return;

        // ----- basic identity -----
        card.querySelector(".col-id").value = col.id || "";
        card.querySelector(".col-name").value = col.name || "";
        card.querySelector(".col-abbr").value = col.abbr || "";

        const bgSel = card.querySelector(".col-bg");
        if (bgSel) bgSel.value = col.backgroundColor || "#FFFFFF";

        // ----- derive allowInt / allowStr / ranges / string options -----
        let allowInt = col.allowInt;
        let allowStr = col.allowStr;

        if (allowInt === undefined || allowStr === undefined) {
            const ints = (col.possibleValues || []).find(v => v.type === "integer");
            const strs = (col.possibleValues || []).find(v => v.type === "string");
            allowInt = allowInt ?? !!ints;
            allowStr = allowStr ?? !!strs;
            col.intMin = col.intMin ?? (ints ? ints.min : null);
            col.intMax = col.intMax ?? (ints ? ints.max : null);
            col.strOptions = col.strOptions ?? (strs ? (strs.options || []) : []);
        }

        const intMinInput = card.querySelector(".col-intmin");
        const intMaxInput = card.querySelector(".col-intmax");
        if (intMinInput) intMinInput.value = col.intMin != null ? col.intMin : "";
        if (intMaxInput) intMaxInput.value = col.intMax != null ? col.intMax : "";

        const strOptsInput = card.querySelector(".col-stropts");
        if (strOptsInput) {
            const opts = col.strOptions || [];
            strOptsInput.value = opts.join(", ");
        }

        applyValueTypeToCard(card, allowInt, allowStr);

        // ----- tab behavior -----
        const tabSelect = card.querySelector(".col-tab");
        if (tabSelect) {
            tabSelect.value = col.tabBehavior || "nextColumn";
        }

        // ----- show when prescribing / starting dilution -----
        const showWhenSelect = card.querySelector(".col-show-when-prescribing");
        if (showWhenSelect) {
            showWhenSelect.value = col.showWhenPrescribing ? "yes" : "no";
        }

        const startDilSelect = card.querySelector(".col-use-start-dil");
        if (startDilSelect) {
            startDilSelect.value = col.useAsStartingDilution ? "yes" : "no";
        }

        // ----- autofill -----
        const auto = col.autoFill || {};
        const afVal = card.querySelector(".col-autofill-value");
        const overwriteSelect = card.querySelector(".col-autofill-overwrite-mode");
        const controlModeSelect = card.querySelector(".col-autofill-control-mode");

        if (afVal) {
            if (auto.value === null || auto.value === undefined) {
                afVal.value = "";
            } else {
                afVal.value = String(auto.value);
            }
        }

        if (overwriteSelect) {
            overwriteSelect.value = auto.overwrite ? "yes" : "no";
        }

        if (controlModeSelect) {
            let mode = "none";
            if (auto.setNegativeControl && auto.setPositiveControl) {
                mode = "both";
            } else if (auto.setNegativeControl) {
                mode = "negative";
            } else if (auto.setPositiveControl) {
                mode = "positive";
            }
            controlModeSelect.value = mode;
        }

        const autofillEnabledCb = card.querySelector(".col-autofill-enabled");
        const autofillSettingsRow = card.querySelector(".autofill-settings");
        if (autofillEnabledCb && autofillSettingsRow) {
            const enable =
                (auto && auto.value !== undefined && auto.value !== null && String(auto.value) !== "") ||
                auto.overwrite ||
                auto.setNegativeControl ||
                auto.setPositiveControl;

            autofillEnabledCb.checked = enable;
            autofillSettingsRow.style.display = enable ? "flex" : "none";
        }

        // ----- positiveValues -----
        const posVals = col.positiveValues || [];
        const hasPositive = posVals.length > 0;

        const hasPositiveCb = card.querySelector(".col-has-positive");
        const positiveRow = card.querySelector(".positive-config");
        if (hasPositiveCb) {
            hasPositiveCb.checked = hasPositive;
        }
        if (positiveRow) {
            positiveRow.style.display = hasPositive ? "flex" : "none";
        }

        const posInt = posVals.find(v => v.type === "integer");
        const posStr = posVals.find(v => v.type === "string");

        const posIntMin = card.querySelector(".col-positive-intmin");
        const posStrOpts = card.querySelector(".col-positive-stropts");

        if (posInt && posIntMin) posIntMin.value = posInt.min != null ? posInt.min : "";
        if (posStr && posStrOpts) posStrOpts.value = (posStr.options || []).join(", ");
    });
}


function applyValueTypeToCard(card, allowInt, allowStr) {
    const valueTypeSelect = card.querySelector(".col-valuetype");
    const allowIntCb = card.querySelector(".col-allowint");
    const allowStrCb = card.querySelector(".col-allowstr");
    const intRow = card.querySelector(".int-config");
    const strRow = card.querySelector(".str-config");

    let vt = "both";
    if (allowInt && !allowStr) vt = "int";
    else if (!allowInt && allowStr) vt = "str";

    if (valueTypeSelect) valueTypeSelect.value = vt;

    if (allowIntCb) allowIntCb.checked = !!allowInt;
    if (allowStrCb) allowStrCb.checked = !!allowStr;

    if (!intRow || !strRow) return;

    if (vt === "int") {
        intRow.style.display = "flex";
        strRow.style.display = "none";
    } else if (vt === "str") {
        intRow.style.display = "none";
        strRow.style.display = "flex";
    } else {
        intRow.style.display = "flex";
        strRow.style.display = "flex";
    }
}

function applyProtocolToUI(protocol) {
    const cols = protocol.columns || [];

    // 1) Rebuild the column cards
    columnCountInput.value = cols.length || 0;
    buildColumns();

    const cards = columnsContainer.querySelectorAll(".column-card");

    cols.forEach((col, i) => {
        const card = cards[i];
        if (!card) return;

        // ----- basic identity -----
        card.querySelector(".col-id").value = col.id || "";
        card.querySelector(".col-name").value = col.name || "";
        card.querySelector(".col-abbr").value = col.abbr || "";

        const bgSel = card.querySelector(".col-bg");
        if (bgSel) bgSel.value = col.backgroundColor || "#FFFFFF";

        // ----- value type + ranges/options -----
        // derive allowInt/allowStr if missing (for old saves)
        let allowInt = col.allowInt;
        let allowStr = col.allowStr;

        if (allowInt === undefined || allowStr === undefined) {
            const ints = (col.possibleValues || []).find(v => v.type === "integer");
            const strs = (col.possibleValues || []).find(v => v.type === "string");
            allowInt = allowInt ?? !!ints;
            allowStr = allowStr ?? !!strs;
            col.intMin = col.intMin ?? (ints ? ints.min : null);
            col.intMax = col.intMax ?? (ints ? ints.max : null);
            col.strOptions = col.strOptions ?? (strs ? (strs.options || []) : []);
        }

        const intMinInput = card.querySelector(".col-intmin");
        const intMaxInput = card.querySelector(".col-intmax");
        if (intMinInput) intMinInput.value = col.intMin != null ? col.intMin : "";
        if (intMaxInput) intMaxInput.value = col.intMax != null ? col.intMax : "";

        const strOptsInput = card.querySelector(".col-stropts");
        if (strOptsInput) {
            const opts = col.strOptions || [];
            strOptsInput.value = opts.join(", ");
        }

        applyValueTypeToCard(card, allowInt, allowStr);

        // ----- tab behavior -----
        const tabSelect = card.querySelector(".col-tab");
        if (tabSelect) {
            tabSelect.value = col.tabBehavior || "nextColumn";
        }

        // ----- show when prescribing / starting dilution -----
        const showWhenSelect = card.querySelector(".col-show-when-prescribing");
        if (showWhenSelect) {
            showWhenSelect.value = col.showWhenPrescribing ? "yes" : "no";
        }

        const startDilSelect = card.querySelector(".col-use-start-dil");
        if (startDilSelect) {
            startDilSelect.value = col.useAsStartingDilution ? "yes" : "no";
        }



        // ----- autofill -----
        const auto = col.autoFill || {};
        const afVal = card.querySelector(".col-autofill-value");
        const overwriteSelect = card.querySelector(".col-autofill-overwrite-mode");
        const controlModeSelect = card.querySelector(".col-autofill-control-mode");

        if (afVal) {
            if (auto.value === null || auto.value === undefined) {
                afVal.value = "";
            } else {
                afVal.value = String(auto.value);
            }
        }

        if (overwriteSelect) {
            overwriteSelect.value = auto.overwrite ? "yes" : "no";
        }

        if (controlModeSelect) {
            let mode = "none";
            if (auto.setNegativeControl && auto.setPositiveControl) {
                mode = "both";
            } else if (auto.setNegativeControl) {
                mode = "negative";
            } else if (auto.setPositiveControl) {
                mode = "positive";
            }
            controlModeSelect.value = mode;
        }

        const autofillEnabledCb = card.querySelector(".col-autofill-enabled");
        const autofillSettingsRow = card.querySelector(".autofill-settings");
        if (autofillEnabledCb && autofillSettingsRow) {
            const enable =
                (auto && auto.value !== undefined && auto.value !== null && String(auto.value) !== "") ||
                auto.overwrite ||
                auto.setNegativeControl ||
                auto.setPositiveControl;

            autofillEnabledCb.checked = enable;
            autofillSettingsRow.style.display = enable ? "flex" : "none";
        }


        // ----- positiveValues -----
        const posVals = col.positiveValues || [];
        const hasPositive = posVals.length > 0;

        const hasPositiveCb = card.querySelector(".col-has-positive");
        const positiveRow = card.querySelector(".positive-config");
        if (hasPositiveCb) {
            hasPositiveCb.checked = hasPositive;
        }
        if (positiveRow) {
            positiveRow.style.display = hasPositive ? "flex" : "none";
        }

        const posInt = posVals.find(v => v.type === "integer");
        const posStr = posVals.find(v => v.type === "string");

        const posIntMin = card.querySelector(".col-positive-intmin");
        const posStrOpts = card.querySelector(".col-positive-stropts");

        if (posInt && posIntMin) {
            posIntMin.value = posInt.min != null ? posInt.min : "";
        }

        if (posStr && posStrOpts) {
            posStrOpts.value = (posStr.options || []).join(", ");
        }

    });

    // 2) Scoring UI from scoringConfigs (if present)
    if (scoringContainer) {
        scoringContainer.innerHTML = "";
        if (Array.isArray(protocol.scoringConfigs)) {
            applyScoringConfigsToUI(protocol.scoringConfigs);
        }
    }

}

function setSelectValueCaseInsensitive(select, value) {
    if (!select) return;

    if (value == null || value === "") {
        select.value = "";
        return;
    }

    const desired = String(value).trim();

    // 1) Try exact match first
    select.value = desired;
    if (select.value === desired) {
        return;
    }

    const lower = desired.toLowerCase();
    const norm = lower.replace(/[^a-z0-9]/g, ""); // strip spaces/punctuation

    const opts = Array.from(select.options || []);

    // 2) Case-insensitive direct match on option value
    let match = opts.find(
        (o) => String(o.value).toLowerCase() === lower
    );

    // 3) Normalized match: "ID Conc" → "idconc", "IDConc" → "idconc"
    if (!match && norm) {
        match = opts.find((o) => {
            const valNorm = String(o.value || "")
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "");
            return valNorm === norm;
        });
    }

    if (match) {
        select.value = match.value;
    }
    // If still nothing, we just leave it at the default (usually "")
}



function applyScoringConfigsToUI(scoringConfigs) {
    if (!scoringContainer) return;

    // 🔹 If there are saved configs, make sure the footer is visible
    if (scoringFooterRow) {
        scoringFooterRow.style.display = scoringConfigs && scoringConfigs.length ? "flex" : "none";
    }

    scoringConfigs.forEach((cfg) => {
        const card = createScoringCard(scoringContainer.children.length);
        scoringContainer.appendChild(card);

        const triggerSel = card.querySelector(".score-trigger-col");
        const scopeSel = card.querySelector(".score-scope");
        const requireControlsSel = card.querySelector(".score-require-controls");

        setSelectValueCaseInsensitive(triggerSel, cfg.triggerColumn || "");
        if (scopeSel) scopeSel.value = cfg.scope || "neither";


        if (requireControlsSel) {
            let mode = "none";
            const reqNeg = !!cfg.requireNegative;
            const reqPos = !!cfg.requirePositive;
            if (reqNeg && reqPos) mode = "both";
            else if (reqNeg) mode = "negative";
            else if (reqPos) mode = "positive";
            requireControlsSel.value = mode;
        }

        const rules = cfg.rules || [];
        if (!rules.length) return;

        // card starts with 1 scoring rule row; add more if needed
        const addBtn = card.querySelector(".add-score-row-btn");
        for (let i = 1; i < rules.length; i++) {
            if (addBtn) addBtn.click();
        }

        const rowEls = card.querySelectorAll(".score-rule-row");
        rules.forEach((r, idx) => {
            const row = rowEls[idx];
            if (!row) return;

            // ----- Conditions -----
            const conditions = r.conditions || [];
            // We already have one condition row; add more if needed
            let condRows = row.querySelectorAll(".score-condition-row");
            if (condRows.length < conditions.length) {
                const addCond = row._addConditionRow;
                if (typeof addCond === "function") {
                    for (let i = condRows.length; i < conditions.length; i++) {
                        addCond();
                    }
                    condRows = row.querySelectorAll(".score-condition-row");
                }
            }

            conditions.forEach((c, cIdx) => {
                const cRow = condRows[cIdx];
                if (!cRow) return;
                const colSel = cRow.querySelector(".score-cond-col");
                const opSel = cRow.querySelector(".score-op");
                const threshInput = cRow.querySelector(".score-thresh");
                const baseSel = cRow.querySelector(".score-thresh-base");

                // 🔹 Case-insensitive column match (fixes Id / Idconc / EP, etc.)
                setSelectValueCaseInsensitive(colSel, c.col || "");

                // 🔹 Normalize operator: "=" → "==" so it matches the dropdown
                if (opSel) {
                    let op = c.op || "always";
                    if (op === "=") op = "==";
                    opSel.value = op;
                }

                if (threshInput) threshInput.value = c.thresh || "";
                if (baseSel) baseSel.value = c.base || "zero";

            });

            // ----- Updates -----
            const updates = r.updates || [];
            if (!updates.length) return;

            let updateRows = row.querySelectorAll(".score-update-row");
            if (updateRows.length < updates.length) {
                const addUpdate = row._addUpdateRow;
                if (typeof addUpdate === "function") {
                    for (let i = updateRows.length; i < updates.length; i++) {
                        addUpdate();
                    }
                    updateRows = row.querySelectorAll(".score-update-row");
                }
            }

            updates.forEach((u, uIdx) => {
                const uRow = updateRows[uIdx];
                if (!uRow) return;

                const colSel = uRow.querySelector(".score-update-col");
                const valInput = uRow.querySelector(".score-update-val");

                // 🔹 Case-insensitive match for update column, e.g. Idconc / Id / Ep
                setSelectValueCaseInsensitive(colSel, u.col || "");

                if (valInput) valInput.value = u.val || "";

            });
        });
    });
}




// -----------------------------
// Generate final protocol JSON
// -----------------------------
function generateJson() {
    const protocolId = 0;        // or 57 or whatever default you like
    const versionNumber = 1;     // or 1 by default

    const cards = columnsContainer.querySelectorAll(".column-card");
    const columns = [];
    const calculationRules = [];

    // NEW: track column metadata & uniqueness for validation
    const columnMetaById = {};
    const usedIds = new Set();
    const usedNames = new Set();
    let hasError = false;

    // -----------------------------
    // Build columns + basic calc rules
    // -----------------------------
    for (const card of cards) {
        const idRaw = card.querySelector(".col-id").value.trim();
        const nameRaw = card.querySelector(".col-name").value.trim();
        const abbrRaw = card.querySelector(".col-abbr").value.trim();
        const bg = card.querySelector(".col-bg").value.trim() || "#DDDDDD";
        const allowInt = card.querySelector(".col-allowint").checked;
        const allowStr = card.querySelector(".col-allowstr").checked;

        // 🔹 Prevent duplicate IDs
        if (idRaw) {
            if (usedIds.has(idRaw)) {
                alert(`Duplicate column id '${idRaw}'. Column IDs must be unique.`);
                hasError = true;
                break;
            }
            usedIds.add(idRaw);
        }

        // 🔹 Prevent duplicate Names
        if (nameRaw) {
            if (usedNames.has(nameRaw)) {
                alert(`Duplicate column name '${nameRaw}'. Column names must be unique.`);
                hasError = true;
                break;
            }
            usedNames.add(nameRaw);
        }

        const intMaxVal = card.querySelector(".col-intmax").value;
        const intMin = 0;
        const intMax = intMaxVal !== "" ? parseInt(intMaxVal, 10) : null;

        const strRaw = card.querySelector(".col-stropts").value;
        const strOptions = strRaw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

        const tabBehaviorSelect = card.querySelector(".col-tab");
        const tabBehavior = tabBehaviorSelect ? tabBehaviorSelect.value : "nextColumn";

        const useStartDilSelect = card.querySelector(".col-use-start-dil");
        const useStartDil =
            useStartDilSelect && useStartDilSelect.value === "yes";

        const showWhenSelect = card.querySelector(".col-show-when-prescribing");
        const showWhen =
            showWhenSelect && showWhenSelect.value === "yes";

        const autoFillValueRaw = card.querySelector(".col-autofill-value").value;

        const overwriteSelect = card.querySelector(".col-autofill-overwrite-mode");
        const controlModeSelect = card.querySelector(".col-autofill-control-mode");

        const autoFillOverwrite =
            overwriteSelect && overwriteSelect.value === "yes";

        let autoFillNeg = false;
        let autoFillPos = false;
        if (controlModeSelect) {
            const mode = controlModeSelect.value;
            if (mode === "negative") {
                autoFillNeg = true;
            } else if (mode === "positive") {
                autoFillPos = true;
            } else if (mode === "both") {
                autoFillNeg = true;
                autoFillPos = true;
            }
        }

        const hasPositive = card.querySelector(".col-has-positive").checked;
        const positiveIntMinVal = card.querySelector(".col-positive-intmin").value;
        const positiveStrRaw = card.querySelector(".col-positive-stropts").value;

        const positiveIntMin =
            positiveIntMinVal !== "" ? parseInt(positiveIntMinVal, 10) : null;

        const positiveStrOptions = positiveStrRaw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

        const possibleValues = [];

        if (allowInt && intMin != null && intMax != null) {
            possibleValues.push({
                type: "integer",
                min: intMin,
                max: intMax
            });
        }

        if (allowStr && strOptions.length > 0) {
            possibleValues.push({
                type: "string",
                options: strOptions
            });
        }

        const columnId = idRaw || nameRaw || `col_${columns.length + 1}`;
        const columnName = nameRaw || idRaw || `Column ${columns.length + 1}`;
        const columnAbbr =
            abbrRaw || (nameRaw ? nameRaw[0].toUpperCase() : `C${columns.length + 1}`);

        const columnObj = {
            id: columnId,
            name: columnName,
            abbr: columnAbbr,
            backgroundColor: bg,
            possibleValues: possibleValues,

            // extra hints so we can rebuild the UI later
            allowInt: allowInt,
            allowStr: allowStr,
            intMin: intMin,
            intMax: intMax,
            strOptions: strOptions,
            tabBehavior: tabBehavior
        };

        if (showWhen) {
            columnObj.showWhenPrescribing = true;
        }

        // autoFill: include if value or any flag is set
        const hasAutoFillValue = autoFillValueRaw !== "";
        const hasAnyAutoFillFlag = autoFillOverwrite || autoFillNeg || autoFillPos;
        const autofillEnabledEl = card.querySelector(".col-autofill-enabled");
        const autofillEnabled = autofillEnabledEl && autofillEnabledEl.checked;

        if (autofillEnabled && (hasAutoFillValue || hasAnyAutoFillFlag)) {
            let autoFillValue = autoFillValueRaw;
            if (/^-?\d+$/.test(autoFillValueRaw)) {
                autoFillValue = parseInt(autoFillValueRaw, 10);
            }

            columnObj.autoFill = {
                value: autoFillValue,
                overwrite: autoFillOverwrite,
                setNegativeControl: autoFillNeg,
                setPositiveControl: autoFillPos
            };
        }

        if (useStartDil) {
            columnObj.useAsStartingDilution = true;
        }

        if (hasPositive) {
            const positiveValues = [];

            if (positiveIntMin != null) {
                positiveValues.push({
                    type: "integer",
                    min: positiveIntMin
                });
            }

            if (positiveStrOptions.length > 0) {
                positiveValues.push({
                    type: "string",
                    options: positiveStrOptions
                });
            }

            if (positiveValues.length > 0) {
                columnObj.positiveValues = positiveValues;
            }
        }

        // 🔹 Store metadata for scoring validation – use same key scoring dropdowns use
        const scoringKey = idRaw || nameRaw;
        if (scoringKey) {
            columnMetaById[scoringKey] = {
                allowInt,
                allowStr,
                intMin,
                intMax,
                strOptions
            };
        }

        columns.push(columnObj);

        // ---- calculationRules (tab behavior -> setFocus) ----
        let relativeRows = 0;
        let relativeColumns = 0;

        if (tabBehavior === "nextRow") {
            relativeRows = 1;
            relativeColumns = 0;
        } else if (tabBehavior === "nextRowPrevColumn") {
            relativeRows = 1;
            relativeColumns = -1;
        } else {
            // default: nextColumn
            relativeRows = 0;
            relativeColumns = 1;
        }

        const focusResult = { type: "setFocus" };
        if (relativeRows !== 0) focusResult.relativeRows = relativeRows;
        if (relativeColumns !== 0) focusResult.relativeColumns = relativeColumns;

        calculationRules.push({
            conditions: [
                {
                    type: "change",
                    columnIds: [columnId]
                }
            ],
            results: [focusResult]
        });
    }

    if (hasError) {
        return null;
    }

    // ---- namedFunctions (always at least autoFill) ----
    const namedFunctions = {
        autoFill: AUTO_FILL_FUNCTION
    };

    // UI-only meta we keep in DB but not in exported JSON
    const scoringConfigs = [];

    // Helper to validate scoring update values against the column's allowed values
    function assertValidUpdate(meta, colId, rawVal) {
        const trimmed = String(rawVal).trim();
        const { allowInt, allowStr, intMin, intMax, strOptions } = meta || {};

        // No meta? Skip strict validation.
        if (!meta) return true;

        const isInt = /^-?\d+$/.test(trimmed);

        if (isInt) {
            const v = parseInt(trimmed, 10);
            if (!allowInt) {
                alert(
                    `Invalid update value '${trimmed}' for column '${colId}'. ` +
                    `Allowed strings are: ${strOptions.join(", ")}. ` +
                    `To resolve, either add to the allowed values for the column or change your update value.`
                );
                return false;
            }
            if ((intMin != null && v < intMin) || (intMax != null && v > intMax)) {
                let rangeText = "";
                if (intMin != null && intMax != null) {
                    rangeText = `${intMin}–${intMax}`;
                } else if (intMin != null) {
                    rangeText = `${intMin}+`;
                } else if (intMax != null) {
                    rangeText = `≤ ${intMax}`;
                }
                alert(`Invalid update value '${trimmed}' for column '${colId}'. Allowed integer range is ${rangeText}. To resolve either add to the allowed values for the column or change your update value.`);
                return false;
            }
            return true;
        }

        // String path
        if (!allowStr) {
            alert(`Invalid update value '${trimmed}' for column '${colId}'. This column only allows numeric values. To resolve either add to the allowed values for the column or change your update value.`);
            return false;
        }

        if (Array.isArray(strOptions) && strOptions.length > 0 && !strOptions.includes(trimmed)) {
            alert(`Invalid update value '${trimmed}' for column '${colId}'. Allowed strings are: ${strOptions.join(", ")}. This column only allows numeric values. To resolve either add to the allowed values for the column or change your update value.`);
            return false;
        }

        return true;
    }

    // ---- scoring functions / rules (from scoring cards)
    if (scoringContainer) {
        const scoringCards = scoringContainer.querySelectorAll(".score-card");

        scoringCards.forEach((card) => {
            if (hasError) return;

            const triggerCol = (card.querySelector(".score-trigger-col")?.value || "").trim();
            if (!triggerCol) return;

            const scope = (card.querySelector(".score-scope")?.value || "neither").trim();

            // "Require Controls?" dropdown -> booleans
            const controlsMode =
                (card.querySelector(".score-require-controls")?.value || "none").trim();
            const requireNeg =
                controlsMode === "negative" || controlsMode === "both";
            const requirePos =
                controlsMode === "positive" || controlsMode === "both";

            const ruleRows = card.querySelectorAll(".score-rule-row");
            const rules = [];

            ruleRows.forEach((row) => {
                if (hasError) return;

                // collect updates from ALL .score-update-row children
                const updates = [];
                const seenUpdateCols = new Set();

                row.querySelectorAll(".score-update-row").forEach((uRow) => {
                    if (hasError) return;

                    const col = (uRow.querySelector(".score-update-col")?.value || "").trim();
                    const valEl = uRow.querySelector(".score-update-val");
                    const val = valEl ? valEl.value : "";

                    if (!col || val === "") return;

                    // 🔹 Prevent updating same column twice in a single scoring rule row
                    if (seenUpdateCols.has(col)) {
                        alert(
                            `In scoring trigger for column '${triggerCol}', one rule updates column '${col}' more than once. ` +
                            `Each scoring rule row can only update a given column once.`
                        );
                        hasError = true;
                        return;
                    }

                    // 🔹 Validate update value fits allowed values for that column
                    const meta = columnMetaById[col];
                    if (meta && !assertValidUpdate(meta, col, val)) {
                        hasError = true;
                        return;
                    }

                    updates.push({ col, val });
                    seenUpdateCols.add(col);
                });

                if (hasError) return;
                if (updates.length === 0) return;

                // collect all conditions for this rule (ANDed together)
                const conditions = [];
                row.querySelectorAll(".score-condition-row").forEach((cRow) => {
                    const col = (cRow.querySelector(".score-cond-col")?.value || "").trim();
                    const op = (cRow.querySelector(".score-op")?.value || "always").trim();
                    const thresh = (cRow.querySelector(".score-thresh")?.value || "").trim();
                    const base = (cRow.querySelector(".score-thresh-base")?.value || "zero").trim();

                    // if "always", treat as unconditional; otherwise require col+thresh
                    if (op === "always") {
                        conditions.push({ col: "", op: "always", thresh: "", base: "zero" });
                    } else if (col && thresh !== "") {
                        conditions.push({ col, op, thresh, base });
                    }
                });

                rules.push({ conditions, updates });
            });

            if (hasError) return;
            if (rules.length === 0) return;

            // Build function name: set{AllUpdatedCols}From{Trigger}
            const updatedNamesConcat = [];
            rules.forEach((r) => {
                r.updates.forEach((u) => {
                    const safe = sanitizeForFunctionName(u.col) || "Col";
                    if (!updatedNamesConcat.includes(safe)) {
                        updatedNamesConcat.push(safe);
                    }
                });
            });
            const triggerNameSan = sanitizeForFunctionName(triggerCol) || "Column";
            const fnName = `set${updatedNamesConcat.join("")}From${triggerNameSan}`;

            const lines = [];
            lines.push("var rowUpdates = {};");
            lines.push("");

            // Scope: score controls? positive / negative / neither
            if (scope === "negative") {
                lines.push("if (!committedItemIsNegativeReference) {");
                lines.push("  return { type: 'setValues', row: rowUpdates };");
                lines.push("}");
                lines.push("");
            } else if (scope === "positive") {
                lines.push("if (!committedItemIsPositiveReference) {");
                lines.push("  return { type: 'setValues', row: rowUpdates };");
                lines.push("}");
                lines.push("");
            } else if (scope === "neither") {
                lines.push("if (committedItemIsNegativeReference || committedItemIsPositiveReference) {");
                lines.push("  return { type: 'setValues', row: rowUpdates };");
                lines.push("}");
                lines.push("");
            }

            const trigEsc = triggerCol.replace(/'/g, "\\'");

            // Require negative control (presence + scored on trigger col)
            if (requireNeg) {
                lines.push("if (negativeReferenceRow === null) {");
                lines.push('  this.displayMessage("This set must contain a negative reference.");');
                lines.push(`  return { type: 'setValue', columnId: '${trigEsc}', value: null };`);
                lines.push("}");
                lines.push("");
                lines.push(
                    "if (!committedItemIsNegativeReference && (!negativeReferenceRow || negativeReferenceRow['" +
                    trigEsc +
                    "'] == null)) {"
                );
                lines.push('  this.displayMessage("You must first score the negative reference.");');
                lines.push(`  return { type: 'setValue', columnId: '${trigEsc}', value: null };`);
                lines.push("}");
                lines.push("");
            }

            // Require positive control (presence + scored on trigger col)
            if (requirePos) {
                lines.push(
                    "if (typeof positiveReferenceRow === 'undefined' || positiveReferenceRow === null) {"
                );
                lines.push('  this.displayMessage("This set must contain a positive reference.");');
                lines.push(`  return { type: 'setValue', columnId: '${trigEsc}', value: null };`);
                lines.push("}");
                lines.push("");
                lines.push(
                    "if (!committedItemIsPositiveReference && (!positiveReferenceRow || positiveReferenceRow['" +
                    trigEsc +
                    "'] == null)) {"
                );
                lines.push('  this.displayMessage("You must first score the positive reference.");');
                lines.push(`  return { type: 'setValue', columnId: '${trigEsc}', value: null };`);
                lines.push("}");
                lines.push("");
            }

            // Helper to build a single condition expression
            function buildConditionExpr(col, op, threshRaw, base) {
                if (!col || op === "always") return "true";

                const colEsc = col.replace(/'/g, "\\'");
                const tRaw = threshRaw;
                const isNumeric = /^-?\d+(\.\d+)?$/.test(tRaw);

                // String-style comparison (always strict === / !==)
                if (!isNumeric) {
                    const rhsStr = "'" + tRaw.replace(/'/g, "\\'") + "'";

                    // Upgrade == → === and != → !==
                    let strictOp = op;
                    if (op === "==" || op === "===") strictOp = "===";
                    if (op === "!=" || op === "!==") strictOp = "!==";

                    return `row['${colEsc}'] ${strictOp} ${rhsStr}`;
                }

                // Numeric with optional control base
                let rhsExpr;
                if (base === "negative") {
                    rhsExpr = `parseInt(negativeReferenceRow['${colEsc}'], 10) + ${tRaw}`;
                } else if (base === "positive") {
                    rhsExpr = `parseInt(positiveReferenceRow['${colEsc}'], 10) + ${tRaw}`;
                } else {
                    rhsExpr = tRaw;
                }

                return `row['${colEsc}'] ${op} ${rhsExpr}`;
            }

            // Build the chained if / else if branches
            rules.forEach((rule, idx) => {
                const condExprs = (rule.conditions || []).map((c) =>
                    buildConditionExpr(c.col, c.op, c.thresh, c.base)
                );

                // If no conditions, treat as "always"
                const fullCond = condExprs.length
                    ? condExprs.map((e) => `(${e})`).join(" && ")
                    : "true";

                const prefix = idx === 0 ? "if" : "else if";
                lines.push(`${prefix} (${fullCond}) {`);
                lines.push("  rowUpdates = {");
                rule.updates.forEach((u, i) => {
                    const key = u.col.replace(/'/g, "\\'");
                    const rawVal = u.val;
                    let valLiteral;
                    if (/^-?\d+(\.\d+)?$/.test(rawVal)) {
                        valLiteral = rawVal;
                    } else {
                        valLiteral = "'" + rawVal.replace(/'/g, "\\'") + "'";
                    }
                    const comma = i < rule.updates.length - 1 ? "," : "";
                    lines.push(`    '${key}': ${valLiteral}${comma}`);
                });
                lines.push("  };");
                lines.push("}");
                lines.push("");
            });

            lines.push("return { type: 'setValues', row: rowUpdates };");

            // Save this card's configuration in a structured way for DB/UI rebuild
            scoringConfigs.push({
                triggerColumn: triggerCol,
                scope,
                requireNegative: requireNeg,
                requirePositive: requirePos,
                rules: rules.map((r) => ({
                    conditions: r.conditions,
                    updates: r.updates
                }))
            });

            const fnBody = lines.join("\n");
            namedFunctions[fnName] = fnBody;

            calculationRules.push({
                conditions: [
                    {
                        type: "change",
                        columnIds: [triggerCol]
                    }
                ],
                results: [
                    {
                        type: "runCode",
                        functionName: fnName
                    }
                ]
            });
        });
    }

    if (hasError) {
        return null;
    }

    const fullProtocol = {
        protocol_id: protocolId,
        version_number: versionNumber,
        columns: columns,
        namedFunctions: namedFunctions,
        calculationRules: calculationRules,
        // UI-only meta (we keep this in DB but NOT in exported JSON):
        scoringConfigs: scoringConfigs
    };

    // What the user sees / copies for Xtract:
    const exportProtocol = stripUiMeta(fullProtocol);

    if (output) {
        output.value = JSON.stringify(exportProtocol, null, 2);
    }

    // So other functions (like saveCurrentProtocol) can reuse the built object
    return fullProtocol;
}


function findColumnCardByRef(ref, fallbackIdOrName) {
    if (!columnsContainer) return null;

    const cards = Array.from(columnsContainer.querySelectorAll(".column-card"));
    if (!cards.length) return null;

    const r = ref || {};

    // byIndex (0-based)
    if (
        typeof r.byIndex === "number" &&
        r.byIndex >= 0 &&
        r.byIndex < cards.length
    ) {
        return cards[r.byIndex];
    }

    // Raw target strings
    const targetIdRaw = (r.byId || fallbackIdOrName || "").trim();
    const targetNameRaw = (r.byName || fallbackIdOrName || "").trim();

    const targetIdLower = targetIdRaw.toLowerCase();
    const targetNameLower = targetNameRaw.toLowerCase();

    // ---------- 1) strict equality match (case-insensitive) ----------
    if (targetIdLower || targetNameLower) {
        const strictMatch = cards.find((card) => {
            const idVal = (card.querySelector(".col-id")?.value || "").trim();
            const nameVal = (card.querySelector(".col-name")?.value || "").trim();
            const idLower = idVal.toLowerCase();
            const nameLower = nameVal.toLowerCase();

            if (targetIdLower && idLower === targetIdLower) return true;
            if (targetNameLower && nameLower === targetNameLower) return true;
            return false;
        });

        if (strictMatch) return strictMatch;
    }

    // ---------- 2) presetKey match (e.g. "prick" → card.dataset.presetKey) ----------
    if (targetIdLower) {
        // If AI said byId:"Prick", also try matching presetKey:"prick"
        const presetMatch = cards.find((card) => {
            const presetKey = (card.dataset.presetKey || "").toLowerCase();
            return presetKey && presetKey === targetIdLower;
        });
        if (presetMatch) return presetMatch;
    }

    // ---------- 3) loose "contains" match on id or name ----------
    const targetLoose = targetIdLower || targetNameLower;
    if (targetLoose) {
        const looseMatch = cards.find((card) => {
            const idVal = (card.querySelector(".col-id")?.value || "").trim();
            const nameVal = (card.querySelector(".col-name")?.value || "").trim();
            const idLower = idVal.toLowerCase();
            const nameLower = nameVal.toLowerCase();

            if (idLower.includes(targetLoose)) return true;
            if (nameLower.includes(targetLoose)) return true;
            return false;
        });

        if (looseMatch) return looseMatch;
    }

    // Nothing matched
    return null;
}


function resolvePresetKeyFromSpec(spec) {
    if (!window.columnPresets) return null;
    const presets = window.columnPresets;

    // Accept either a string or an object (column spec)
    let raw =
        typeof spec === "string"
            ? spec
            : (spec && (spec.preset || spec.id || spec.name || spec.abbr)) || "";

    raw = (raw || "").trim();
    if (!raw) return null;

    const targetLower = raw.toLowerCase();

    // 1) Direct key match (case-sensitive)
    if (presets[raw]) return raw;

    // 2) Key match, case-insensitive
    for (const key of Object.keys(presets)) {
        if (key.toLowerCase() === targetLower) {
            return key;
        }
    }

    // 3) Match by column id/name/abbr inside the preset config (case-insensitive)
    for (const [key, cfg] of Object.entries(presets)) {
        const idLower = (cfg.id || "").toLowerCase();
        const nameLower = (cfg.name || "").toLowerCase();
        const abbrLower = (cfg.abbr || "").toLowerCase();

        if (idLower === targetLower || nameLower === targetLower || abbrLower === targetLower) {
            return key;
        }
    }

    // Nothing matched
    return null;
}

function ensureColumnsForScoringConfigs(scoringConfigs) {
    if (!columnsContainer || !Array.isArray(scoringConfigs)) return;

    // Track existing column ids/names in lowercase
    const existingKeys = new Set();
    const existingCards = columnsContainer.querySelectorAll(".column-card");

    existingCards.forEach((card) => {
        const idVal = (card.querySelector(".col-id")?.value || "").trim();
        const nameVal = (card.querySelector(".col-name")?.value || "").trim();
        if (idVal) existingKeys.add(idVal.toLowerCase());
        if (nameVal) existingKeys.add(nameVal.toLowerCase());
    });

    function ensureColumnForName(rawName) {
        if (!rawName) return;
        const name = String(rawName).trim();
        if (!name) return;

        const keyLower = name.toLowerCase();
        if (existingKeys.has(keyLower)) {
            return; // already have a column with this id or name
        }

        const index = columnsContainer.children.length;
        const card = createColumnCard(index);
        columnsContainer.appendChild(card);

        // Try to find a matching preset for this name ("Prick", "EP", etc.)
        const presetKey = resolvePresetKeyFromSpec(name);
        if (presetKey && window.columnPresets && window.columnPresets[presetKey]) {
            applyColumnPreset(card, presetKey);
            card.dataset.presetKey = presetKey;
        } else {
            // Fallback: just set id/name to the raw name
            const idEl = card.querySelector(".col-id");
            const nameEl = card.querySelector(".col-name");
            if (idEl) idEl.value = name;
            if (nameEl) nameEl.value = name;
        }

        existingKeys.add(keyLower);
    }

    // Walk the scoring configs and ensure every referenced column exists
    scoringConfigs.forEach((cfg) => {
        ensureColumnForName(cfg.triggerColumn);

        (cfg.rules || []).forEach((rule) => {
            (rule.conditions || []).forEach((c) => {
                ensureColumnForName(c.col);
            });
            (rule.updates || []).forEach((u) => {
                ensureColumnForName(u.col);
            });
        });
    });

    // Keep indices, move buttons, and dropdowns in sync
    renumberColumns();

    // Now that we have columns, allow adding more scoring triggers
    if (columnsContainer.children.length > 0) {
        if (addScoreFnBtn) addScoreFnBtn.disabled = false;
        if (addScoreFnBtnBottom) addScoreFnBtnBottom.disabled = false;
    }
}


function applyAiAddColumnAction(action) {
    if (!columnsContainer) return;

    const cards = Array.from(columnsContainer.querySelectorAll(".column-card"));
    const index = cards.length;

    // Determine where to insert the new column
    let insertIndex = index;
    if (action.position === "start") {
        insertIndex = 0;
    } else if (action.position === "before" || action.position === "after") {
        const refCard = findColumnCardByRef(action.target, action.targetId);
        if (refCard) {
            const currentIndex = cards.indexOf(refCard);
            if (currentIndex !== -1) {
                insertIndex = action.position === "before" ? currentIndex : currentIndex + 1;
            }
        }
    }

    const newCard = createColumnCard(insertIndex);

    if (insertIndex >= columnsContainer.children.length) {
        columnsContainer.appendChild(newCard);
    } else {
        columnsContainer.insertBefore(newCard, columnsContainer.children[insertIndex]);
    }

    // 1. Apply Preset (sets defaults like "Text Input", white bg, etc.)
    const presetKey = resolvePresetKeyFromSpec(action);
    if (presetKey && window.columnPresets && window.columnPresets[presetKey]) {
        applyColumnPreset(newCard, presetKey);
        newCard.dataset.presetKey = presetKey;
    }

    // 2. 🔹 NEW: Overlay custom name/ID from AI if provided
    // This overwrites the preset's default name (e.g. "Text Input" -> "Awesome")
    const idEl = newCard.querySelector(".col-id");
    const nameEl = newCard.querySelector(".col-name");
    const abbrEl = newCard.querySelector(".col-abbr");

    if (action.id !== undefined && idEl) idEl.value = action.id;
    if (action.name !== undefined && nameEl) nameEl.value = action.name;
    if (action.abbr !== undefined && abbrEl) abbrEl.value = action.abbr;

    // If AI gave a name but no ID, auto-fill ID to match name (common UX preference)
    if (action.name && (!action.id) && idEl && idEl.value === "Text") {
         idEl.value = action.name; 
    }

    renumberColumns();
}


function applyAiSetColumnsAction(action) {
    if (!columnsContainer) return;

    columnsContainer.innerHTML = "";
    const cols = Array.isArray(action.columns) ? action.columns : [];

    cols.forEach((c) => {
        const index = columnsContainer.children.length;
        const card = createColumnCard(index);
        columnsContainer.appendChild(card);

        // 🔹 Resolve preset key from this column spec (preset/id/name/abbr)
        const presetKey = resolvePresetKeyFromSpec(c);

        if (presetKey && window.columnPresets && window.columnPresets[presetKey]) {
            applyColumnPreset(card, presetKey);
            card.dataset.presetKey = presetKey;
        }
        // 🔸 If no match, leave the card blank and then overlay any direct field values

        // Overlay AI-specified id/name/abbr etc if present
        const idEl = card.querySelector(".col-id");
        const nameEl = card.querySelector(".col-name");
        const abbrEl = card.querySelector(".col-abbr");

        if (c.id !== undefined && idEl) idEl.value = c.id;
        if (c.name !== undefined && nameEl) nameEl.value = c.name;
        if (c.abbr !== undefined && abbrEl) abbrEl.value = c.abbr;
    });

    renumberColumns();
}


function applyAiApplyTemplateAction(action) {
    const key = action.templateKey;
    if (!key) return;

    const templateSelect = document.getElementById("templateSelect");
    if (!templateSelect) {
        console.warn("applyAiApplyTemplateAction: no templateSelect in DOM");
        return;
    }

    // Set dropdown + reuse existing logic
    templateSelect.value = key;
    applyTemplate();
}

function applyAiSetScoringConfigsAction(action) {
    if (!scoringContainer) return;

    const configs = Array.isArray(action.scoringConfigs)
        ? action.scoringConfigs
        : [];

    //  Make sure columns (Prick, EP, etc.) exist before wiring scoring UI
    ensureColumnsForScoringConfigs(configs);

    scoringContainer.innerHTML = "";
    applyScoringConfigsToUI(configs);

    // Show footer if we have scoring rules
    if (scoringFooterRow) {
        scoringFooterRow.style.display = configs.length ? "flex" : "none";
    }
}


function applyAiUpdateColumnAction(action) {
    const { target, changes } = action;
    console.log("AI updateColumn changes:", changes);

    if (!target || !changes || typeof changes !== "object") {
        console.warn("AI updateColumn missing target/changes:", action);
        return;
    }
    if (!columnsContainer) return;


    // --- find the matching column card (byId, byName, or fallback targetId) ---
    const card = findColumnCardByRef(target, action.targetId || null);
    if (!card) {
        console.warn("AI updateColumn: no matching column for target:", action);
        return;
    }

    const idEl = card.querySelector(".col-id");
    const nameEl = card.querySelector(".col-name");
    const abbrEl = card.querySelector(".col-abbr");

    console.log("AI updateColumn action received:", action);

    // ---------- Basic identity (optional) ----------
    if (changes.id !== undefined && idEl) {
        idEl.value = changes.id;
    }
    if (changes.name !== undefined && nameEl) {
        nameEl.value = changes.name;
    }
    if (changes.abbr !== undefined && abbrEl) {
        abbrEl.value = changes.abbr;
    }

    // ---------- Value type / options ----------
    const allowIntCb = card.querySelector(".col-allowint");
    const allowStrCb = card.querySelector(".col-allowstr");
    const intMaxInput = card.querySelector(".col-intmax");
    const strOptsInput = card.querySelector(".col-stropts");
    const valueTypeSelect = card.querySelector(".col-valuetype");
    const intRow = card.querySelector(".int-config");
    const strRow = card.querySelector(".str-config");
    const tabSelect = card.querySelector(".col-tab");

    // Settings
    const useStartDilSelect = card.querySelector(".col-use-start-dil");
    const showWhenSelect = card.querySelector(".col-show-when-prescribing");

    // Autofill
    const autofillEnabledCb = card.querySelector(".col-autofill-enabled");

    const autofillValueInput = card.querySelector(".col-autofill-value");
    const autofillOverwriteSelect = card.querySelector(".col-autofill-overwrite-mode");
    const autofillControlModeSelect = card.querySelector(".col-autofill-control-mode");

    // Positive values
    const hasPositiveCb = card.querySelector(".col-has-positive");
    const positiveIntMinInput = card.querySelector(".col-positive-intmin");
    const positiveStrOptsInput = card.querySelector(".col-positive-stropts");



    // Start from current DOM state
    let allowInt = allowIntCb ? allowIntCb.checked : false;
    let allowStr = allowStrCb ? allowStrCb.checked : false;
    let intMax =
        intMaxInput && intMaxInput.value !== ""
            ? parseInt(intMaxInput.value, 10)
            : null;
    let strOptions =
        strOptsInput && strOptsInput.value
            ? strOptsInput.value
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s.length > 0)
            : [];
    let tabBehavior = tabSelect ? tabSelect.value : "nextColumn";

    let useAsStartingDilution =
        !!(useStartDilSelect && useStartDilSelect.value === "yes");
    let showWhenPrescribing =
        !!(showWhenSelect && showWhenSelect.value === "yes");

    let autofillEnabled = !!(autofillEnabledCb && autofillEnabledCb.checked);
    let autofillValue = autofillValueInput ? autofillValueInput.value : "";
    let autofillOverwrite =
        !!(autofillOverwriteSelect && autofillOverwriteSelect.value === "yes");
    let autofillControlMode =
        autofillControlModeSelect ? autofillControlModeSelect.value : "none";

    let hasPositive = !!(hasPositiveCb && hasPositiveCb.checked);
    let positiveIntMin =
        positiveIntMinInput && positiveIntMinInput.value !== ""
            ? parseInt(positiveIntMinInput.value, 10)
            : null;
    let positiveStrOptions =
        positiveStrOptsInput && positiveStrOptsInput.value
            ? normalizeStringList(
                positiveStrOptsInput.value
                    .split(",")
                    .map((s) => s.trim())
            )
            : [];



    function normalizeStringList(arr) {
        const seen = new Set();
        const out = [];
        (arr || []).forEach((v) => {
            if (v == null) return;
            const s = String(v).trim();
            if (!s) return;
            if (!seen.has(s)) {
                seen.add(s);
                out.push(s);
            }
        });
        return out;
    }

    // ---- Direct flags from changes ----
    if (typeof changes.allowInt === "boolean") {
        allowInt = changes.allowInt;
    }
    if (typeof changes.allowStr === "boolean") {
        allowStr = changes.allowStr;
    }

    if (changes.intMax !== undefined && changes.intMax !== null) {
        intMax = changes.intMax;
    }

    // ---- Direct string options from changes.strOptions ----
    if (Array.isArray(changes.strOptions)) {
        console.log("AI updateColumn: applying changes.strOptions =", changes.strOptions);
        allowStr = true;
        strOptions = normalizeStringList(changes.strOptions);
    }

    // ---- possibleValues (may override ranges / options) ----
    if (Array.isArray(changes.possibleValues)) {
        console.log("AI updateColumn: applying changes.possibleValues =", changes.possibleValues);

        let newAllowInt = false;
        let newAllowStr = false;
        let newIntMax = null;
        let newStrOptions = [];

        changes.possibleValues.forEach((pv) => {
            if (!pv || typeof pv !== "object") return;

            if (pv.type === "integer") {
                newAllowInt = true;
                if (pv.max != null) {
                    newIntMax = pv.max;
                }
            } else if (pv.type === "string" && Array.isArray(pv.options)) {
                newAllowStr = true;
                newStrOptions = normalizeStringList(pv.options);
            }
        });

        // Only override if something real was provided
        if (newAllowInt || newAllowStr) {
            allowInt = newAllowInt;
            allowStr = newAllowStr;
        }
        if (newIntMax !== null) {
            intMax = newIntMax;
        }
        if (newStrOptions.length > 0) {
            strOptions = newStrOptions;
        }
    }

    // ---- tabBehavior ----
    if (typeof changes.tabBehavior === "string") {
        tabBehavior = changes.tabBehavior;
    }

    // ---- useAsStartingDilution / showWhenPrescribing ----
    if (typeof changes.useAsStartingDilution === "boolean") {
        useAsStartingDilution = changes.useAsStartingDilution;
    }
    // lenient alias for AI typos
    if (typeof changes.useasstartingdilution === "boolean") {
        useAsStartingDilution = changes.useasstartingdilution;
    }

    if (typeof changes.showWhenPrescribing === "boolean") {
        showWhenPrescribing = changes.showWhenPrescribing;
    }
    // lenient alias for AI typo in prompt
    if (typeof changes.Showwhenpresciribing === "boolean") {
        showWhenPrescribing = changes.Showwhenpresciribing;
    }

    // ---- Autofill flags & values ----
    if (typeof changes.autoFillEnabled === "boolean") {
        autofillEnabled = changes.autoFillEnabled;
    }
    if (changes.autoFillValue !== undefined) {
        autofillValue =
            changes.autoFillValue == null ? "" : String(changes.autoFillValue);
    }
    if (typeof changes.autoFillOverwrite === "boolean") {
        autofillOverwrite = changes.autoFillOverwrite;
    }
    if (typeof changes.autoFillControlMode === "string") {
        autofillControlMode = changes.autoFillControlMode;
    }


    // Nested autoFill object (matches protocol JSON structure AND AI-friendly shape)
    // Special case: autoFill: null → fully disable autofill
    if (changes.autoFill === null) {
        autofillEnabled = false;
        autofillValue = "";
        autofillOverwrite = false;
        autofillControlMode = "none";
    } else if (changes.autoFill && typeof changes.autoFill === "object") {
        const af = changes.autoFill;

        // enabled: true/false
        if ("enabled" in af) {
            autofillEnabled = !!af.enabled;
        }

        // value: number or string
        if ("value" in af) {
            autofillValue = af.value == null ? "" : String(af.value);
        }

        // overwriteExisting (AI shape) or overwrite (protocol shape)
        if ("overwriteExisting" in af) {
            autofillOverwrite = !!af.overwriteExisting;
        } else if (typeof af.overwrite === "boolean") {
            autofillOverwrite = af.overwrite;
        }

        // ---- Control mode / controls behavior ----
        let controlMode = autofillControlMode || "none";

        // If AI says "doNotAutofillControls": true → force "none"
        if ("doNotAutofillControls" in af && af.doNotAutofillControls) {
            controlMode = "none";
        }

        // High-level AI synonyms
        if (af.onlyPositiveControls === true || af.onlyPositiveReferences === true) {
            // "autofill only positive controls"
            controlMode = "positive";
        }
        if (af.onlyIfNegativeControl === true || af.onlyIfNegativeReference === true) {
            // "autofill only negative controls"
            controlMode = "negative";
        }
        if (af.showControls === true || af.showReferences === true) {
            // "autofill controls" (both)
            controlMode = "both";
        }
        if ("controlsEnabled" in af) {
            // Old / generic wording: treat true as "both", false as "none"
            controlMode = af.controlsEnabled ? "both" : "none";
        }


        // Optional explicit controlMode from AI: "none" | "negative" | "positive" | "both"
        if (typeof af.controlMode === "string") {
            controlMode = af.controlMode;
        } else {
            // Fallback: protocol-style flags
            const neg = !!af.setNegativeControl;
            const pos = !!af.setPositiveControl;

            if (neg && pos) {
                controlMode = "both";
            } else if (neg) {
                controlMode = "negative";
            } else if (pos) {
                controlMode = "positive";
            } else if ("setNegativeControl" in af || "setPositiveControl" in af) {
                // explicitly turned both off
                controlMode = "none";
            }
        }

        autofillControlMode = controlMode;
    }




    // ---- Positive values ----
    if (typeof changes.hasPositive === "boolean") {
        hasPositive = changes.hasPositive;
    }
    if (typeof changes.positiveEnabled === "boolean") {
        hasPositive = changes.positiveEnabled;
    }

    if (changes.positiveIntMin !== undefined && changes.positiveIntMin !== null) {
        positiveIntMin = parseInt(changes.positiveIntMin, 10);
    }

    if (Array.isArray(changes.positiveStringOptions)) {
        positiveStrOptions = normalizeStringList(changes.positiveStringOptions);
    } else if (typeof changes.positiveStringOptions === "string") {
        positiveStrOptions = normalizeStringList(
            changes.positiveStringOptions.split(",")
        );
    }

    if (Array.isArray(changes.positiveValues)) {
        let newHasPos = false;
        let newIntMin = null;
        let newStrOpts = [];

        changes.positiveValues.forEach((pv) => {
            if (!pv || typeof pv !== "object") return;

            if (pv.type === "integer") {
                newHasPos = true;
                if (pv.min != null) {
                    newIntMin = pv.min;
                }
            } else if (pv.type === "string" && Array.isArray(pv.options)) {
                newHasPos = true;
                newStrOpts = normalizeStringList(pv.options);
            }
        });

        if (newHasPos) {
            hasPositive = true;
            if (newIntMin !== null) positiveIntMin = newIntMin;
            if (newStrOpts.length) positiveStrOptions = newStrOpts;
        }
    } else if (changes.positiveValues && typeof changes.positiveValues === "object") {
        // Handle nested positiveValues object from AI, e.g.:
        // {
        //   "enabled": true,
        //   "minInt": 11,
        //   "strOptions": ["30+"]
        // }
        const pv = changes.positiveValues;

        if ("enabled" in pv) {
            hasPositive = !!pv.enabled;
        }

        if ("minInt" in pv) {
            const v = pv.minInt;
            if (v === null || v === undefined || v === "") {
                positiveIntMin = null;
            } else {
                const parsed = parseInt(v, 10);
                positiveIntMin = Number.isNaN(parsed) ? null : parsed;
            }
        }

        if (Array.isArray(pv.strOptions)) {
            positiveStrOptions = normalizeStringList(pv.strOptions);
        }
    }



    // ---- tabBehavior ----
    if (typeof changes.tabBehavior === "string") {
        tabBehavior = changes.tabBehavior;
    }


    // ---- Push final state back into DOM ----
    if (allowIntCb) allowIntCb.checked = !!allowInt;
    if (allowStrCb) allowStrCb.checked = !!allowStr;

    if (intMaxInput) {
        intMaxInput.value = intMax != null ? String(intMax) : "";
    }

    if (strOptsInput) {
        if (allowStr && strOptions.length > 0) {
            strOptsInput.value = strOptions.join(", ");
        } else if (!allowStr) {
            // if strings not allowed, clear them
            strOptsInput.value = "";
        }
    }

    if (tabSelect && tabBehavior) {
        tabSelect.value = tabBehavior;
    }

    if (useStartDilSelect) {
        useStartDilSelect.value = useAsStartingDilution ? "yes" : "no";
    }

    if (showWhenSelect) {
        showWhenSelect.value = showWhenPrescribing ? "yes" : "no";
    }

    if (autofillEnabledCb) {
        autofillEnabledCb.checked = !!autofillEnabled;
    }
    if (autofillValueInput) {
        autofillValueInput.value = autofillValue;
    }
    if (autofillOverwriteSelect) {
        autofillOverwriteSelect.value = autofillOverwrite ? "yes" : "no";
    }
    if (autofillControlModeSelect) {
        autofillControlModeSelect.value = autofillControlMode;
    }
    const autofillSettingsRow = card.querySelector(".autofill-settings");
    if (autofillSettingsRow) {
        autofillSettingsRow.style.display = autofillEnabled ? "flex" : "none";
    }

    if (hasPositiveCb) {
        hasPositiveCb.checked = !!hasPositive;
    }
    const positiveRow = card.querySelector(".positive-config");
    if (positiveRow) {
        positiveRow.style.display = hasPositive ? "flex" : "none";
    }
    if (positiveIntMinInput) {
        positiveIntMinInput.value =
            positiveIntMin != null ? String(positiveIntMin) : "";
    }
    if (positiveStrOptsInput) {
        positiveStrOptsInput.value = positiveStrOptions.length
            ? positiveStrOptions.join(", ")
            : "";
    }



    // Update the "value type" dropdown and show/hide config rows
    if (valueTypeSelect) {
        let mode = "both";
        if (allowInt && !allowStr) mode = "int";
        else if (!allowInt && allowStr) mode = "str";
        valueTypeSelect.value = mode;
    }

    if (intRow) intRow.style.display = allowInt ? "flex" : "none";
    if (strRow) strRow.style.display = allowStr ? "flex" : "none";

    console.log("AI updateColumn: final DOM state for column:", {
        id: idEl ? idEl.value : "",
        name: nameEl ? nameEl.value : "",
        allowInt,
        allowStr,
        intMax,
        strOptions,
        tabBehavior,
        useAsStartingDilution,
        showWhenPrescribing,
        autofillEnabled,
        autofillValue,
        autofillOverwrite,
        autofillControlMode,
        hasPositive,
        positiveIntMin,
        positiveStrOptions
    });

}



function applyAiRemoveColumnAction(action) {
    if (!columnsContainer) return;
    const card = findColumnCardByRef(action.target, action.targetId);
    if (!card) {
        console.warn("AI removeColumn: no matching column for target:", action);
        return;
    }
    card.remove();
    renumberColumns();
}

function applyAiReorderColumnAction(action) {
    if (!columnsContainer) return;

    const cards = Array.from(columnsContainer.querySelectorAll(".column-card"));
    if (!cards.length) return;

    const card = findColumnCardByRef(action.target, action.targetId);
    if (!card) {
        console.warn("AI reorderColumn: no matching column for target:", action);
        return;
    }

    if (typeof action.newIndex !== "number") {
        console.warn("AI reorderColumn: missing newIndex:", action);
        return;
    }

    let newIndex = action.newIndex;
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= cards.length) newIndex = cards.length - 1;

    // Remove card and reinsert at newIndex
    columnsContainer.removeChild(card);
    const children = columnsContainer.children;

    if (newIndex >= children.length) {
        columnsContainer.appendChild(card);
    } else {
        columnsContainer.insertBefore(card, children[newIndex]);
    }

    renumberColumns();
}



function applyAiSetProtocolMetaAction(action) {
    // Name
    if (action.name && protocolNameInput) {
        protocolNameInput.value = action.name;
        lastLoadedName = action.name;
    }

    // Protocol id / record id
    if (action.protocolId != null) {
        lastProtocolId = action.protocolId;
    } else if (action.id != null) {
        lastProtocolId = action.id;
    }
}

function applyAiSaveProtocolAction(action) {
    // Optional: AI can rename and then save
    if (action.name && protocolNameInput) {
        protocolNameInput.value = action.name;
    }
    if (typeof saveCurrentProtocol === "function") {
        saveCurrentProtocol();
    } else {
        console.warn("AI saveProtocol: saveCurrentProtocol not available");
    }
}

function resolveProtocolOptionByName(rawName) {
    if (!savedProtocolsSelect) return null;

    const allOptions = Array.from(savedProtocolsSelect.options || []);
    // Ignore the placeholder like "-- choose saved protocol --"
    const options = allOptions.filter((opt) => opt.value && opt.value.trim() !== "");

    if (!rawName) return null;

    const target = String(rawName).trim();
    const targetLower = target.toLowerCase();

    // 1) Exact-ish match: option text equals the requested name (case-insensitive)
    let match = options.find((opt) => {
        const txt = (opt.textContent || "").trim();
        return txt.toLowerCase() === targetLower || opt.value === target;
    });
    if (match) return match;

    // 2) Token-based fuzzy match: "prickand protocol" → ["prickand","protocol"]
    const tokens = targetLower
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3); // ignore tiny words like "a", "to", "of"

    if (tokens.length) {
        match = options.find((opt) => {
            const txtLower = (opt.textContent || "").trim().toLowerCase();
            // Look for any token contained in the option label
            return tokens.some((t) => txtLower.includes(t));
        });
        if (match) return match;
    }

    // Nothing matched
    return null;
}

function applyAiLoadProtocolAction(action) {
    // Prefer loading by explicit id if provided
    if (action.id != null && typeof loadProtocolById === "function") {
        loadProtocolById(action.id);
        return;
    }

    // Fallback: try to load by name via savedProtocols dropdown
    if (action.name && savedProtocolsSelect && typeof loadSelectedProtocol === "function") {
        const match = resolveProtocolOptionByName(action.name);

        if (match) {
            savedProtocolsSelect.value = match.value;
            loadSelectedProtocol();
        } else {
            console.warn("AI loadProtocol: no saved protocol matching name:", action.name);
        }
    }
}




// -----------------------------
// Preconfigured column set helpers
// -----------------------------
function getDefaultPresetSet() {
    if (Array.isArray(window.defaultPresetOrder) && window.defaultPresetOrder.length > 0) {
        return window.defaultPresetOrder;
    }
    // Fallback hard-coded order
    return ["text_input", "score_input", "status", "result"];
}


function addPresetColumns() {
    if (!columnsContainer) return;

    const set = getDefaultPresetSet();
    set.forEach((presetKey) => {
        const index = columnsContainer.children.length;
        const card = createColumnCard(index);
        columnsContainer.appendChild(card);
        applyColumnPreset(card, presetKey);
        card.dataset.presetKey = presetKey;
    });

    renumberColumns();

    // Ensure scoring rules can be added once any column exists
    if (addScoreFnBtn) addScoreFnBtn.disabled = false;
    if (addScoreFnBtnBottom) addScoreFnBtnBottom.disabled = false;
}

function removePresetColumns() {
    if (!columnsContainer) return;

    const set = new Set(getDefaultPresetSet());
    const cards = Array.from(columnsContainer.querySelectorAll(".column-card"));

    cards.forEach((card) => {
        const presetKey = card.dataset.presetKey;
        const typeSelect = card.querySelector(".col-type");
        const selectVal = typeSelect ? typeSelect.value : "";

        // Remove if either dataset or dropdown says it's one of our presets
        if ((presetKey && set.has(presetKey)) || (!presetKey && selectVal && set.has(selectVal))) {
            card.remove();
        }
    });

    renumberColumns();
}

function applyAiActions(actions) {
    if (!Array.isArray(actions) || actions.length === 0) {
        alert("AI returned no changes to apply.");
        return;
    }

    let madeChange = false;

    actions.forEach((act) => {
        if (!act || typeof act !== "object" || !act.type) return;
        console.log(act);
        switch (act.type) {
            case "addColumn":
                applyAiAddColumnAction(act);
                madeChange = true;
                break;

            case "setColumns":
                applyAiSetColumnsAction(act);
                madeChange = true;
                break;

            case "applyTemplate":
                applyAiApplyTemplateAction(act);
                madeChange = true;
                break;

            case "setScoringConfigs":
                applyAiSetScoringConfigsAction(act);
                madeChange = true;
                break;

            case "updateColumn":
                applyAiUpdateColumnAction(act);
                madeChange = true;
                break;

            case "removeColumn":
                applyAiRemoveColumnAction(act);
                madeChange = true;
                break;

            case "reorderColumn":
                applyAiReorderColumnAction(act);
                madeChange = true;
                break;

            // (optional future hooks)
            case "setProtocolMeta":
                applyAiSetProtocolMetaAction(act);
                madeChange = true;
                break;

            case "saveProtocol":
                applyAiSaveProtocolAction(act);
                // saving doesn't change the current UI, so you *could* skip generateJson
                break;

            case "loadProtocol":
                applyAiLoadProtocolAction(act);
                madeChange = true;
                break;

            default:
                console.warn("Unknown AI action type:", act.type, act);
                break;
        }
    });

    if (madeChange) {
        generateJson();
    }
}