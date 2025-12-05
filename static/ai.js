// ai.js
console.log("ai.js loaded");

const aiPromptInput = document.getElementById("aiPrompt");
const aiApplyBtn = document.getElementById("aiApplyBtn");
const aiStatusEl = document.getElementById("aiStatus");



if (aiApplyBtn && aiPromptInput) {
  aiApplyBtn.addEventListener("click", async () => {
    const prompt = aiPromptInput.value.trim();
    if (!prompt) {
      alert("Tell the AI what to do, e.g. 'Add a Prick column'.");
      aiPromptInput.focus();
      return;
    }

    const fullProtocol = generateJson();
    if (!fullProtocol) return;

    aiStatusEl.textContent = "Talking to AI...";
    aiApplyBtn.disabled = true;

    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt, protocol: fullProtocol }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("AI suggest error:", res.status, text);
        alert("AI request failed (see console).");
        aiStatusEl.textContent = "AI error.";
        return;
      }

      const data = await res.json();
      console.log("AI raw response from /api/ai/suggest:", JSON.stringify(data, null, 2));
      applyAiActions(data.actions || []); // from builder.js

      aiStatusEl.textContent = "AI changes applied.";
    } catch (err) {
      console.error("AI suggest network error:", err);
      alert("AI request failed (network error).");
      aiStatusEl.textContent = "AI network error.";
    } finally {
      aiApplyBtn.disabled = false;
    }
  });
}
