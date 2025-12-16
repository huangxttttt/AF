// background.js (MV3 Service Worker)
// =============================================================
// 改动要点：
// - 移除 mode（list/single）判断，统一按 list 处理
// - 结构化抽取：永远返回 JSON 数组（单条也用 [ {...} ]）
// - batch：合并结果后依然返回数组
// - 保留：withTimeout/tryParseJsonContent、SSE buffer、防并发 config、AUTO_CRAWL_START tabId 获取、巡检串行上传
// =============================================================

// ================== 配置相关：加载 config.json ==================
let API_URL = null;
let _configPromise = null; // 防止并发重复拉 config

function loadConfig() {
  return fetch(chrome.runtime.getURL("config.json"))
    .then((res) => res.json())
    .then((cfg) => {
      API_URL = cfg.API_URL || null;
      console.log("Loaded API_URL:", API_URL);
      return cfg;
    })
    .catch((err) => {
      console.error("Failed to load config.json:", err);
      return null;
    });
}

function ensureApiUrlReady() {
  if (API_URL) return Promise.resolve(API_URL);
  if (!_configPromise) {
    _configPromise = loadConfig().finally(() => {
      if (!API_URL) _configPromise = null;
    });
  }
  return _configPromise.then(() => API_URL);
}

// 初始化加载一次
loadConfig();

// ================== 通用工具 ==================
function withTimeout(fetchFactory, ms, timeoutMsg = "请求超时") {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);

  return Promise.resolve()
    .then(() => fetchFactory(controller.signal))
    .catch((err) => {
      if (err && err.name === "AbortError") throw new Error(timeoutMsg);
      throw err;
    })
    .finally(() => clearTimeout(t));
}

function tryParseJsonContent(content) {
  const raw = (content || "").trim();
  if (!raw) throw new Error("返回内容为空，无法解析 JSON");

  let s = raw
    .replace(/^\s*```json\s*/i, "")
    .replace(/^\s*```\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(s);
  } catch (_) {}

  const firstCurly = s.indexOf("{");
  const firstSquare = s.indexOf("[");
  const starts = [firstCurly, firstSquare].filter((i) => i !== -1);
  const start = starts.length ? Math.min(...starts) : -1;

  const endCurly = s.lastIndexOf("}");
  const endSquare = s.lastIndexOf("]");
  const end = Math.max(endCurly, endSquare);

  if (start !== -1 && end !== -1 && end > start) {
    const sliced = s.slice(start, end + 1);
    return JSON.parse(sliced);
  }

  throw new Error("无法从返回内容中解析出合法 JSON");
}

async function getActiveTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const id = tabs && tabs[0] && tabs[0].id ? tabs[0].id : null;
      resolve(id);
    });
  });
}

// ✅ 统一按 list：把各种返回“归一化”为数组
function normalizeToArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") return [parsed];
  // 允许空返回
  return [];
}

// ================== 统一消息入口 ==================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1）普通上传（手动 / 自动巡检里发送的统一入口）
  if (message.type === "UPLOAD_BODY_HTML") {
    const html = message.bodyHtml || "";
    const url = sender.tab && sender.tab.url ? sender.tab.url : (message.url || "");
    const locator = message.locator || "";
    const selectionType = message.selectionType || "body";

    console.log(
      "准备上传 html 到后端，url:",
      url,
      "selectionType:",
      selectionType,
      "locator:",
      locator
    );

    ensureApiUrlReady()
      .then((apiUrl) => {
        if (!apiUrl) throw new Error("API_URL 未设置，请检查 config.json");

        return fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            bodyHtml: html,
            locator,
            selectionType,
          }),
        });
      })
      .then(async (res) => {
        const data = await res.text().catch(() => "");
        console.log("后端响应：", res.status, data);

        if (!res.ok) sendResponse({ ok: false, status: res.status, body: data });
        else sendResponse({ ok: true, status: res.status, body: data });
      })
      .catch((err) => {
        console.error("上传失败：", err);
        sendResponse({ ok: false, error: String(err) });
      });

    return true;
  }

  // 2）自动巡检入口
  if (message.type === "AUTO_CRAWL_START") {
    (async () => {
      const urls = Array.isArray(message.urls) ? message.urls : [];
      const cssSelector = (message.cssSelector || "").trim();

      let tabId = sender.tab && sender.tab.id ? sender.tab.id : null;
      if (!tabId) tabId = await getActiveTabId();

      if (!tabId) {
        sendResponse({ ok: false, error: "无法获取当前 tabId（请从网页页签触发或传入 tabId）" });
        return;
      }
      if (!urls.length) {
        sendResponse({ ok: false, error: "URL 列表为空" });
        return;
      }

      console.log("收到自动巡检请求，当前 tabId:", tabId, "urls:", urls, "selector:", cssSelector);
      startAutoCrawlInNewTab(tabId, urls, cssSelector);

      sendResponse({ ok: true });
    })();

    return true;
  }

  // 3）AI 字段建议
  if (message.type === "AI_SUGGEST_FIELDS") {
    const text = message.text || "";
    const url = message.url || "";
    (async () => {
      try {
        const fields = await callDeepseekSuggestFields(text, url);
        sendResponse({ ok: true, data: fields });
      } catch (err) {
        console.error("AI_SUGGEST_FIELDS 调用失败：", err);
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }

  // 4）AI 结构化抽取（分批版）=> ✅ 永远返回数组
  if (message.type === "AI_EXTRACT_STRUCTURED_BATCH") {
    const chunks = Array.isArray(message.chunks) ? message.chunks : [];
    const url = message.url || "";
    const fields = Array.isArray(message.fields) ? message.fields : [];

    (async () => {
      try {
        const out = [];
        for (const c of chunks) {
          const arr = await callDeepseekExtractStructuredList(c, url, fields);
          out.push(...arr);
        }
        sendResponse({ ok: true, data: out });
      } catch (err) {
        console.error("AI_EXTRACT_STRUCTURED_BATCH 调用失败：", err);
        sendResponse({ ok: false, error: String(err) });
      }
    })();

    return true;
  }


  return false;
});



// ================== Deepseek：结构化抽取（统一 list） ==================
async function callDeepseekExtractStructuredList(text, url, fields) {
  const configRes = await fetch(chrome.runtime.getURL("config.json"));
  const cfg = await configRes.json();
  const apiUrl = cfg.DEEPSEEK_API_URL + "/chat/completions";
  const apiKey = cfg.DEEPSEEK_API_KEY;

  const MAX_LEN = 12000;
  const RETRY_LEN = 6000;
  const TIMEOUT_MS = 40000;

  if (!fields?.length) throw new Error("字段列表为空，无法进行结构化抽取");

  const clean = (text || "").replace(/\s+/g, " ").slice(0, MAX_LEN);
  const fieldsDesc = JSON.stringify(fields || [], null, 2);

  const requestBody = (payloadText) => ({
    model: "PolyNex-Instruct",
    stream: false,
    messages: [
      {
        role: "system",
        content: `
你是一名网页信息抽取助手。

【输出要求（非常重要）】
- 永远输出 JSON 数组（即使只有 1 条记录，也要用 [ { ... } ] 包裹）
- 数组内每个元素都是一条记录对象
- key 必须严格使用字段的 name；缺失字段用 null
- 输入可能包含 HTML，请同时利用标签属性（如 a[href]、img[src]）
- 链接字段优先取 href；图片字段优先取 img 的 src
- 不要输出字段列表之外的字段
- 只输出 JSON，不要任何说明文字
`.trim(),
      },
      {
        role: "user",
        content: `
网页 URL：${url}

字段定义（JSON 数组）：
${fieldsDesc}

以下是待抽取的文本（可能包含多条记录）：
${payloadText}
`.trim(),
      },
    ],
  });

  const sendRequest = (payloadText) =>
    withTimeout(
      (signal) =>
        fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + apiKey,
          },
          body: JSON.stringify(requestBody(payloadText)),
          signal,
        }),
      TIMEOUT_MS,
      "结构化抽取超时"
    );

  let resp;
  try {
    resp = await sendRequest(clean);
  } catch (err) {
    const isTimeout = /超时/.test(String(err));
    const canRetry = clean.length > RETRY_LEN;
    if (!isTimeout || !canRetry) throw err;
    resp = await sendRequest(clean.slice(0, RETRY_LEN));
  }

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`结构化抽取 HTTP 错误：${resp.status} ${t}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content?.trim() || "[]";
  const parsed = tryParseJsonContent(content);

  // ✅ 最终兜底：强制归一化为数组
  return normalizeToArray(parsed);
}

// ================== 自动巡检逻辑（新标签页版本） ==================
function startAutoCrawlInNewTab(currentTabId, urls, cssSelector) {
  let index = 0;

  chrome.tabs.create({ url: "about:blank", active: false }, (crawlTab) => {
    if (!crawlTab || !crawlTab.id) {
      console.error("创建巡检标签页失败");
      return;
    }

    const crawlTabId = crawlTab.id;
    console.log("创建巡检 tab:", crawlTabId);

    function visitNext() {
      if (index >= urls.length) {
        console.log("自动巡检全部完成 ✅");
        // chrome.tabs.remove(crawlTabId);
        return;
      }

      const url = urls[index++];
      console.log(`自动巡检：准备打开第 ${index} 个页面：`, url);

      chrome.tabs.update(crawlTabId, { url }, () => {
        if (chrome.runtime.lastError) {
          console.warn("tabs.update 出错，跳过该页面：", chrome.runtime.lastError);
          setTimeout(visitNext, 800);
          return;
        }

        function handleUpdated(updatedTabId, changeInfo) {
          if (updatedTabId === crawlTabId && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(handleUpdated);

            chrome.scripting.executeScript(
              {
                target: { tabId: crawlTabId },
                func: async ({ selector }) => {
                  let html = "";
                  let locator = selector || "";

                  if (selector && selector.trim()) {
                    let nodes = [];
                    try {
                      nodes = Array.from(document.querySelectorAll(selector));
                    } catch (err) {
                      console.warn("自动巡检 selector 解析失败：", selector, err);
                    }

                    if (nodes && nodes.length) {
                      html = nodes.map((n) => n.outerHTML).join("\n");
                    } else {
                      html = document.body ? document.body.outerHTML : "";
                      locator = selector;
                    }
                  } else {
                    html = document.body ? document.body.outerHTML : "";
                    locator = "";
                  }

                  const res = await new Promise((resolve) => {
                    chrome.runtime.sendMessage(
                      {
                        type: "UPLOAD_BODY_HTML",
                        bodyHtml: html,
                        locator,
                        selectionType: selector ? "selector" : "body",
                      },
                      (r) => resolve(r)
                    );
                  });

                  return { ok: res?.ok === true, error: res?.error || null };
                },
                args: [{ selector: cssSelector }],
              },
              (results) => {
                if (chrome.runtime.lastError) {
                  console.warn("executeScript 出错：", chrome.runtime.lastError);
                } else {
                  const r0 = results && results[0] ? results[0].result : null;
                  if (r0 && r0.ok) console.log("自动巡检：上传完成 ✅");
                  else console.warn("自动巡检：上传失败/无结果：", r0);
                }

                setTimeout(visitNext, 800);
              }
            );
          }
        }

        chrome.tabs.onUpdated.addListener(handleUpdated);
      });
    }

    visitNext();
  });
}



// ================== Port: 流式总结/翻译 ==================
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "ai-auto-summary") {
    console.log("[background] ai-auto-summary connected");

    port.onMessage.addListener((msg) => {
      if (!msg || msg.type !== "SUMMARY_PAGE") return;

      const pageText = msg.text || "";
      const url = msg.url || "";

      console.log("[background] SUMMARY_PAGE 收到，url:", url);

      callDeepseekSummaryStream(pageText, url, port).catch((err) => {
        console.error("callDeepseekSummaryStream 出错：", err);
        try { port.postMessage({ error: String(err) }); } catch {}
        try { port.disconnect(); } catch {}
      });
    });

    return;
  }

  if (port.name === "ai-auto-translate") {
    console.log("[background] ai-auto-translate connected");

    port.onMessage.addListener((msg) => {
      if (!msg || msg.type !== "TRANSLATE_BLOCK") return;

      const text = msg.text || "";
      const url = msg.url || "";

      console.log("[background] TRANSLATE_BLOCK 收到，url:", url);

      callDeepseekTranslateStream(text, url, port).catch((err) => {
        console.error("callDeepseekTranslateStream 出错：", err);
        try { port.postMessage({ error: String(err) }); } catch {}
        try { port.disconnect(); } catch {}
      });
    });

    return;
  }
});

// ================== Deepseek：流式翻译 ==================
async function callDeepseekTranslateStream(blockText, url, port) {
  const configRes = await fetch(chrome.runtime.getURL("config.json"));
  const cfg = await configRes.json();

  const apiUrl = cfg.DEEPSEEK_API_URL + "/chat/completions";
  const apiKey = cfg.DEEPSEEK_API_KEY;

  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: "PolyNex-Instruct",
      stream: true,
      messages: [
        {
          role: "system",
           content: `
你是一名多语言网页翻译助手。

【要求】
1. 自动识别原文语言，将其翻译为“自然流畅的简体中文”。
2. 保持原文的大致段落结构，注意人名、技术名词不需要翻译，方便阅读。例如：Wang 就不需要翻译，直接输出。
3. 遇到代码、命令、变量名等，优先保留不翻。
4. 如果原文已经是中文，仅做适度润色，使其更通顺简洁。

【输出格式】
- 只输出译文本身，不要添加任何说明或前后缀。`.trim(),
        },
        {
          role: "user",
          content: `网页 URL：${url}\n\n请翻译下面文本：\n${blockText}`,
        },
      ],
    }),
  });

  if (!resp.ok) {
    port.postMessage({ error: "HTTP " + resp.status });
    port.disconnect();
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;

      const data = line.replace(/^data:\s*/, "");
      if (data === "[DONE]") {
        port.postMessage({ done: true });
        port.disconnect();
        return;
      }

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) port.postMessage({ delta });
      } catch {}
    }
  }

  port.postMessage({ done: true });
  port.disconnect();
}

// ================== Deepseek：流式总结 ==================
async function callDeepseekSummaryStream(pageText, url, port) {
  const configRes = await fetch(chrome.runtime.getURL("config.json"));
  const cfg = await configRes.json();

  const apiUrl = cfg.DEEPSEEK_API_URL + "/chat/completions";
  const apiKey = cfg.DEEPSEEK_API_KEY;

  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: "PolyNex-Instruct",
      stream: true,
      messages: [
        {
          role: "system",
           content: `
你是一名专业的信息梳理与内容分析助手，请对用户当前浏览的网页进行“结构化深度总结”。

请基于以下文本内容，完成一个全面、可靠、易读的页面理解报告：

【输出格式要求】
1. **页面总体概述（1-2 句话）**  
   - 网页是什么？目的是什么？

2. **核心内容要点（5～10 条）**  
   - 抽取最重要的信息，而不是只是摘抄。

3. **一句话总结（精炼版）**

【写作要求】  
- 完整性优先，确保用户不需要自己读网页也能理解其主要价值。
- 使用中文进行总结。
- 不要冗长，不要重复页面原文，用自己的话改写。
- 如文本中包含代码、命令、数字，请准确提取。
`			
        },
        {
          role: "user",
          content: `网页 URL：${url}\n\n网页正文：\n${pageText}`,
        },
      ],
    }),
  });

  if (!resp.ok) {
    port.postMessage({ error: "HTTP " + resp.status });
    port.disconnect();
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;

      const data = line.replace(/^data:\s*/, "");
      if (data === "[DONE]") {
        port.postMessage({ done: true });
        port.disconnect();
        return;
      }

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) port.postMessage({ delta });
      } catch {}
    }
  }

  port.postMessage({ done: true });
  port.disconnect();
}

// ================== Deepseek：字段建议 ==================
async function callDeepseekSuggestFields(text, url) {
  const configRes = await fetch(chrome.runtime.getURL("config.json"));
  const cfg = await configRes.json();

  const apiUrl = cfg.DEEPSEEK_API_URL + "/chat/completions";
  const apiKey = cfg.DEEPSEEK_API_KEY;

  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: "PolyNex-Instruct",
      stream: false,
      messages: [
        {
          role: "system",
                       content: `
你是一名结构化抽取的字段设计助手。

【任务】
1. 用户给你一段网页文本（可能来自列表中的若干条记录）。
2. 请你根据内容，提出可用于抽取的字段列表。
3. 每个字段包含：
   - name: 英文字段名，用小写+下划线
   - label: 字段含义的中文说明
   - type: 数据类型（string / number / date / boolean / object 等）
4. 如果无法确定，也可以只给出 name 和 label，type 填 "string"。

【输出格式】
只输出 JSON 数组，例如：
[
  {"name":"title","label":"标题","type":"string"},
  {"name":"price","label":"价格","type":"number"}
]
不要添加任何多余说明文字。`.trim(),
        },
        {
          role: "user",
          content: `网页 URL：${url}\n\n选区示例（包含 HTML 与可见文本；请特别关注 a[href], img[src] 等可抽取链接/图片字段）：\n${(text || "").slice(0, 8000)}`,
        },
      ],
    }),
  });

  if (!resp.ok) throw new Error("字段分析 HTTP 错误：" + resp.status);

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content?.trim() || "[]";

  const parsed = tryParseJsonContent(content);
  if (!Array.isArray(parsed)) throw new Error("字段建议返回的 JSON 不是数组");
  return parsed;
}

// ================== 点击扩展图标 → 注入 panel.js ==================
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["panel.js"],
  });
});
