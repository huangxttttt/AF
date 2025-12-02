// background.js

// ================== 配置相关：加载 config.json ==================
let API_URL = null;

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

function ensureApiUrlReady() {
  return API_URL ? Promise.resolve(API_URL) : loadConfig().then(() => API_URL);
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

  return false;
});

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
