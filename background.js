// background.js

// ================== 配置相关：加载 config.json ==================
let API_URL = null;
let cachedConfigPromise = null;

function loadConfig() {
  return fetch(chrome.runtime.getURL("config.json"))
    .then((res) => res.json())
    .then((cfg) => {
      API_URL = cfg.API_URL;
      console.log("Loaded API_URL:", API_URL);
    })
    .catch((err) => {
      console.error("Failed to load config.json:", err);
    });
}

function loadConfigJson() {
  if (!cachedConfigPromise) {
    cachedConfigPromise = fetch(chrome.runtime.getURL("config.json"))
      .then((res) => res.json())
      .catch((err) => {
        cachedConfigPromise = null;
        throw err;
      });
  }

  return cachedConfigPromise;
}

function ensureApiUrlReady() {
  return API_URL ? Promise.resolve(API_URL) : loadConfig().then(() => API_URL);
}

function withTimeout(promise, ms, errorMessage) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  const wrapped = promise(controller.signal)
    .finally(() => clearTimeout(timer))
    .catch((err) => {
      if (err?.name === "AbortError") {
        throw new Error(errorMessage || `请求超时（>${ms}ms）`);
      }
      throw err;
    });

  return wrapped;
}

function tryParseJsonContent(content) {
  const trimmed = (content || "").trim();

  if (!trimmed) return null;

  const cleaned = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/i, "");

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {}
    }
    console.error("JSON 解析失败，原始内容：", content);
    throw new Error("解析 JSON 失败：" + err.message);
  }
}

// 初始化加载一次
loadConfig();

// ================== 统一消息入口 ==================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1）普通上传（手动 / 自动巡检里发送的统一入口）
  if (message.type === "UPLOAD_BODY_HTML") {
    const html = message.bodyHtml || "";
    const url = sender.tab && sender.tab.url ? sender.tab.url : "";
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
        if (!apiUrl) {
          throw new Error("API_URL 未设置，请检查 config.json");
        }

        return fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
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

        if (!res.ok) {
          sendResponse({ ok: false, status: res.status, body: data });
        } else {
          sendResponse({ ok: true, status: res.status, body: data });
        }
      })
      .catch((err) => {
        console.error("上传失败：", err);
        sendResponse({ ok: false, error: String(err) });
      });

    // 异步回调
    return true;
  }

  // 2）自动巡检入口：Tab2 发过来的命令
  if (message.type === "AUTO_CRAWL_START") {
    const urls = Array.isArray(message.urls) ? message.urls : [];
    const cssSelector = (message.cssSelector || "").trim();
    const tabId = sender.tab && sender.tab.id;

    if (!tabId) {
      sendResponse({ ok: false, error: "无法获取当前 tabId" });
      return false;
    }
    if (!urls.length) {
      sendResponse({ ok: false, error: "URL 列表为空" });
      return false;
    }

    console.log(
      "收到自动巡检请求，当前 tabId:",
      tabId,
      "urls:",
      urls,
      "selector:",
      cssSelector
    );

    // 使用“新标签页巡检”，不打扰当前页
    startAutoCrawlInNewTab(tabId, urls, cssSelector);

    sendResponse({ ok: true });
    return false;
  }
  
  
    // 3）AI 字段分析（前端结构化抽取使用）
  if (message.type === "AI_SUGGEST_FIELDS") {
    const text = message.text || "";
    const url = message.url || "";

    (async () => {
      try {
        const fields = await callDeepseekSuggestFields(text, url);
        sendResponse({ ok: true, fields });
      } catch (err) {
        console.error("AI_SUGGEST_FIELDS 调用失败：", err);
        sendResponse({ ok: false, error: String(err) });
      }
    })();

    return true; // 异步
  }

  // 4）AI 结构化抽取（前端结构化抽取使用）
  if (message.type === "AI_EXTRACT_STRUCTURED") {
    const text = message.text || "";
    const url = message.url || "";
    const mode = message.mode || "single";
    const fields = Array.isArray(message.fields) ? message.fields : [];

    (async () => {
      try {
        const data = await callDeepseekExtractStructured(
          text,
          url,
          mode,
          fields
        );
        sendResponse({ ok: true, data });
      } catch (err) {
        console.error("AI_EXTRACT_STRUCTURED 调用失败：", err);
        sendResponse({ ok: false, error: String(err) });
      }
    })();

    return true; // 异步
  }

  return false;
});

chrome.runtime.onConnect.addListener((port) => {
  console.log("[background] onConnect:", port.name);

  // ---- AI 总结通道（保持原来的逻辑）----
  if (port.name === "ai-stream") {
    console.log("[background] ai-stream connected");

    port.onMessage.addListener((msg) => {
      if (!msg || msg.type !== "START_AI_SUMMARY") return;

      const pageText = msg.pageText || "";
      const url = msg.url || "";

      console.log("[background] START_AI_SUMMARY 收到，url:", url);

      callDeepseekSummaryStream(pageText, url, port).catch((err) => {
        console.error("callDeepseekSummaryStream 出错：", err);
        try {
          port.postMessage({ error: String(err) });
        } catch {}
        try {
          port.disconnect();
        } catch {}
      });
    });

    return;
  }

  // ---- 新增：自动翻译通道 ----
  if (port.name === "ai-auto-translate") {
    console.log("[background] ai-auto-translate connected");

    port.onMessage.addListener((msg) => {
      if (!msg || msg.type !== "TRANSLATE_BLOCK") return;

      const text = msg.text || "";
      const url = msg.url || "";

      console.log("[background] TRANSLATE_BLOCK 收到，url:", url);

      callDeepseekTranslateStream(text, url, port).catch((err) => {
        console.error("callDeepseekTranslateStream 出错：", err);
        try {
          port.postMessage({ error: String(err) });
        } catch {}
        try {
          port.disconnect();
        } catch {}
      });
    });

    return;
  }
});

async function callDeepseekTranslateStream(blockText, url, port) {
  const configRes = await fetch(chrome.runtime.getURL("config.json"));
  const cfg = await configRes.json();

  const apiUrl = cfg.DEEPSEEK_API_URL + "/chat/completions";
  const apiKey = cfg.DEEPSEEK_API_KEY;

  const MAX_LEN = 4000;
  const text = (blockText || "").replace(/\s+/g, " ").slice(0, MAX_LEN);

  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey,
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
          content: `来自网页：${url}\n\n需要翻译的内容：\n${text}`,
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

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n").filter((l) => l.trim().startsWith("data:"));

    for (const line of lines) {
      const data = line.replace(/^data:\s*/, "");
      if (data === "[DONE]") {
        port.postMessage({ done: true });
        port.disconnect();
        return;
      }
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          port.postMessage({ delta });
        }
      } catch (e) {
        console.warn("翻译流 JSON 解析失败：", e, data);
      }
    }
  }

  port.postMessage({ done: true });
  port.disconnect();
}


async function callDeepseekSummaryStream(pageText, url, port) {
  const configRes = await fetch(chrome.runtime.getURL("config.json"));
  const cfg = await configRes.json();

  const apiUrl = cfg.DEEPSEEK_API_URL + "/chat/completions";
  const apiKey = cfg.DEEPSEEK_API_KEY;

  // 取文本
  const MAX_LEN = 12000;
  const text = pageText.replace(/\s+/g, " ").slice(0, MAX_LEN);

  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
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
          content: `网页：${url}\n\n主要内容：${text}`
        }
      ]
    })
  });

  if (!resp.ok) {
    port.postMessage({ error: "HTTP "+resp.status });
    port.disconnect();
    return;
  }

  // --- 流式读取 ---
  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });

    // 解析每一行 "data:"
    const lines = chunk.split("\n").filter(l => l.trim().startsWith("data:"));

    for (const line of lines) {
      const data = line.replace(/^data:\s*/, "");
      if (data === "[DONE]") {
        port.postMessage({ done: true });
        port.disconnect();
        return;
      }
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          port.postMessage({ delta });
        }
      } catch (e) {
        console.warn("流 JSON 解析失败：", e, data);
      }
    }
  }

  port.postMessage({ done: true });
  port.disconnect();
}

async function callDeepseekSuggestFields(text, url) {
  const cfg = await loadConfigJson();

  const apiUrl = cfg.DEEPSEEK_API_URL + "/chat/completions";
  const apiKey = cfg.DEEPSEEK_API_KEY;

  const MAX_LEN = 4000;
  const clean = (text || "").replace(/\s+/g, " ").slice(0, MAX_LEN);

  const resp = await withTimeout(
    (signal) =>
      fetch(apiUrl, {
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
              content: `网页 URL：${url}\n\n选区文本示例：\n${clean}`,
            },
          ],
        }),
        signal,
      }),
    20000,
    "字段分析请求超时"
  );

  if (!resp.ok) {
    throw new Error("字段分析 HTTP 错误：" + resp.status);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content?.trim() || "[]";

  const json = tryParseJsonContent(content);
  if (!Array.isArray(json)) {
    throw new Error("返回内容不是数组");
  }

  return json;
}

async function callDeepseekExtractStructured(text, url, mode, fields) {
  const cfg = await loadConfigJson();

  const apiUrl = cfg.DEEPSEEK_API_URL + "/chat/completions";
  const apiKey = cfg.DEEPSEEK_API_KEY;

  const MAX_LEN = 12000;
  const clean = (text || "").replace(/\s+/g, " ").slice(0, MAX_LEN);

  const fieldsDesc = JSON.stringify(fields || [], null, 2);

  if (!fields?.length) {
    throw new Error("字段列表为空，无法进行结构化抽取");
  }

  const resp = await withTimeout(
    (signal) =>
      fetch(apiUrl, {
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
你是一名网页信息抽取助手。

【任务】
1. 用户提供一段来自网页的文本（可能包含多条记录）。
2. 用户还提供一个字段列表（JSON 数组），每个字段包含 name/label/type。
3. 你需要根据字段列表，从文本中抽取结构化数据。

【输出要求】
- 如果 mode = "single"，只返回一个 JSON 对象。
- 如果 mode = "list"，返回一个 JSON 数组，数组中每个元素是一个对象，对应一条记录。
- key 必须严格使用字段的 name。
- 字段缺失时用 null。
- 不要额外添加未在字段列表中的字段。
- 只输出 JSON（对象或数组），不要包含任何说明文字。`.trim(),
            },
            {
              role: "user",
              content: `
网页 URL：${url}
mode: ${mode}
字段定义（JSON 数组）：
${fieldsDesc}

以下是待抽取的文本（可能包含多条记录）：
${clean}
          `.trim(),
            },
          ],
        }),
        signal,
      }),
    25000,
    "结构化抽取请求超时"
  );

  if (!resp.ok) {
    throw new Error("结构化抽取 HTTP 错误：" + resp.status);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content?.trim() || "";

  const json = tryParseJsonContent(content);
  return json;
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
        // 你想自动关掉巡检 tab 的话可以解除注释：
        // chrome.tabs.remove(crawlTabId);
        return;
      }

      const url = urls[index++];
      console.log(`自动巡检：准备打开第 ${index} 个页面：`, url);

      chrome.tabs.update(crawlTabId, { url }, () => {
        if (chrome.runtime.lastError) {
          console.warn("tabs.update 出错，跳过该页面：", chrome.runtime.lastError);
          setTimeout(visitNext, 1000);
          return;
        }

        function handleUpdated(updatedTabId, changeInfo, updatedTab) {
          if (updatedTabId === crawlTabId && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(handleUpdated);

            // 页面加载完成之后注入脚本，按 CSS 选择器抓取
            chrome.scripting.executeScript(
              {
                target: { tabId: crawlTabId },
                func: ({ selector }) => {
                  let html = "";
                  let locator = selector || "";

                  if (selector && selector.trim()) {
                    let nodes = [];
                    try {
                      nodes = Array.from(
                        document.querySelectorAll(selector)
                      );
                    } catch (err) {
                      console.warn(
                        "自动巡检 selector 解析失败：",
                        selector,
                        err
                      );
                    }

                    if (nodes.length) {
                      html = nodes
                        .map((el) => el.outerHTML)
                        .join("\n<!-- AUTO-CRAWL-SPLIT -->\n");
                    } else {
                      console.warn(
                        "selector 未匹配到任何元素，退回 body.innerHTML"
                      );
                      html = document.body ? document.body.innerHTML : "";
                      locator = "";
                    }
                  } else {
                    // 没有 selector，默认抓整页
                    html = document.body ? document.body.innerHTML : "";
                    locator = "";
                  }

                  chrome.runtime.sendMessage({
                    type: "UPLOAD_BODY_HTML",
                    bodyHtml: html,
                    locator,
                    selectionType: selector
                      ? "auto-crawl-selector"
                      : "auto-crawl",
                  });
                },
                args: [{ selector: cssSelector }],
              },
              () => {
                if (chrome.runtime.lastError) {
                  console.error(
                    "executeScript 出错：",
                    chrome.runtime.lastError
                  );
                }
                // 等一会儿，避免请求太密
                setTimeout(visitNext, 1500);
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

// ================== 点击扩展图标 → 注入 panel.js ==================
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["panel.js"],
  });
});
