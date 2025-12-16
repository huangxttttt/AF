// panel.js：运行在页面里的脚本，负责小面板 UI + 选区等

(() => {
  // ================== 注入全局样式（mac 风格，尽量少用内联） ==================
  function injectStyles() {
    if (document.getElementById("__dark-spy-style")) return;

    const style = document.createElement("style");
    style.id = "__dark-spy-style";
    style.textContent = `
      :root {
        --ds-blue: #0A84FF;
        --ds-blue-hover: #006FE0;
        --ds-border-soft: rgba(0,0,0,0.08);
        --ds-shadow: 0 12px 32px rgba(0,0,0,0.12);
        --ds-bg-glass: rgba(255,255,255,0.78);
        --ds-bg-subtle: rgba(250,250,250,0.86);
        --ds-text-main: #1c1c1e;
        --ds-text-sub: #7b7b7c;
        --ds-radius-lg: 18px;
        --ds-radius-md: 12px;
        --ds-radius-sm: 8px;
      }

      #random-demo-overlay {
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 2147483646;
        max-width: 380px;
        min-width: 260px;
        max-height: 70vh;
        display: flex;
        flex-direction: column;
		resize: both;         
        overflow: auto; 
		max-width: min(900px, 90vw);  /* 可选：上限放大 */
        max-height: 90vh;      
        background: var(--ds-bg-glass);
        backdrop-filter: saturate(180%) blur(20px);
        border-radius: var(--ds-radius-lg);
        border: 1px solid var(--ds-border-soft);
        box-shadow: var(--ds-shadow);

        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
        color: var(--ds-text-main);
      }

      .ds-header {
        cursor: move;
        padding: 8px 14px;
        background: rgba(255,255,255,0.6);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid var(--ds-border-soft);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .ds-title {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.02em;
      }

      .ds-close-btn {
        border: none;
        background: transparent;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        color: #9ca3af;
        width: 22px;
        height: 22px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }
      .ds-close-btn:hover {
        background: rgba(0,0,0,0.06);
        color: #4b5563;
      }

      .ds-tab-bar {
        display: flex;
        gap: 16px;
        padding: 0 12px;
        border-bottom: 1px solid var(--ds-border-soft);
        background: rgba(249,250,251,0.95);
      }
      .ds-tab-item {
        font-size: 12px;
        padding: 8px 0;
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
        color: var(--ds-text-sub);
        border-bottom: 2px solid transparent;
      }
      .ds-tab-item:hover {
        color: #4b5563;
      }
      .ds-tab-item.active {
        color: var(--ds-blue);
        border-bottom-color: var(--ds-blue);
      }

      .ds-content-wrapper {
        flex: 1;
        overflow: hidden;
      }

      #random-demo-box,
      #random-demo-box-extra {
        padding: 10px 12px 8px 12px;
        overflow: auto;
        max-height: calc(70vh - 70px);
        font-size: 13px;
      }

      #random-demo-text {
        margin-bottom: 8px;
        font-size: 14px;
        font-weight: 500;
        line-height: 1.5;
      }

      .ds-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 8px;
      }

      .ds-row-space-between {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        margin-bottom: 4px;
      }

      .ds-label {
        font-size: 12px;
        color: #4b5563;
      }

      .ds-input,
      .ds-select,
      .ds-textarea {
        width: 100%;
        background: rgba(255,255,255,0.65);
        border: 1px solid var(--ds-border-soft);
        border-radius: 10px;
        backdrop-filter: blur(8px);
        font-size: 12px;
        padding: 6px 8px;
        outline: none;
        box-sizing: border-box;
      }

      .ds-textarea {
        min-height: 120px;
        font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        resize: vertical;
      }

      .ds-input:focus,
      .ds-textarea:focus,
      .ds-select:focus {
        border-color: var(--ds-blue);
        box-shadow: 0 0 0 2px rgba(10,132,255,0.3);
        background: rgba(255,255,255,0.95);
      }

      .ds-btn {
        font-size: 12px;
        padding: 6px 10px;
        border-radius: 999px;
        cursor: pointer;
        border: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        transition: all 0.15s ease;
      }
      .ds-btn-primary {
        background: var(--ds-blue);
        color: #fff;
      }
      .ds-btn-primary:hover {
        background: var(--ds-blue-hover);
      }
      .ds-btn-secondary {
        background: rgba(0,0,0,0.04);
        color: var(--ds-text-main);
      }
      .ds-btn-secondary:hover {
        background: rgba(0,0,0,0.08);
      }
      .ds-btn-outline {
        background: #ffffff;
        border: 1px solid rgba(209,213,219,1);
        color: #374151;
      }
      .ds-btn-outline:hover {
        background: #f3f4f6;
      }
      .ds-btn-danger {
        background: #dc2626;
        color: #fff;
      }

      .ds-btn-pill-small {
        padding: 2px 8px;
        font-size: 11px;
        border-radius: 999px;
      }

      .ds-btn-pill-primary {
        padding: 2px 10px;
        font-size: 11px;
        border-radius: 999px;
        background: var(--ds-blue);
        color: #fff;
        border: none;
      }
      .ds-btn-pill-primary:hover {
        background: var(--ds-blue-hover);
      }

      #random-demo-status-bar {
        font-size: 12px;
        text-align: left;
        padding: 4px 12px;
        min-height: 20px;
        border-top: 1px solid var(--ds-border-soft);
        background: var(--ds-bg-subtle);
      }

      .ds-footer {
        font-size: 10px;
        color: #9ca3af;
        text-align: center;
        padding: 4px 0 6px 0;
      }

      #random-demo-summary {
        font-size: 12px;
        color: #374151;
        margin-bottom: 8px;
        line-height: 1.8;
        padding: 8px 10px;
        background: rgba(255,255,255,0.75);
        border-radius: 10px;
        border: 1px solid var(--ds-border-soft);
      }

      #random-demo-body-pre {
        white-space: pre-wrap;
        text-align: left;
        padding: 10px 12px;
        background: rgba(245,245,247,0.9);
        border-radius: 10px;
        max-height: 220px;
        overflow: auto;
        font-size: 11px;
        line-height: 1.5;
        border: 1px solid var(--ds-border-soft);
        margin-top: 4px;
      }

      .ds-summary-title-row {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: #111827;
        margin-bottom: 6px;
      }

      .ds-summary-dot {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: var(--ds-blue);
      }

      .ds-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        padding: 0 6px;
        font-size: 11px;
        border-radius: 999px;
        background: #e5edff;
        color: #1d4ed8;
      }

      .__llm_block_highlight {
        outline: 2px solid var(--ds-blue) !important;
        cursor: crosshair !important;
        box-shadow: 0 0 0 2px rgba(10,132,255,0.25) !important;
      }
	  
	        .ai-translation-block {
        margin-top: 4px;
        padding: 4px 8px;
        font-size: 12px;
        line-height: 1.6;
        background: rgba(22, 163, 74, 0.06);
        border-left: 3px solid #22c55e;
        border-radius: 6px;
        color: #111827;
        white-space: pre-wrap;
      }

      .ai-translation-block[data-error="true"] {
        background: rgba(239, 68, 68, 0.06);
        border-left-color: #ef4444;
        color: #991b1b;
      }

      .__ai_translate_frame {
        position: fixed;
        inset: 0;
        border: 2px solid #0A84FF;
        box-shadow: inset 0 0 0 2px rgba(10,132,255,0.25);
        pointer-events: none;
        z-index: 999998;
      }

      .__ai_translate_tip {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 999999;
        background: #0A84FF;
        color: #fff;
        padding: 8px 16px;
        font-size: 14px;
        text-align: center;
        box-shadow: 0 10px 30px rgba(15,23,42,0.25);
      }

      .ds-page-summary-wrapper {
        width: 100%;
        box-sizing: border-box;
        padding: 10px 16px 0;
        background: transparent;
        z-index: 9999;
      }

      .ds-page-summary-card {
        max-width: 960px;
        margin: 0 auto 8px;
        padding: 10px 14px;
        background: #f9fafb;
        border-radius: 12px;
        border: 1px solid rgba(148,163,184,0.6);
        box-shadow: 0 10px 30px rgba(15,23,42,0.08);
        font-size: 13px;
        line-height: 1.6;
        color: #111827;
      }

      .ds-page-summary-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 4px;
      }

      .ds-page-summary-title {
        font-size: 12px;
        font-weight: 600;
        color: #1d4ed8;
      }

      .ds-page-summary-close {
        border: none;
        background: transparent;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        color: #9ca3af;
      }

      .ds-page-summary-close:hover {
        color: #4b5563;
      }

      .ds-page-summary-body {
        font-size: 13px;
        color: #111827;
        white-space: pre-wrap;
      }
	  


    `;
    document.head.appendChild(style);
  }

  // ================== 文案 & 基本变量 ==================
  const messages = [
    "今天也是充满希望的一天！",
    "别放弃，你比自己想象得更厉害！",
    "保持微笑，生活会对你更温柔。",
    "世界那么大，开心一点不亏！",
    "越自律，越自由！",
  ];


    // ====== 结构化抽取状态 ======
  let structuredRegion = null; // { selector, html, text, mode, elementsCount }

  // 存放字段配置 JSON（字符串）和抽取结果 JSON（字符串），方便用户编辑
  let structuredFieldsJson = "";
  let structuredResultJson = "";


  // ====== 当前页图片/表格缓存 ======
  let detectedImages = [];
  let detectedTables = [];

  // ====== 选区高亮相关 ======
  let selecting = false;
  let lastHighlighted = null;
  let selectionTip = null;
  let selectionStyle = null;
  let overlay = document.getElementById("random-demo-overlay");
  
    // ====== 自动翻译模式状态 ======
  let autoTranslating = false;
  let autoTranslateFrame = null; // 页面外框
  let autoTranslateTip = null;   // 顶部提示条
  let translateQueue = [];
  let translatingBlock = false;
  let lastScanTime = 0;
  let scanTimer = null;


  function clearOldTimer() {
    if (window.__random_demo_timer) {
      clearInterval(window.__random_demo_timer);
      window.__random_demo_timer = null;
    }
  }

  function setRandomMessage() {
    const textEl = document.getElementById("random-demo-text");
    if (textEl && Array.isArray(messages) && messages.length > 0) {
      const random = messages[Math.floor(Math.random() * messages.length)];
      textEl.textContent = random;
    }
  }

  // ====== 上传函数 ======
  function uploadHtml({ html, locator = "", selectionType = "body" }) {
    const statusBar = document.getElementById("random-demo-status-bar");
    if (statusBar) {
      statusBar.style.color = "#6b7280";
      statusBar.textContent = "正在上传…";
    }

    chrome.runtime.sendMessage(
      {
        type: "UPLOAD_BODY_HTML",
        bodyHtml: html,
        locator,
        selectionType,
      },
      (resp) => {
        console.log("上传结果：", resp);

        const bar = document.getElementById("random-demo-status-bar");
        if (!bar) return;

        if (resp && resp.ok) {
          bar.style.color = "#16a34a";
          bar.textContent = "上传成功 ✓";
        } else {
          bar.style.color = "#dc2626";
          bar.textContent = "上传失败：" + (resp?.error || "未知错误");
        }
      }
    );
  }
  
  
  
// 根据 locator 返回更“聪明”的节点列表：
// 1. 先用 locator 本身匹配；
// 2. 如果只匹配到 1 个元素，尝试把它当容器，取它的直接子元素作为列表项。
  function resolveNodesByLocator(locator) {
  const trimmed = (locator || "").trim();
  if (!trimmed) return [];

  let nodes = [];
  try {
    nodes = Array.from(document.querySelectorAll(trimmed));
  } catch {
    nodes = [];
  }

  // 如果命中多个，直接按原样当列表
  if (nodes.length > 1) {
    return nodes;
  }

  // 只命中 1 个，尝试把它当“列表容器”
  if (nodes.length === 1) {
    const root = nodes[0];

    // 只看直接子元素，避免把所有孙子重孙都选进来
    const directChildren = Array.from(
      root.querySelectorAll(
        ":scope > li, :scope > div, :scope > article, :scope > tr"
      )
    ).filter((el) => {
      // 简单过滤一下空内容的节点
      const t = (el.innerText || el.textContent || "").trim();
      return t.length > 0;
    });

    if (directChildren.length > 1) {
      // 发现明显是一个“列表”
      return directChildren;
    }

    // 否则还是当成单个节点用
    return [root];
  }

  // 一个都没匹配到
  return [];
}

  function normalizeToArray(x) {
  if (Array.isArray(x)) return x;
  if (x && typeof x === "object") return [x];
  return [];
}


// 把很多节点的内容拆成多个 chunk —— 改成包含 outerHTML，保留 href/src
function buildChunksFromNodes(nodes, maxChars = 6000, maxItems = 25) {
  const chunks = [];
  let buf = [];
  let len = 0;

  for (const el of nodes) {
    const html = (el.outerHTML || "").trim();
    const text = ((el.innerText || el.textContent || "")).trim();
    if (!html && !text) continue;

    // 推荐：HTML 为主，文本为辅（方便模型理解）
    const payload = `HTML:\n${html}\n\nTEXT:\n${text}`;

    const extra = (buf.length ? "\n====================\n" : "") + payload;

    if (buf.length >= maxItems || len + extra.length > maxChars) {
      if (buf.length) chunks.push(buf.join("\n====================\n"));
      buf = [payload];
      len = payload.length;
    } else {
      buf.push(payload);
      len += extra.length;
    }
  }

  if (buf.length) chunks.push(buf.join("\n====================\n"));
  return chunks;
}


  // ================== 预览弹窗（替代 random-demo-body-pre） ==================
let __dsPreviewState = { title: "预览", text: "" };

function ensurePreviewModal() {
  let modal = document.getElementById("__ds_preview_modal");
  if (modal) return modal;

  const overlay = document.createElement("div");
  overlay.id = "__ds_preview_modal";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "999999";
  overlay.style.background = "rgba(15, 23, 42, 0.55)";
  overlay.style.display = "none";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.style.display = "none";
  });

  const card = document.createElement("div");
  card.style.width = "min(920px, calc(100vw - 40px))";
  card.style.maxHeight = "min(80vh, 720px)";
  card.style.background = "#fff";
  card.style.borderRadius = "14px";
  card.style.boxShadow = "0 20px 60px rgba(0,0,0,0.25)";
  card.style.display = "flex";
  card.style.flexDirection = "column";
  card.style.overflow = "hidden";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.padding = "10px 12px";
  header.style.borderBottom = "1px solid rgba(0,0,0,0.08)";

  const title = document.createElement("div");
  title.id = "__ds_preview_title";
  title.style.fontWeight = "600";
  title.style.fontSize = "13px";
  title.textContent = __dsPreviewState.title;

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";

  const copyBtn = document.createElement("button");
  copyBtn.className = "ds-btn ds-btn-outline ds-btn-pill-small";
  copyBtn.textContent = "复制";
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(__dsPreviewState.text || "");
    } catch {}
  });

  const closeBtn = document.createElement("button");
  closeBtn.className = "ds-btn ds-btn-outline ds-btn-pill-small";
  closeBtn.textContent = "关闭";
  closeBtn.addEventListener("click", () => {
    overlay.style.display = "none";
  });

  actions.appendChild(copyBtn);
  actions.appendChild(closeBtn);

  const pre = document.createElement("pre");
  pre.id = "__ds_preview_pre";
  pre.style.margin = "0";
  pre.style.padding = "12px";
  pre.style.overflow = "auto";
  pre.style.whiteSpace = "pre-wrap";
  pre.style.wordBreak = "break-word";
  pre.style.fontSize = "12px";
  pre.style.lineHeight = "1.6";
  pre.style.background = "rgba(15, 23, 42, 0.03)";

  header.appendChild(title);
  header.appendChild(actions);

  card.appendChild(header);
  card.appendChild(pre);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  return overlay;
}

// 只缓存，不弹窗
function cachePreview(text, title = "预览") {
  __dsPreviewState = { title, text: String(text || "") };
}

// 弹窗预览（原 showTextInPanel 的“显示”语义）
function showTextInPanel(text, title = "预览") {
  cachePreview(text, title);
  const overlay = ensurePreviewModal();
  const titleEl = overlay.querySelector("#__ds_preview_title");
  const preEl = overlay.querySelector("#__ds_preview_pre");
  if (titleEl) titleEl.textContent = __dsPreviewState.title;
  if (preEl) preEl.textContent = __dsPreviewState.text;
  overlay.style.display = "flex";
}

  
    // ================== 页面头部总结卡片 ==================
  function getOrCreatePageSummaryBody() {
    // wrapper：包住卡片的最外层，插在 body 最前面
    let wrapper = document.getElementById("__ai_page_summary_wrapper");
    let bodyEl;

    if (wrapper) {
      bodyEl = wrapper.querySelector(".ds-page-summary-body");
      if (!bodyEl) {
        bodyEl = document.createElement("div");
        bodyEl.className = "ds-page-summary-body";
        wrapper.appendChild(bodyEl);
      }
    } else {
      wrapper = document.createElement("div");
      wrapper.id = "__ai_page_summary_wrapper";
      wrapper.className = "ds-page-summary-wrapper";

      const card = document.createElement("div");
      card.className = "ds-page-summary-card";

      const header = document.createElement("div");
      header.className = "ds-page-summary-header";

      const title = document.createElement("div");
      title.className = "ds-page-summary-title";
      title.textContent = "AI 总结本页";

      const closeBtn = document.createElement("button");
      closeBtn.className = "ds-page-summary-close";
      closeBtn.innerHTML = "✕";
      closeBtn.addEventListener("click", () => {
        wrapper.remove();
      });

      header.appendChild(title);
      header.appendChild(closeBtn);

      bodyEl = document.createElement("div");
      bodyEl.className = "ds-page-summary-body";
      bodyEl.textContent = "AI 正在总结本页内容…";

      card.appendChild(header);
      card.appendChild(bodyEl);
      wrapper.appendChild(card);

      // 插入到 body 顶部
      const body = document.body || document.documentElement;
      if (body.firstChild) {
        body.insertBefore(wrapper, body.firstChild);
      } else {
        body.appendChild(wrapper);
      }
    }

    return bodyEl;
  }


  // 生成简单 CSS 选择器
  function getCssSelector(el) {
    if (!(el instanceof Element)) return "";
    const path = [];

    while (
      el &&
      el.nodeType === 1 &&
      el !== document.body &&
      el !== document.documentElement
    ) {
      let selector = el.nodeName.toLowerCase();

      if (el.id) {
        selector += "#" + el.id;
        path.unshift(selector);
        break;
      } else {
        let sib = el;
        let nth = 1;
        while ((sib = sib.previousElementSibling)) {
          if (sib.nodeName.toLowerCase() === el.nodeName.toLowerCase()) {
            nth++;
          }
        }
        selector += `:nth-of-type(${nth})`;
        path.unshift(selector);
        el = el.parentElement;
      }
    }

    return path.join(" > ");
  }


function safeMatches(el, sel) {
  try { return el.matches(sel); } catch { return false; }
}

function safeQueryCount(sel) {
  try { return document.querySelectorAll(sel).length; } catch { return -1; }
}

// 收集所有样式表里的 selectorText（不筛选命中）
// 同时标记：是否命中当前 el、命中数量（可选）
function getAllRuleSelectors(el, limit = 3000) {
  const seen = new Set();
  const items = [];

  const sheets = Array.from(document.styleSheets || []);
  for (const sheet of sheets) {
    let rules;
    try {
      rules = sheet.cssRules || sheet.rules;
    } catch {
      // 跨域 stylesheet 读 cssRules 会被拦截，跳过
      continue;
    }
    if (!rules) continue;

    for (const rule of Array.from(rules)) {
      if (rule.type !== CSSRule.STYLE_RULE || !rule.selectorText) continue;

      const parts = rule.selectorText
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

      for (const sel of parts) {
        if (seen.has(sel)) continue;
        seen.add(sel);

        const matches = el ? safeMatches(el, sel) : false;
        items.push({
          selector: sel,
          matches,
          // 如果你觉得这里开销大，可以先不算 count，改成选中时再算
          count: safeQueryCount(sel),
        });

        if (items.length >= limit) break;
      }
      if (items.length >= limit) break;
    }
    if (items.length >= limit) break;
  }

  // 排序策略：命中的在前；命中数量越接近 1 越靠前；再按长度
  items.sort((a, b) => {
    if (a.matches !== b.matches) return a.matches ? -1 : 1;

    const ac = a.count < 0 ? 1e9 : Math.abs(a.count - 1);
    const bc = b.count < 0 ? 1e9 : Math.abs(b.count - 1);
    if (ac !== bc) return ac - bc;

    return a.selector.length - b.selector.length;
  });

  return items;
}

  // ================== 自动翻译：识别视口元素 & 队列 ==================
  function isElementInViewport(el, extra = 200) {
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;

    if (rect.width === 0 || rect.height === 0) return false;

    const top = rect.top - extra;
    const bottom = rect.bottom + extra;
    const left = rect.left - extra;
    const right = rect.right + extra;

    return bottom >= 0 && top <= vh && right >= 0 && left <= vw;
  }

  function enqueueElementForTranslate(el) {
    if (!el) return;
    if (el.dataset.aiTranslating === "1" || el.dataset.aiTranslated === "1") {
      return;
    }

    const text = (el.innerText || "").trim();
    if (!text || text.length < 10) return; // 太短的不翻，避免噪音

    el.dataset.aiTranslating = "1";
    translateQueue.push({ element: el, text });
    processTranslateQueue();
  }

  function processTranslateQueue() {
    if (translatingBlock) return;
    if (!autoTranslating) return;

    const job = translateQueue.shift();
    if (!job) return;

    translatingBlock = true;

    const el = job.element;
    const text = job.text;

    const translationBlock = document.createElement("div");
    translationBlock.className = "ai-translation-block";
    translationBlock.textContent = "AI 正在翻译…";

    const parent = el.parentNode || document.body;
    if (el.nextSibling) {
      parent.insertBefore(translationBlock, el.nextSibling);
    } else {
      parent.appendChild(translationBlock);
    }

    const port = chrome.runtime.connect({ name: "ai-auto-translate" });

    port.postMessage({
      type: "TRANSLATE_BLOCK",
      text,
      url: location.href,
    });

    let firstChunk = true;

    port.onMessage.addListener((msg) => {
      if (msg.delta) {
        if (firstChunk) {
          translationBlock.textContent = "";
          firstChunk = false;
        }
        translationBlock.textContent += msg.delta;
      } else if (msg.done) {
        el.dataset.aiTranslated = "1";
        el.dataset.aiTranslating = "0";
        translatingBlock = false;
        try {
          port.disconnect();
        } catch {}
        processTranslateQueue();
      } else if (msg.error) {
        console.error("AI 自动翻译错误：", msg.error);
        translationBlock.dataset.error = "true";
        translationBlock.textContent = "AI 翻译失败：" + msg.error;
        el.dataset.aiTranslating = "0";
        translatingBlock = false;
        try {
          port.disconnect();
        } catch {}
        processTranslateQueue();
      }
    });
  }

  function scanVisibleBlocksForTranslate() {
    if (!autoTranslating) return;

    const now = Date.now();
    if (now - lastScanTime < 800) return; // 简单防抖
    lastScanTime = now;

    const candidates = Array.from(
      document.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li")
    );

    for (const el of candidates) {
      if (!autoTranslating) break;
      if (isElementInViewport(el, 150)) {
        enqueueElementForTranslate(el);
      }
    }
  }

  function scheduleScanSoon() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scanVisibleBlocksForTranslate();
    }, 200);
  }

  function handleAutoTranslateKeydown(e) {
    if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      stopAutoTranslateMode(true);
    }
  }
  
  
  function startAutoTranslateMode() {
    if (autoTranslating) return;
    autoTranslating = true;
    window.__aiAutoTranslateEnabled = true;

    // 关闭原来的面板
    if (overlay) {
      overlay.style.display = "none";
    }

    // 创建外框
    if (!autoTranslateFrame) {
      autoTranslateFrame = document.createElement("div");
      autoTranslateFrame.className = "__ai_translate_frame";
      document.body.appendChild(autoTranslateFrame);
    } else {
      autoTranslateFrame.style.display = "block";
    }

    // 顶部提示条
    if (!autoTranslateTip) {
      autoTranslateTip = document.createElement("div");
      autoTranslateTip.className = "__ai_translate_tip";
      autoTranslateTip.textContent =
        "AI 翻译模式：正在自动翻译当前页面文本，按 ESC 退出";
      document.body.appendChild(autoTranslateTip);
    } else {
      autoTranslateTip.style.display = "block";
      autoTranslateTip.textContent =
        "AI 翻译模式：正在自动翻译当前页面文本，按 ESC 退出";
    }

    document.addEventListener("keydown", handleAutoTranslateKeydown, true);

    // 立即对当前视口做一次扫描
    scheduleScanSoon();
  }

  function stopAutoTranslateMode(restoreOverlay) {
    if (!autoTranslating) return;
    autoTranslating = false;
    window.__aiAutoTranslateEnabled = false;

    translateQueue = [];
    translatingBlock = false;

    document.removeEventListener("keydown", handleAutoTranslateKeydown, true);

    if (autoTranslateFrame) {
      autoTranslateFrame.style.display = "none";
    }
    if (autoTranslateTip) {
      autoTranslateTip.style.display = "none";
    }

    if (restoreOverlay && overlay) {
      overlay.style.display = "flex";
    }
  }



  // ================== 高亮逻辑 ==================
  function ensureHighlightStyle() {
    if (!selectionStyle) {
      selectionStyle = document.createElement("style");
      selectionStyle.textContent = `
        .__llm_block_highlight {
          outline: 2px solid #0A84FF !important;
          cursor: crosshair !important;
          box-shadow: 0 0 0 2px rgba(10,132,255,0.25) !important;
        }
      `;
      document.head.appendChild(selectionStyle);
    }
  }

  function highlightElement(el) {
    if (lastHighlighted === el) return;
    if (lastHighlighted) {
      lastHighlighted.classList.remove("__llm_block_highlight");
    }
    lastHighlighted = el;
    if (lastHighlighted) {
      lastHighlighted.classList.add("__llm_block_highlight");
    }
  }

  function clearHighlight() {
    if (lastHighlighted) {
      lastHighlighted.classList.remove("__llm_block_highlight");
      lastHighlighted = null;
    }
  }

  function handleMouseOver(e) {
    if (!selecting) return;
    const target = e.target;
    if (overlay && overlay.contains(target)) return;
    if (selectionTip && selectionTip.contains(target)) return;
    highlightElement(target);
  }

  function handleClick(e) {
    if (!selecting) return;
    const target = e.target;

    // 点到面板/提示条本身就忽略
    if (overlay && overlay.contains(target)) return;
    if (selectionTip && selectionTip.contains(target)) return;

    e.preventDefault();
    e.stopPropagation();

    const el = target;
    const html = el.outerHTML || "";
    const text = el.innerText || el.textContent || "";
    const locator = getCssSelector(el);

    console.log("选中元素 CSS：", locator);

    // 1）保存结构化抽取的基础信息
    structuredRegion = {
      selector: locator,
      html,
      text,
      mode: "single",
      elementsCount: 1,
    };

    // 2）预览选中区域 HTML
    cachePreview(html, "选区 HTML（点击 👁 预览）");

    // 3）自动写入 locator 输入框
    if (window.__panel_locator_input) {
      window.__panel_locator_input.value = locator;
    }
		// 如果这个 selector 已经保存过，让下拉框自动定位到该规则
	if (window.__ds_syncSavedRuleSelect) {
	  window.__ds_syncSavedRuleSelect(locator);
	}


    // 4）提示用户下一步动作
    const statusBar = document.getElementById("random-demo-status-bar");
    if (statusBar) {
      statusBar.style.color = "#6b7280";
      statusBar.textContent =
        "已选中区域，可在下方使用 AI 分析字段并抽取结构化数据。";
    }

    // 结束选区模式，恢复面板
    stopSelectionMode(true);
  }


  function handleKeydown(e) {
    if (!selecting) return;
    if (e.key === "Escape") {
      e.preventDefault();
      stopSelectionMode(true);
    }
  }

  function startSelectionMode() {
    if (selecting) return;
    selecting = true;

    if (overlay) {
      overlay.style.display = "none";
    }

    ensureHighlightStyle();

    if (!selectionTip) {
      selectionTip = document.createElement("div");
      selectionTip.textContent =
        "选择模式：鼠标移动高亮元素，点击选择该区域，按 ESC 取消";
      selectionTip.style.position = "fixed";
      selectionTip.style.top = "0";
      selectionTip.style.left = "0";
      selectionTip.style.right = "0";
      selectionTip.style.zIndex = "999999";
      selectionTip.style.background = "#0A84FF";
      selectionTip.style.color = "#fff";
      selectionTip.style.padding = "8px 16px";
      selectionTip.style.fontSize = "14px";
      selectionTip.style.textAlign = "center";
      selectionTip.style.boxShadow = "0 10px 30px rgba(15,23,42,0.25)";
      document.body.appendChild(selectionTip);
    } else {
      selectionTip.style.display = "block";
    }

    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeydown, true);
  }

  function stopSelectionMode(restoreOverlay) {
    if (!selecting) return;
    selecting = false;

    clearHighlight();

    document.removeEventListener("mouseover", handleMouseOver, true);
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("keydown", handleKeydown, true);

    if (selectionTip) {
      selectionTip.style.display = "none";
    }

    if (restoreOverlay && overlay) {
      overlay.style.display = "flex";
    }
  }

  function highlightByLocator(locator) {
    const trimmed = (locator || "").trim();
    if (!trimmed) {
      alert("请输入 CSS 选择器（locator）");
      return;
    }

    ensureHighlightStyle();
    clearHighlight();

    let el;
    try {
      el = document.querySelector(trimmed);
    } catch (err) {
      console.warn("无效的选择器：", trimmed, err);
      alert("选择器语法不正确，请检查后重试");
      return;
    }

    if (!el) {
      alert("根据该选择器未找到元素：\n" + trimmed);
      return;
    }

       // 用智能解析，支持“外层 div 包裹列表”的情况
    const nodes = resolveNodesByLocator(trimmed);
    const count = nodes.length;

    const targetEl =  el;
    if (!targetEl) {
      alert("根据该选择器未找到元素：\n" + trimmed);
      return;
    }

    // 高亮第一个匹配元素
    highlightElement(targetEl);

    // 更新结构化抽取的基础信息
    const html = targetEl.outerHTML || "";
    const text = targetEl.innerText || targetEl.textContent || "";
    structuredRegion = {
      selector: trimmed,
      html,
      text,
      mode: count > 1 ? "list" : "single",
      elementsCount: count,
    };

    // 预览 HTML
    cachePreview(html, "定位命中 HTML（点击 👁 预览）");


    const statusBar = document.getElementById("random-demo-status-bar");
    if (statusBar) {
      statusBar.style.color = "#6b7280";
      statusBar.textContent =
        `已根据选择器选中区域（匹配元素数：${count}），可进行字段分析。`;
    }

    try {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      targetEl.scrollIntoView();
    }
  }


  // ================== 本页结构分析 ==================
  function detectAndRenderSummary() {
    detectedImages = [];
    const imgs = Array.from(document.images || []);
    imgs.forEach((img) => {
      const rect = img.getBoundingClientRect();
      const w = rect.width || img.naturalWidth || img.width;
      const h = rect.height || img.naturalHeight || img.height;
      if (w < 40 || h < 40) return;
      detectedImages.push({
        src: img.src,
        alt: img.alt || "",
        width: Math.round(w),
        height: Math.round(h),
        locator: getCssSelector(img),
      });
    });

    detectedTables = [];
    const tables = Array.from(document.querySelectorAll("table"));
    tables.forEach((table) => {
      const rows = Array.from(table.rows || []);
      if (rows.length === 0) return;

      const data = rows.map((row) =>
        Array.from(row.cells || []).map((cell) => (cell.innerText || "").trim())
      );

      if (data.length <= 1 && data[0] && data[0].length <= 1) return;

      detectedTables.push({
        locator: getCssSelector(table),
        rowCount: data.length,
        colCount: data[0]?.length || 0,
        data,
      });
    });

    const box = document.getElementById("random-demo-box");
    if (!box) return;

    let summaryEl = document.getElementById("random-demo-summary");
    if (!summaryEl) {
      summaryEl = document.createElement("div");
      summaryEl.id = "random-demo-summary";

      const textEl = document.getElementById("random-demo-text");
      if (textEl && textEl.nextSibling) {
        box.insertBefore(summaryEl, textEl.nextSibling);
      } else {
        box.insertBefore(summaryEl, box.firstChild);
      }
    } else {
      summaryEl.innerHTML = "";
    }

    const titleRow = document.createElement("div");
    titleRow.className = "ds-summary-title-row";

    const dot = document.createElement("span");
    dot.className = "ds-summary-dot";

    const titleText = document.createElement("span");
    titleText.textContent = "页面结构总览";

    titleRow.appendChild(dot);
    titleRow.appendChild(titleText);
    summaryEl.appendChild(titleRow);

    function createRow(label, type) {
      const row = document.createElement("div");
      row.className = "ds-row-space-between";

      const left = document.createElement("div");
      left.className = "ds-row";

      const count =
        type === "images" ? detectedImages.length : detectedTables.length;

      const labelSpan = document.createElement("span");
      labelSpan.textContent = label;
      labelSpan.style.fontWeight = "500";

      const badge = document.createElement("span");
      badge.className = "ds-badge";
      badge.textContent = String(count);

      left.appendChild(labelSpan);
      left.appendChild(badge);

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "4px";

      const viewBtn = document.createElement("button");
      viewBtn.textContent = "👁";
      viewBtn.className = "ds-btn ds-btn-outline ds-btn-pill-small";

      const uploadBtn = document.createElement("button");
      uploadBtn.textContent = "上传";
      uploadBtn.className = "ds-btn ds-btn-pill-primary";
      uploadBtn.style.display = "none";

      viewBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (type === "images") {
          if (!detectedImages.length) {
            alert("当前页没有符合条件的图片。");
            return;
          }
          showTextInPanel(JSON.stringify(detectedImages, null, 2), "结构数据预览：图片");

        } else {
          if (!detectedTables.length) {
            alert("当前页没有表格。");
            return;
          }
          showTextInPanel(JSON.stringify(detectedImages, null, 2), "结构数据预览：表格");

        }
        uploadBtn.style.display = "inline-flex";
      });

      uploadBtn.addEventListener("click", (e) => {
        e.stopPropagation();

        let payload;
        let selectionType;

        if (type === "images") {
          if (!detectedImages.length) {
            alert("当前没有可上传的图片数据。");
            return;
          }
          payload = {
            url: location.href,
            detectedAt: new Date().toISOString(),
            type: "images",
            images: detectedImages,
          };
          selectionType = "detected-images";
        } else {
          if (!detectedTables.length) {
            alert("当前没有可上传的表格数据。");
            return;
          }
          payload = {
            url: location.href,
            detectedAt: new Date().toISOString(),
            type: "tables",
            tables: detectedTables,
          };
          selectionType = "detected-tables";
        }

        showTextInPanel(JSON.stringify(payload, null, 2));
        uploadHtml({
          html: JSON.stringify(payload),
          locator: "",
          selectionType,
        });
      });

      actions.appendChild(viewBtn);
      actions.appendChild(uploadBtn);

      row.appendChild(left);
      row.appendChild(actions);

      return row;
    }

    summaryEl.appendChild(createRow("图片", "images"));
    summaryEl.appendChild(createRow("表格", "tables"));
  }

  // ================== 创建 overlay & Tabs ==================
  function createOverlayIfNeeded() {
    if (overlay) return;

    injectStyles();

    overlay = document.createElement("div");
    overlay.id = "random-demo-overlay";

    // header
    const header = document.createElement("div");
    header.className = "ds-header";

    const title = document.createElement("span");
    title.className = "ds-title";
    title.textContent = "暗访者·页面助手";

    const miniClose = document.createElement("button");
    miniClose.className = "ds-close-btn";
    miniClose.textContent = "×";
    miniClose.addEventListener("click", (e) => {
      e.stopPropagation();
      clearOldTimer();
      stopSelectionMode(false);
      overlay.remove();
      overlay = null;
    });
	


    header.appendChild(title);
    header.appendChild(miniClose);
  
    overlay.appendChild(header);

    // Tab bar
    const tabBar = document.createElement("div");
    tabBar.className = "ds-tab-bar";

    function createTabItem(text, tabName, isActive) {
      const item = document.createElement("div");
      item.textContent = text;
      item.dataset.tab = tabName;
      item.className = "ds-tab-item" + (isActive ? " active" : "");
      return item;
    }

	const tabMain = createTabItem("当前页", "main", true);
	const tabAI = createTabItem("AI工具", "ai", false);
	const tabExtra = createTabItem("自动巡检", "extra", false);

	tabBar.appendChild(tabMain);
	tabBar.appendChild(tabAI);
	tabBar.appendChild(tabExtra);
	
	overlay.appendChild(tabBar); 
    // 内容区域 wrapper
    const contentWrapper = document.createElement("div");
    contentWrapper.className = "ds-content-wrapper";
    overlay.appendChild(contentWrapper);

	// ====== Tab：AI工具 ======
	const aiBox = document.createElement("div");
	aiBox.id = "random-demo-box-ai";
	aiBox.style.display = "none";
	aiBox.style.padding = "10px 12px";

	const iframe = document.createElement("iframe");
	iframe.src = "http://172.23.27.133:8680/dify/chatbot/qdG2XZJCVc4Ng7aE";
	iframe.style.width = "100%";
	iframe.style.height = "420px";
	iframe.style.border = "1px solid rgba(0,0,0,0.08)";
	iframe.style.borderRadius = "12px";
	iframe.loading = "lazy";
	

	aiBox.appendChild(iframe);
	
	const btnAIWrap = document.createElement("div");
    btnAIWrap.className = "ds-row";
    btnAIWrap.style.flexWrap = "wrap";
    btnAIWrap.style.justifyContent = "flex-start";
    btnAIWrap.style.alignItems = "flex-start";
	
	//ai 翻译 ai总结
    const aiSummaryBtn = document.createElement("button");
    aiSummaryBtn.textContent = "AI总结本页";
    aiSummaryBtn.className = "ds-btn ds-btn-primary";
    aiSummaryBtn.style.background = "#10b981";
    aiSummaryBtn.style.border = "none";
    aiSummaryBtn.addEventListener("mouseenter", () => {
      aiSummaryBtn.style.background = "#059669";
    });
    aiSummaryBtn.addEventListener("mouseleave", () => {
      aiSummaryBtn.style.background = "#10b981";
    });

       aiSummaryBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      const status = document.getElementById("random-demo-status-bar");
      if (status) {
        status.style.color = "#6b7280";
        status.textContent = "AI 正在总结本页内容…";
      }

      const pageText = document.body?.innerText || "";
      const url = location.href;

      if (!pageText || !pageText.trim()) {
        if (status) {
          status.style.color = "#dc2626";
          status.textContent = "当前页面没有可总结的文本。";
        }
        return;
      }

      // 在页面头部创建/复用一个总结卡片
      const summaryBody = getOrCreatePageSummaryBody();
      summaryBody.textContent = ""; // 清空旧内容

      const port = chrome.runtime.connect({ name: "ai-auto-summary" });

      port.postMessage({
        type: "SUMMARY_PAGE",
        pageText,
        url,
      });

      let firstChunk = true;

      port.onMessage.addListener((msg) => {
        if (msg.delta) {
          if (firstChunk) {
            firstChunk = false;
          }
          summaryBody.textContent += msg.delta;
        } else if (msg.done) {
          if (status) {
            status.style.color = "#16a34a";
            status.textContent = "AI 总结完成 ✓";
          }
          try {
            port.disconnect();
          } catch {}
        } else if (msg.error) {
          console.error("AI 流错误：", msg.error);
          summaryBody.textContent = "AI 总结失败：" + msg.error;
          if (status) {
            status.style.color = "#dc2626";
            status.textContent = "AI 总结失败：" + msg.error;
          }
          try {
            port.disconnect();
          } catch {}
        }
      });
    });

	
	const aiTranslateBtn = document.createElement("button");
    aiTranslateBtn.textContent = "AI翻译";
    aiTranslateBtn.className = "ds-btn ds-btn-primary";
    aiTranslateBtn.style.background = "#6366f1";
    aiTranslateBtn.style.border = "none";
    aiTranslateBtn.addEventListener("mouseenter", () => {
      aiTranslateBtn.style.background = "#4f46e5";
    });
    aiTranslateBtn.addEventListener("mouseleave", () => {
      aiTranslateBtn.style.background = "#6366f1";
    });

    aiTranslateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // 点击后直接进入翻译模式：关闭面板 + 出外框 + Esc 退出
      startAutoTranslateMode();
    });
	
	btnAIWrap.appendChild(aiSummaryBtn);
	btnAIWrap.appendChild(aiTranslateBtn);
	aiBox.appendChild(btnAIWrap);

		
	contentWrapper.appendChild(aiBox);
	
   

    // ========== Tab1：当前页 ==========
    const box = document.createElement("div");
    box.id = "random-demo-box";

	
    const textEl = document.createElement("div");
    textEl.id = "random-demo-text";
    box.appendChild(textEl);

	

    const structTitle = document.createElement("div");
    structTitle.style.fontSize = "13px";
    structTitle.style.fontWeight = "600";
    structTitle.style.margin = "8px 0 4px";
    structTitle.textContent = "结构化抽取（选区 → 字段 → JSON）";
    box.appendChild(structTitle);

    const structHint = document.createElement("div");
    structHint.style.fontSize = "11px";
    structHint.style.color = "#6b7280";
    structHint.style.marginBottom = "6px";
    structHint.textContent =
      "步骤：1) 点击“选择区域”选择 DOM；2) 可编辑下方选择器；3) AI 分析字段；4) 抽取 JSON；5) 上传结构化数据。";
    box.appendChild(structHint);
	
    // locator + 高亮 + 保存规则
    const locatorWrap = document.createElement("div");
    locatorWrap.className = "ds-row";

    const locatorInput = document.createElement("input");
    locatorInput.type = "text";
    locatorInput.placeholder = "输入 CSS 选择器（locator）";
    locatorInput.className = "ds-input";
    locatorInput.style.flex = "1";
	locatorInput.addEventListener("input", () => {
	  if (window.__ds_syncSavedRuleSelect) {
		window.__ds_syncSavedRuleSelect(locatorInput.value);
	  }
	});
    const locatorBtn = document.createElement("button");
    locatorBtn.textContent = "预览定位";
    locatorBtn.className = "ds-btn ds-btn-outline";
    locatorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      highlightByLocator(locatorInput.value);
    });

    const saveRuleBtn = document.createElement("button");
    saveRuleBtn.textContent = "保存规则";
    saveRuleBtn.className = "ds-btn ds-btn-primary";
    saveRuleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const selector = (locatorInput.value || "").trim();
      if (!selector) {
        alert("请先输入或生成一个 CSS 选择器再保存规则。");
        return;
      }
      const name = prompt("给这个采集规则起个名字：", selector);
      if (!name) return;

      chrome.storage.sync.get({ crawlRules: [] }, (res) => {
        const rules = res.crawlRules || [];
        rules.push({
          id: Date.now().toString(),
          name,
          selector,
        });
        chrome.storage.sync.set({ crawlRules: rules }, () => {
          alert("规则已保存，可在“自动巡检”页签中使用。");
		   // 新增：保存后立刻刷新 Tab1 的规则下拉框，并选中当前 selector
		  if (window.__ds_loadSavedRules) window.__ds_loadSavedRules();
		  if (window.__ds_syncSavedRuleSelect) window.__ds_syncSavedRuleSelect(selector);
        });
      });
    });

	const previewAreaBtn = document.createElement("button");
	previewAreaBtn.textContent = "👁";
	previewAreaBtn.className = "ds-btn ds-btn-outline ds-btn-pill-small";

	previewAreaBtn.addEventListener("click", (e) => {
	  e.stopPropagation();

	  // 优先用当前选区；没有选区就用最近一次 cachePreview 的内容
	  const html = (structuredRegion && structuredRegion.html) ? structuredRegion.html : (__dsPreviewState.text || "");
	  if (!html) {
		alert("还没有可预览的内容：请先“选择区域”或“预览定位”。");
		return;
	  }
	  showTextInPanel(html, "选区预览");
	});
    locatorWrap.appendChild(locatorInput);
    locatorWrap.appendChild(previewAreaBtn);
    locatorWrap.appendChild(locatorBtn);
    locatorWrap.appendChild(saveRuleBtn);
    box.appendChild(locatorWrap);


    // 把 input 存到全局，方便别的函数使用
    window.__panel_locator_input = locatorInput;
	
		// ====== 已保存规则（crawlRules）选择：不需要点“选择区域”也能回填 ======
	const savedRuleRow = document.createElement("div");
	savedRuleRow.className = "ds-row";
	savedRuleRow.style.marginTop = "6px";

	const savedRuleLabel = document.createElement("span");
	savedRuleLabel.className = "ds-label";
	savedRuleLabel.textContent = "已保存规则:";

	const savedRuleSelect = document.createElement("select");
	savedRuleSelect.className = "ds-select";

	const reloadSavedRuleBtn = document.createElement("button");
	reloadSavedRuleBtn.textContent = "刷新";
	reloadSavedRuleBtn.className = "ds-btn ds-btn-outline";

	let __savedRules = [];

	function loadSavedRules() {
	  chrome.storage.sync.get({ crawlRules: [] }, (res) => {
		__savedRules = res.crawlRules || [];
		savedRuleSelect.innerHTML = "";

		const emptyOpt = document.createElement("option");
		emptyOpt.value = "";
		emptyOpt.textContent = "（选择一条规则回填 selector）";
		savedRuleSelect.appendChild(emptyOpt);

		__savedRules.forEach((r) => {
		  const opt = document.createElement("option");
		  // value 直接存 selector，选中就能回填
		  opt.value = (r.selector || "").trim();
		  opt.textContent = r.name || r.selector || "(未命名规则)";
		  savedRuleSelect.appendChild(opt);
		});
	  });
	}

	// 根据当前输入框 selector，自动把下拉框定位到已保存的那条（如果存在）
	function syncSavedRuleSelect(selector) {
	  const s = (selector || "").trim();
	  if (!s) {
		savedRuleSelect.value = "";
		return;
	  }
	  // 规则很多也没关系：直接用 value 匹配（value 就是 selector）
	  savedRuleSelect.value = s;
	  // 如果没有这条规则，value 会回落到空/不变，不影响使用
	}

	savedRuleSelect.addEventListener("change", (e) => {
	  const v = (savedRuleSelect.value || "").trim();
	  if (!v) return;

	  if (window.__panel_locator_input) {
		window.__panel_locator_input.value = v; // ✅ 直接回填输入框
	  }

	  // （可选）想要选完就预览定位，可以打开这行
	  // highlightByLocator(v);
	});

	reloadSavedRuleBtn.addEventListener("click", (e) => {
	  e.stopPropagation();
	  loadSavedRules();
	});

	savedRuleRow.appendChild(savedRuleLabel);
	savedRuleRow.appendChild(savedRuleSelect);
	savedRuleRow.appendChild(reloadSavedRuleBtn);
	box.appendChild(savedRuleRow);

	// 暴露给“选择区域”回填后自动同步
	window.__ds_loadSavedRules = loadSavedRules;
	window.__ds_syncSavedRuleSelect = syncSavedRuleSelect;

	// 初始化加载一次
	loadSavedRules();


    // 按钮区域
    const btnWrap = document.createElement("div");
    btnWrap.className = "ds-row";
    btnWrap.style.flexWrap = "wrap";
    btnWrap.style.justifyContent = "flex-start";
    btnWrap.style.alignItems = "flex-start";



    const selectAreaBtn = document.createElement("button");
    selectAreaBtn.textContent = "选择区域";
    selectAreaBtn.className = "ds-btn ds-btn-primary";
    selectAreaBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startSelectionMode();
    });

	 const aiFieldBtn = document.createElement("button");
    aiFieldBtn.className = "ds-btn ds-btn-outline";
    aiFieldBtn.textContent = "AI 分析可提取字段";

    const extractBtn = document.createElement("button");
    extractBtn.className = "ds-btn ds-btn-outline";
    extractBtn.textContent = "根据字段抽取数据";

    const uploadStructBtn = document.createElement("button");
    uploadStructBtn.className = "ds-btn ds-btn-primary";
    uploadStructBtn.textContent = "上传结构化数据";



    btnWrap.appendChild(selectAreaBtn);
    btnWrap.appendChild(aiFieldBtn);
    btnWrap.appendChild(extractBtn);
    btnWrap.appendChild(uploadStructBtn);
	
    box.appendChild(btnWrap);

// ====== 结构化抽取区域：字段 JSON + 结果 JSON ======
    


    // 字段配置 JSON 文本框
    const fieldLabel = document.createElement("div");
    fieldLabel.style.fontSize = "11px";
    fieldLabel.style.color = "#6b7280";
    fieldLabel.style.marginBottom = "2px";
    fieldLabel.textContent =
      "字段配置（JSON 数组，可手工编辑，例如 [{\"name\":\"title\",\"label\":\"标题\",\"type\":\"string\"}]）：";
    box.appendChild(fieldLabel);

    const fieldTextarea = document.createElement("textarea");
    fieldTextarea.id = "__ds_field_config";
    fieldTextarea.className = "ds-textarea";
    fieldTextarea.rows = 4;
    fieldTextarea.placeholder = "点击“AI 分析可提取字段”自动生成，或在此手动编辑字段列表 JSON。";
    box.appendChild(fieldTextarea);

    // 抽取结果 JSON 文本框
    const resultLabel = document.createElement("div");
    resultLabel.style.fontSize = "11px";
    resultLabel.style.color = "#6b7280";
    resultLabel.style.margin = "6px 0 2px";
    resultLabel.textContent =
      "抽取结果（JSON 对象或数组，可手工微调）：";
    box.appendChild(resultLabel);

    const resultTextarea = document.createElement("textarea");
    resultTextarea.id = "__ds_struct_result";
    resultTextarea.className = "ds-textarea";
    resultTextarea.rows = 4;
    resultTextarea.placeholder = "点击“根据字段抽取数据”后在此查看/编辑抽取结果 JSON。";
    box.appendChild(resultTextarea);
    contentWrapper.appendChild(box);
	
    // ====== 按钮事件：AI 字段分析 ======
    aiFieldBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      if (!structuredRegion) {
        alert("请先点击“区域选择”，在页面中选择一个区域。");
        return;
      }

      // 以当前 locator 输入框为准
      const locatorValue =
        (window.__panel_locator_input &&
          window.__panel_locator_input.value.trim()) ||
        structuredRegion.selector ||
        "";

      if (!locatorValue) {
        alert("没有可用的选择器，请先选择区域或输入选择器。");
        return;
      }

      const nodes = resolveNodesByLocator(locatorValue);
	  const chunks = buildChunksFromNodes(nodes, 6000, 3);

		if (!chunks.length) {
		  alert("选中区域没有可用内容（HTML/TEXT）。");
		  return;
		}

	// 字段建议：给模型 1 个 chunk 通常就够；想更稳可以给 2 个
	const sampleText = chunks.slice(0, 1).join("\n\n====\n\n"); 
	const mode = nodes.length > 1 ? "list" : "single";
	
      if (!sampleText.trim()) {
        alert("选中区域中没有可用文本。");
        return;
      }

      const statusBar = document.getElementById("random-demo-status-bar");
      if (statusBar) {
        statusBar.style.color = "#6b7280";
        statusBar.textContent = "AI 正在分析可提取字段…";
      }

      console.log(sampleText)
      chrome.runtime.sendMessage(
        {
          type: "AI_SUGGEST_FIELDS",
          text: sampleText,
          url: location.href,
          mode,
        },
        (resp) => {
          if (!resp) {
            alert("AI 字段分析失败：后台未响应");
            return;
          }
          if (!resp.ok) {
            alert("AI 字段分析失败：" + (resp.error || "未知错误"));
            if (statusBar) {
              statusBar.style.color = "#dc2626";
              statusBar.textContent =
                "AI 字段分析失败：" + (resp.error || "未知错误");
            }
            return;
          }

          structuredFieldsJson = JSON.stringify(resp.data || resp.fields || [], null, 2);

          fieldTextarea.value = structuredFieldsJson;

          if (statusBar) {
            statusBar.style.color = "#16a34a";
            statusBar.textContent = "AI 字段分析完成，可在字段配置中编辑。";
          }
        }
      );
    });

    // ====== 按钮事件：根据字段抽取数据 ======
    extractBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      if (!structuredRegion) {
        alert("请先选择区域，并完成字段配置。");
        return;
      }

      const locatorValue =
        (window.__panel_locator_input &&
          window.__panel_locator_input.value.trim()) ||
        structuredRegion.selector ||
        "";

      if (!locatorValue) {
        alert("没有可用的选择器。");
        return;
      }

      // 解析字段配置 JSON
      let fields;
      try {
        const raw = fieldTextarea.value || structuredFieldsJson || "[]";
        fields = JSON.parse(raw);
      } catch (err) {
        alert("字段配置 JSON 解析失败，请检查格式是否正确。\n" + err);
        return;
      }

         // 统一按 list：永远分批抽取（即使只有 1 个节点，也会 chunks.length === 1）
		const nodes = resolveNodesByLocator(locatorValue);
		const chunks = buildChunksFromNodes(nodes, 6000, 3);

		if (!chunks.length) {
		  alert("选中区域没有可用文本。");
		  return;
		}

		const statusBar = document.getElementById("random-demo-status-bar");
		if (statusBar) {
		  statusBar.style.color = "#6b7280";
		  statusBar.textContent = `AI 正在分批抽取…（共 ${chunks.length} 批）`;
		}
		
		console.log(chunks)
		chrome.runtime.sendMessage(
		  {
			type: "AI_EXTRACT_STRUCTURED_BATCH",
			chunks,
			url: location.href,
			fields,
		  },
		  (resp) => {
			if (!resp) {
			  alert("AI 抽取失败：后台未响应");
			  return;
			}
			if (!resp.ok) {
			  alert("AI 抽取失败：" + (resp.error || "未知错误"));
			  if (statusBar) {
				statusBar.style.color = "#dc2626";
				statusBar.textContent = "AI 抽取失败：" + (resp.error || "未知错误");
			  }
			  return;
			}

			structuredResultJson = JSON.stringify(resp.data, null, 2);
			resultTextarea.value = structuredResultJson;

			if (statusBar) {
			  statusBar.style.color = "#16a34a";
			  statusBar.textContent = "AI 已抽取结构化数据，可在下方结果中查看/编辑。";
			}
		  }
		);

      });


    // ====== 按钮事件：上传结构化数据 ======
    uploadStructBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      const locatorValue =
        (window.__panel_locator_input &&
          window.__panel_locator_input.value.trim()) ||
        (structuredRegion && structuredRegion.selector) ||
        "";

      if (!locatorValue) {
        alert("没有可用的选择器，无法上传。");
        return;
      }

      // 解析字段配置
      let fields;
      try {
        const raw = fieldTextarea.value || structuredFieldsJson || "[]";
        fields = JSON.parse(raw);
      } catch (err) {
        alert("字段配置 JSON 解析失败，请检查格式。\n" + err);
        return;
      }

      // 解析结果 JSON
      let data;
      try {
        const raw = resultTextarea.value || structuredResultJson || "";
        if (!raw.trim()) {
          alert("还没有结构化结果，请先抽取数据。");
          return;
        }
        data = JSON.parse(raw);
      } catch (err) {
        alert("结果 JSON 解析失败，请检查格式。\n" + err);
        return;
      }

      data = normalizeToArray(data);

	const payload = {
	  mode: "list",
	  selector: locatorValue,
	  fields,
	  data, // 永远是数组
	  url: location.href,
	  extractedAt: new Date().toISOString(),
	};


      const statusBar = document.getElementById("random-demo-status-bar");
      if (statusBar) {
        statusBar.style.color = "#6b7280";
        statusBar.textContent = "正在上传结构化数据…";
      }

      uploadHtml({
        html: JSON.stringify(payload),
        locator: locatorValue,
        selectionType: "structured-json",
      });
    });


    // ========== Tab2：自动巡检 ==========
    const extraBox = document.createElement("div");
    extraBox.id = "random-demo-box-extra";
    extraBox.style.display = "none";

    const extraTitle = document.createElement("div");
    extraTitle.textContent = "批量采集子页面";
    extraTitle.style.fontSize = "13px";
    extraTitle.style.fontWeight = "600";
    extraTitle.style.marginBottom = "8px";
    extraBox.appendChild(extraTitle);

    // 规则选择
    let currentRules = [];
    const ruleRow = document.createElement("div");
    ruleRow.className = "ds-row";

    const ruleLabel = document.createElement("span");
    ruleLabel.className = "ds-label";
    ruleLabel.textContent = "采集规则:";

    const ruleSelect = document.createElement("select");
    ruleSelect.className = "ds-select";

    const reloadRuleBtn = document.createElement("button");
    reloadRuleBtn.textContent = "刷新规则";
    reloadRuleBtn.className = "ds-btn ds-btn-outline";

    function loadRulesIntoSelect() {
      chrome.storage.sync.get({ crawlRules: [] }, (res) => {
        currentRules = res.crawlRules || [];
        ruleSelect.innerHTML = "";

        const emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = "（不使用规则，抓整页）";
        ruleSelect.appendChild(emptyOpt);

        currentRules.forEach((r) => {
          const opt = document.createElement("option");
          opt.value = r.id;
          opt.textContent = r.name;
          ruleSelect.appendChild(opt);
        });
      });
    }

    reloadRuleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      loadRulesIntoSelect();
    });

    ruleRow.appendChild(ruleLabel);
    ruleRow.appendChild(ruleSelect);
    ruleRow.appendChild(reloadRuleBtn);
    extraBox.appendChild(ruleRow);

    // 自定义 selector（可覆盖规则）
    const selectorWrap = document.createElement("div");
    selectorWrap.className = "ds-row";

    const selectorLabel = document.createElement("span");
    selectorLabel.className = "ds-label";
    selectorLabel.textContent = "自定义 CSS：";

    const selectorInput = document.createElement("input");
    selectorInput.type = "text";
    selectorInput.placeholder = "可选，填了就优先用它（例如：.main-content）";
    selectorInput.className = "ds-input";
    selectorInput.style.flex = "1";

    selectorWrap.appendChild(selectorLabel);
    selectorWrap.appendChild(selectorInput);
    extraBox.appendChild(selectorWrap);

    // URL 文本框
    const urlTextarea = document.createElement("textarea");
    urlTextarea.placeholder = "每行一个子页面 URL，可以写完整地址，也可以是 /path 形式";
    urlTextarea.className = "ds-textarea";
    extraBox.appendChild(urlTextarea);

    // base URL
    const baseUrlWrap = document.createElement("div");
    baseUrlWrap.className = "ds-row";

    const baseUrlLabel = document.createElement("span");
    baseUrlLabel.className = "ds-label";
    baseUrlLabel.textContent = "基础域名：";

    const baseUrlInput = document.createElement("input");
    baseUrlInput.type = "text";
    baseUrlInput.placeholder = "默认用当前站点，例如 " + location.origin;
    baseUrlInput.className = "ds-input";
    baseUrlInput.style.flex = "1";

    baseUrlWrap.appendChild(baseUrlLabel);
    baseUrlWrap.appendChild(baseUrlInput);
    extraBox.appendChild(baseUrlWrap);

    // 按钮行
    const crawlBtnRow = document.createElement("div");
    crawlBtnRow.className = "ds-row";
    crawlBtnRow.style.marginTop = "4px";

    const startCrawlBtn = document.createElement("button");
    startCrawlBtn.textContent = "开始批量采集";
    startCrawlBtn.className = "ds-btn ds-btn-primary";

    startCrawlBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      const raw = urlTextarea.value || "";
      const lines = raw
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (!lines.length) {
        alert("请先在文本框中输入至少一个子页面 URL（每行一个）");
        return;
      }

      const currentOrigin = location.origin;
      const base = (baseUrlInput.value || "").trim() || currentOrigin;

      const fullUrls = lines.map((u) => {
        if (u.startsWith("http://") || u.startsWith("https://")) {
          return u;
        }
        if (u.startsWith("/")) {
          return base.replace(/\/+$/, "") + u;
        }
        return base.replace(/\/+$/, "") + "/" + u;
      });

      // 优先使用自定义 selector，其次选规则
      let selector = (selectorInput.value || "").trim();
      if (!selector) {
        const ruleId = ruleSelect.value;
        if (ruleId) {
          const found = currentRules.find((r) => r.id === ruleId);
          if (found) {
            selector = found.selector;
          }
        }
      }

      console.log(
        "准备自动巡检这些地址：",
        fullUrls,
        "使用 selector：",
        selector
      );

      chrome.runtime.sendMessage(
        {
          type: "AUTO_CRAWL_START",
          urls: fullUrls,
          cssSelector: selector,
        },
        (resp) => {
          console.log("AUTO_CRAWL_START resp:", resp);
          if (!resp || !resp.ok) {
            alert("启动自动巡检失败：" + (resp?.error || "未知错误"));
          } else {
            alert(
              "已开始自动巡检，扩展会在新标签页中依次打开子页面并上传数据。"
            );
          }
        }
      );
    });

    crawlBtnRow.appendChild(startCrawlBtn);
    extraBox.appendChild(crawlBtnRow);

    contentWrapper.appendChild(extraBox);

   // tab 切换（支持 main / ai / extra）
function switchTab(tabName) {
	
	// ✅ 切换页签时：清空底部消息提示
	const statusBar = document.getElementById("random-demo-status-bar");
	if (statusBar) {
	  statusBar.textContent = "";
	  statusBar.style.color = "#6b7280";
	}

  const mainBox = document.getElementById("random-demo-box");
  const aiBox = document.getElementById("random-demo-box-ai");
  const extraBox = document.getElementById("random-demo-box-extra");
  const items = overlay.querySelectorAll(".ds-tab-item");

  // active 样式
  items.forEach((it) => {
    it.classList.toggle("active", it.dataset.tab === tabName);
  });

  // 先全部隐藏，避免漏掉
  if (mainBox) mainBox.style.display = "none";
  if (aiBox) aiBox.style.display = "none";
  if (extraBox) extraBox.style.display = "none";

  if (tabName === "main") {
    if (mainBox) mainBox.style.display = "block";
    return;
  }

  if (tabName === "ai") {
    if (aiBox) aiBox.style.display = "block";
    return;
  }

  // extra
  if (extraBox) extraBox.style.display = "block";
  loadRulesIntoSelect(); // 打开自动巡检时刷新一次规则
}


    tabMain.addEventListener("click", (e) => {
      e.stopPropagation();
      switchTab("main");
    });
    tabExtra.addEventListener("click", (e) => {
      e.stopPropagation();
      switchTab("extra");
    });
	
	tabAI.addEventListener("click", (e) => {
	  e.stopPropagation();
	  switchTab("ai");
	});

    // 状态栏
    const statusBar = document.createElement("div");
    statusBar.id = "random-demo-status-bar";
    overlay.appendChild(statusBar);

    // 作者
    const author = document.createElement("div");
    author.className = "ds-footer";
    author.textContent = "© 2025 by easymer's huangxiaotao";
    overlay.appendChild(author);

    document.body.appendChild(overlay);

    // 拖动逻辑
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    header.addEventListener("mousedown", (e) => {
      e.preventDefault();
      isDragging = true;
      const rect = overlay.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      startX = e.clientX;
      startY = e.clientY;

      overlay.style.left = `${startLeft}px`;
      overlay.style.top = `${startTop}px`;
      overlay.style.right = "auto";
      overlay.style.bottom = "auto";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      overlay.style.left = `${startLeft + dx}px`;
      overlay.style.top = `${startTop + dy}px`;
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });
  }

  // ================== 初始化：随机文案 + 结构分析 ==================
  function init() {
    createOverlayIfNeeded();
    clearOldTimer();
    setRandomMessage();
    window.__random_demo_timer = setInterval(setRandomMessage, 3000);
    detectAndRenderSummary();
	
	    // 自动翻译模式下，滚动 / 尺寸变化时触发扫描
    window.addEventListener("scroll", () => {
      if (!autoTranslating) return;
      scheduleScanSoon();
    });

    window.addEventListener("resize", () => {
      if (!autoTranslating) return;
      scheduleScanSoon();
    });

  }

  init();
})();
