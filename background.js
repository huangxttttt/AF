// background.js

let API_URL = null;

// 读取 config.json 里的 API_URL
function loadConfig() {
  return fetch(chrome.runtime.getURL("config.json"))
    .then(res => res.json())
    .then(cfg => {
      API_URL = cfg.API_URL;
      console.log("Loaded API_URL:", API_URL);
    })
    .catch(err => console.error("Failed to load config.json:", err));
}

function ensureApiUrlReady() {
  return API_URL
    ? Promise.resolve(API_URL)
    : loadConfig().then(() => API_URL);
}

// 初始化加载一次
loadConfig();

// 监听来自页面的消息（上传 body / 选中区域源码 / 结构化数据）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "UPLOAD_BODY_HTML") {
    const html = message.bodyHtml || "";
    const url = sender.tab && sender.tab.url ? sender.tab.url : "";
    const locator = message.locator || "";
    const selectionType = message.selectionType || "body";

    console.log("准备上传 html 到后端，url:", url, "selectionType:", selectionType);

    ensureApiUrlReady()
      .then((apiUrl) => {
        if (!apiUrl) {
          throw new Error("API_URL 未设置，请检查 config.json");
        }

        return fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            url,
            bodyHtml: html,
            locator,
            selectionType
          })
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

    // 异步响应
    return true;
  }
   // ⭐ 新增：自动巡检入口
  if (message.type === "AUTO_CRAWL_START") {
    const urls = Array.isArray(message.urls) ? message.urls : [];
    const tabId = sender.tab && sender.tab.id;

    if (!tabId) {
      sendResponse({ ok: false, error: "无法获取当前 tabId" });
      return false;
    }
    if (!urls.length) {
      sendResponse({ ok: false, error: "URL 列表为空" });
      return false;
    }

    console.log("收到自动巡检请求，tabId:", tabId, "urls:", urls);
    startAutoCrawl(tabId, urls);

    // 这里立即返回一个 OK，真正的巡检在后台慢慢跑
    sendResponse({ ok: true });
    return false;
  }
});

// ===== 自动巡检：依次打开子页面，抓取 HTML 后走现有上传逻辑 =====
function startAutoCrawl(tabId, urls) {
  let index = 0;

  // 先开一个专用的巡检 tab
  chrome.tabs.create({ url: "about:blank", active: false }, (crawlTab) => {
    const crawlTabId = crawlTab.id;

    function visitNext() {
      if (index >= urls.length) {
        console.log("自动巡检完成 ✅");
        // 巡检完了可以选择关掉这个 tab
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

            chrome.scripting.executeScript(
              {
                target: { tabId: crawlTabId },
                func: () => {
                  const html = document.body ? document.body.innerHTML : "";
                  chrome.runtime.sendMessage({
                    type: "UPLOAD_BODY_HTML",
                    bodyHtml: html,
                    locator: "",
                    selectionType: "auto-crawl"
                  });
                }
              },
              () => {
                if (chrome.runtime.lastError) {
                  console.error("executeScript 出错：", chrome.runtime.lastError);
                }
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



// 点击扩展图标时，往当前 tab 注入 panel.js
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files:  [
      "panel.js"
    ] 
  });
});
