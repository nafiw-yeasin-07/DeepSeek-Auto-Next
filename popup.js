const BUILTIN_PROMPTS_RAW = `Excellent work on chapter {prev}. Please write chapter {next}.

Nice work. Chapter {next}, please.

Great job. Let’s go with chapter {next}.

Well done. Please continue with chapter {next}.

Good chapter. Please do chapter {next}.

Awesome. Next is chapter {next}.

Solid work. Please write chapter {next}.

That was really good. Chapter {next} please.

Lovely. Please move to chapter {next}.

Fantastic. Please continue to chapter {next}.

Really nice. Please write chapter {next} next.

Great. Let’s continue with chapter {next}.

Good stuff. Please write chapter {next} now.

Excellent. Next up is chapter {next}.

Nice. Please do the next chapter, chapter {next}.

Very good. Please continue with chapter {next}.

Great chapter. Please proceed with chapter {next}.

Good work. Please write chapter {next} for me.

Amazing. Please go ahead with chapter {next}.

Well written. Please continue with chapter {next}.

Nicely done. Please write chapter {next}.

Brilliant. Chapter {next} please.

Good job. Please continue to chapter {next}.

Super good. Please write chapter {next}.

Really well done. Please do chapter {next}.

Nice one. Please write chapter {next}.

Excellent. Please continue with chapter {next}.

Great work. Please proceed to chapter {next}.

Good. Now chapter {next}, please.

Very nice. Please move on to chapter {next}.

Awesome work. Please continue with chapter {next}.

Great. Please write chapter {next}.

Nice. Next chapter is {next}.

Excellent. Please go to chapter {next}.

Good work. Please continue for chapter {next}.

Great job. Please do chapter {next} now.

Really nice work. Please write chapter {next}.

Perfect. Please continue into chapter {next}.

Lovely work. Please write chapter {next} please.

Excellent work again. Please write chapter {next}.`;

const DEFAULTS_SYNC = {
  promptsRaw: "",
  fallbackMessage: "Next chapter please.",
  quietMin: 3000,
  quietMax: 6000,
  gapMin: 9000,
  gapMax: 15000,
  jitterMin: 2000,
  jitterMax: 9000,
  stopAtEnd: true,

  totalChapters: 40,

  useMaxRuns: false,
  maxRuns: 39
};

const DEFAULTS_LOCAL = { cursor: 0 };

function qs(id) { return document.getElementById(id); }

function parsePrompts(raw) {
  const t = (raw || "").trim();
  if (!t) return [];
  return t.split(/\n\s*\n+/).map(s => s.trim()).filter(Boolean);
}

function getEffectivePrompts(raw) {
  const p = parsePrompts(raw);
  if (p.length) return p;
  return parsePrompts(BUILTIN_PROMPTS_RAW);
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function sendToContent(msg) {
  const tabId = await getActiveTabId();
  if (!tabId) return null;
  try { return await chrome.tabs.sendMessage(tabId, msg); }
  catch { return null; }
}

function clampInt(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normRange(minV, maxV, fallbackMin, fallbackMax) {
  let a = Number(minV), b = Number(maxV);
  if (!Number.isFinite(a)) a = fallbackMin;
  if (!Number.isFinite(b)) b = fallbackMax;
  if (a < 0) a = 0;
  if (b < 0) b = 0;
  if (a > b) [a, b] = [b, a];
  return [Math.floor(a), Math.floor(b)];
}

function syncChapterControls(value, max) {
  qs("chapterRange").max = String(max);
  qs("chapterNumber").max = String(max);

  const v = clampInt(value, 1, max);
  qs("chapterRange").value = String(v);
  qs("chapterNumber").value = String(v);
  qs("chapterHint").textContent = `Next chapter will be ${v}.`;
}

function syncTotalChaptersControls(value) {
  const v = clampInt(value, 1, 300);
  qs("totalChaptersRange").value = String(v);
  qs("totalChapters").value = String(v);
  qs("totalChaptersHint").textContent = `Total chapters set to ${v}.`;
}

function computeRemainingSends() {
  const total = clampInt(qs("totalChapters").value, 1, 300);
  const next = clampInt(qs("chapterNumber").value, 1, total);
  const remaining = Math.max(0, total - (next - 1));
  return { total, next, remaining };
}

function updateMaxRunsUI() {
  const useOverride = !!qs("useMaxRuns").checked;
  const maxRunsInput = qs("maxRuns");
  const row = qs("maxRunsRow");

  const { remaining } = computeRemainingSends();

  if (useOverride) {
    maxRunsInput.style.display = "block";
    row.style.gridTemplateColumns = "1fr 1fr";
    maxRunsInput.disabled = false;

    const v = clampInt(maxRunsInput.value, 1, 9999);
    maxRunsInput.value = String(v);
    qs("maxRunsHint").textContent = `Override max sends: ${v}`;
  } else {
    maxRunsInput.style.display = "none";
    row.style.gridTemplateColumns = "1fr";
    maxRunsInput.disabled = true;

    qs("maxRunsHint").textContent = `Auto sends: ${remaining}`;
  }
}

function recalcMaxFromTextbox() {
  const prompts = getEffectivePrompts(qs("promptsRaw").value);
  const maxByPrompts = Math.max(1, prompts.length || 1);

  const total = clampInt(qs("totalChapters").value, 1, 300);
  const max = Math.max(1, Math.min(maxByPrompts, total));

  const current = Number(qs("chapterNumber").value) || 1;
  syncChapterControls(current, max);

  updateMaxRunsUI();
}

async function saveSettings() {
  const [quietMin, quietMax] = normRange(
    qs("quietMin").value,
    qs("quietMax").value,
    DEFAULTS_SYNC.quietMin,
    DEFAULTS_SYNC.quietMax
  );

  const [gapMin, gapMax] = normRange(
    qs("gapMin").value,
    qs("gapMax").value,
    DEFAULTS_SYNC.gapMin,
    DEFAULTS_SYNC.gapMax
  );

  const [jitterMin, jitterMax] = normRange(
    qs("jitterMin").value,
    qs("jitterMax").value,
    DEFAULTS_SYNC.jitterMin,
    DEFAULTS_SYNC.jitterMax
  );

  const rawInput = qs("promptsRaw").value;
  const storeRaw = rawInput.trim() === "" ? "" : rawInput;

  const totalChapters = clampInt(qs("totalChapters").value, 1, 300);

  const useMaxRuns = !!qs("useMaxRuns").checked;
  const { remaining } = computeRemainingSends();

  const maxRuns = useMaxRuns
    ? clampInt(qs("maxRuns").value, 1, 9999)
    : Math.max(1, remaining);

  const cfg = {
    promptsRaw: storeRaw,
    fallbackMessage: qs("fallbackMessage").value.trim() || DEFAULTS_SYNC.fallbackMessage,

    quietMin, quietMax,
    gapMin, gapMax,
    jitterMin, jitterMax,

    stopAtEnd: !!qs("stopAtEnd").checked,

    totalChapters,

    useMaxRuns,
    maxRuns
  };

  await chrome.storage.sync.set(cfg);

  syncTotalChaptersControls(totalChapters);
  recalcMaxFromTextbox();
}

async function loadSettings() {
  const sync = await chrome.storage.sync.get(DEFAULTS_SYNC);
  const local = await chrome.storage.local.get(DEFAULTS_LOCAL);

  const storedRaw = (sync.promptsRaw || "").trim();
  qs("promptsRaw").value = storedRaw ? sync.promptsRaw : BUILTIN_PROMPTS_RAW;

  qs("fallbackMessage").value = sync.fallbackMessage;

  qs("quietMin").value = sync.quietMin;
  qs("quietMax").value = sync.quietMax;

  qs("gapMin").value = sync.gapMin;
  qs("gapMax").value = sync.gapMax;

  qs("jitterMin").value = sync.jitterMin;
  qs("jitterMax").value = sync.jitterMax;

  qs("stopAtEnd").checked = !!sync.stopAtEnd;

  syncTotalChaptersControls(sync.totalChapters);

  qs("useMaxRuns").checked = !!sync.useMaxRuns;
  qs("maxRuns").value = sync.maxRuns;

  const prompts = getEffectivePrompts(qs("promptsRaw").value);
  const maxByPrompts = Math.max(1, prompts.length || 1);
  const max = Math.max(1, Math.min(maxByPrompts, sync.totalChapters));

  const savedNext = Number(local.cursor || 0) + 1;
  syncChapterControls(savedNext, max);

  updateMaxRunsUI();
}

async function formatStatusLine(res) {
  const sync = await chrome.storage.sync.get(DEFAULTS_SYNC);

  const useOverride = !!sync.useMaxRuns;
  const cap = Number(sync.maxRuns) || 0;
  const capText = useOverride ? `cap ${cap} override` : `cap ${cap} auto`;

  const listCount = res.totalPrompts || 0;

  return `Status: ${res.running ? "RUNNING" : "STOPPED"} | sent ${res.sent} | next ${res.nextChapter} | ${capText} | prompt list ${listCount}`;
}

async function refreshStatus() {
  const res = await sendToContent({ type: "getStatus" });

  if (!res) {
    qs("status").textContent = "Status: open chat.deepseek.com tab";
    recalcMaxFromTextbox();
    return;
  }

  qs("status").textContent = await formatStatusLine(res);
  recalcMaxFromTextbox();
}

function wireChapterControls() {
  const onChange = async (value) => {
    recalcMaxFromTextbox();
    const max = Number(qs("chapterRange").max) || 1;
    const v = clampInt(value, 1, max);

    syncChapterControls(v, max);

    await chrome.storage.local.set({ cursor: v - 1 });
    await sendToContent({ type: "setCursor", startIndex: v });

    updateMaxRunsUI();
    await saveSettings();
  };

  qs("chapterRange").addEventListener("input", (e) => onChange(e.target.value));
  qs("chapterNumber").addEventListener("change", (e) => onChange(e.target.value));
}

function wireTotalChaptersControls() {
  const onChange = async (value) => {
    syncTotalChaptersControls(value);
    recalcMaxFromTextbox();
    await saveSettings();
  };

  qs("totalChaptersRange").addEventListener("input", (e) => onChange(e.target.value));
  qs("totalChapters").addEventListener("change", (e) => onChange(e.target.value));
}

function wireLiveSave() {
  let t = null;
  const debounce = () => {
    clearTimeout(t);
    t = setTimeout(() => saveSettings(), 350);
  };

  qs("promptsRaw").addEventListener("input", () => {
    recalcMaxFromTextbox();
    debounce();
  });

  qs("fallbackMessage").addEventListener("input", debounce);

  qs("quietMin").addEventListener("input", debounce);
  qs("quietMax").addEventListener("input", debounce);

  qs("gapMin").addEventListener("input", debounce);
  qs("gapMax").addEventListener("input", debounce);

  qs("jitterMin").addEventListener("input", debounce);
  qs("jitterMax").addEventListener("input", debounce);

  qs("stopAtEnd").addEventListener("change", debounce);

  qs("useMaxRuns").addEventListener("change", () => {
    updateMaxRunsUI();
    debounce();
  });

  qs("maxRuns").addEventListener("input", () => {
    updateMaxRunsUI();
    debounce();
  });
}

qs("start").addEventListener("click", async () => {
  await saveSettings();

  const prompts = getEffectivePrompts(qs("promptsRaw").value);
  const maxByPrompts = Math.max(1, prompts.length || 1);

  const totalChapters = clampInt(qs("totalChapters").value, 1, 300);
  const max = Math.max(1, Math.min(maxByPrompts, totalChapters));

  const startIndex = clampInt(qs("chapterNumber").value, 1, max);

  await chrome.storage.local.set({ cursor: startIndex - 1 });

  await sendToContent({ type: "start", startIndex });
  await refreshStatus();
});

qs("stop").addEventListener("click", async () => {
  await sendToContent({ type: "stop" });
  await refreshStatus();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "status") return;

  (async () => {
    qs("status").textContent = await formatStatusLine(msg);
  })();
});

(async () => {
  await loadSettings();
  wireTotalChaptersControls();
  wireChapterControls();
  wireLiveSave();
  recalcMaxFromTextbox();
  await refreshStatus();
})();
