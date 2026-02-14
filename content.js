(() => {
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
    maxRuns: 200,
    stopAtEnd: true
  };

  const DEFAULTS_LOCAL = { cursor: 0 };

  let running = false;
  let sent = 0;
  let lastChange = Date.now();
  let obs = null;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function randInt(min, max) {
    const a = Math.min(min, max);
    const b = Math.max(min, max);
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  function deepQueryAll(selector, root = document) {
    const out = [];
    const walk = (node) => {
      if (!node) return;
      try { if (node.querySelectorAll) out.push(...node.querySelectorAll(selector)); } catch {}
      const kids = node.children ? [...node.children] : [];
      for (const k of kids) walk(k);
      if (node.shadowRoot) walk(node.shadowRoot);
    };
    walk(root);
    return out;
  }

  function findTextarea() {
    const cands = deepQueryAll("textarea").filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 80 && r.height > 20 && !el.disabled;
    });
    return cands[0] || null;
  }

  function findSendButton() {
    let b = deepQueryAll('button[type="submit"]').find(x => !x.disabled);

    if (!b) {
      const iconBtns = deepQueryAll('button, div[role="button"]').filter(el => {
        const cls = (el.className || "").toString();
        return /ds-icon-button/i.test(cls);
      });
      b = iconBtns.reverse()[0] || null;
    }

    if (!b) {
      const btns = deepQueryAll("button").filter(x => !x.disabled && x.querySelector("svg"));
      b = btns.reverse()[0] || null;
    }

    return b;
  }

  function setNativeValue(el, value) {
    const proto = el && el.__proto__;
    const desc = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

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

  function applyPlaceholders(text, cursorZeroBased) {
    const prev = Math.max(1, cursorZeroBased);
    const next = cursorZeroBased + 1;
    return (text || "")
      .replaceAll("{prev}", String(prev))
      .replaceAll("{next}", String(next));
  }

  function startObserver() {
    if (obs) return;
    obs = new MutationObserver(() => { lastChange = Date.now(); });
    obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  }

  function stopObserver() {
    if (!obs) return;
    obs.disconnect();
    obs = null;
  }

  async function getStatus() {
    const sync = await chrome.storage.sync.get(DEFAULTS_SYNC);
    const local = await chrome.storage.local.get(DEFAULTS_LOCAL);
    const prompts = getEffectivePrompts(sync.promptsRaw);
    const cursor = Number(local.cursor || 0);

    return {
      running,
      sent,
      nextChapter: cursor + 1,
      totalPrompts: prompts.length,
      stopAtEnd: !!sync.stopAtEnd
    };
  }

  async function notifyStatus() {
    chrome.runtime.sendMessage({ type: "status", ...(await getStatus()) });
  }

  async function loop() {
    while (running) {
      const sync = await chrome.storage.sync.get(DEFAULTS_SYNC);
      const local = await chrome.storage.local.get(DEFAULTS_LOCAL);

      const prompts = getEffectivePrompts(sync.promptsRaw);
      let cursor = Number(local.cursor || 0);

      if (sent >= sync.maxRuns) {
        running = false;
        await notifyStatus();
        return;
      }

      const quietMs = randInt(sync.quietMin, sync.quietMax);
      const gapMs = randInt(sync.gapMin, sync.gapMax);
      const jitterMax = randInt(sync.jitterMin, sync.jitterMax);

      if (Date.now() - lastChange < quietMs) {
        await sleep(500);
        continue;
      }

      const ta = findTextarea();
      const send = findSendButton();

      if (!ta || !send) {
        await sleep(1200);
        continue;
      }

      if ((ta.value || "").trim().length > 0) {
        await sleep(1200);
        continue;
      }

      if (cursor >= prompts.length && sync.stopAtEnd) {
        running = false;
        await notifyStatus();
        return;
      }

      const chosen = prompts[Math.min(cursor, prompts.length - 1)];
      const msg = applyPlaceholders(chosen, cursor);

      ta.focus();
      setNativeValue(ta, msg);
      await sleep(200);

      send.click();
      await sleep(450);

      const cleared = (ta.value || "").trim().length === 0;

      if (cleared) {
        sent += 1;
        cursor += 1;
        await chrome.storage.local.set({ cursor });
        await notifyStatus();

        const extra = randInt(0, jitterMax);
        await sleep(gapMs + extra);
      } else {
        await sleep(2500);
      }
    }

    await notifyStatus();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (msg?.type === "start") {
        const startIndex = Number(msg.startIndex || 1);
        const cursor = Math.max(0, startIndex - 1);

        await chrome.storage.local.set({ cursor });

        if (!running) {
          running = true;
          sent = 0;
          lastChange = Date.now();
          startObserver();
          loop();
        }

        sendResponse({ ok: true, ...(await getStatus()) });
        return;
      }

      if (msg?.type === "stop") {
        running = false;
        stopObserver();
        sendResponse({ ok: true, ...(await getStatus()) });
        return;
      }

      if (msg?.type === "getStatus") {
        sendResponse({ ok: true, ...(await getStatus()) });
        return;
      }

      if (msg?.type === "setCursor") {
        const startIndex = Number(msg.startIndex || 1);
        const cursor = Math.max(0, startIndex - 1);
        await chrome.storage.local.set({ cursor });
        sendResponse({ ok: true, ...(await getStatus()) });
        return;
      }
    })();

    return true;
  });
})();
