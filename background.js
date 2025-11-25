
const messages = [
  "今天也是充满希望的一天！",
  "别放弃，你比自己想象得更厉害！",
  "保持微笑，生活会对你更温柔。",
  "努力不一定成功，但不努力一定很轻松（笑）。",
  "世界那么大，开心一点不亏！",
  "越自律，越自由！"
];

let API_URL = null;

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

// 初始化加载
loadConfig();

// 监听来自页面的消息（上传 body / 选中区域源码）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "UPLOAD_BODY_HTML") {
    const html = message.bodyHtml || "";
    const url = sender.tab && sender.tab.url ? sender.tab.url : "";
    const locator = message.locator || "";                 // 元素定位信息（CSS 选择器）
    const selectionType = message.selectionType || "body"; // "body" | "element"

    console.log("准备上传 html 到后端，url:", url, "selectionType:", selectionType);

    fetch(API_URL, {
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
    })
      .then(async (res) => {
        const data = await res.text().catch(() => "");
        console.log("后端响应：", res.status, data);
        sendResponse({ ok: true, status: res.status, body: data });
      })
      .catch((err) => {
        console.error("上传失败：", err);
        sendResponse({ ok: false, error: String(err) });
      });

    // 异步响应
    return true;
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (msgs) => {
      // ===== 页面环境里的代码开始 =====

      // 停止旧的定时器
      function clearOldTimer() {
        if (window.__random_demo_timer) {
          clearInterval(window.__random_demo_timer);
          window.__random_demo_timer = null;
        }
      }

      // 设置随机一句话
      function setRandomMessage() {
        const textEl = document.getElementById("random-demo-text");
        if (textEl && Array.isArray(msgs) && msgs.length > 0) {
          const random = msgs[Math.floor(Math.random() * msgs.length)];
          textEl.textContent = random;
        }
      }

      // 通用上传函数（body 或 选中元素）
     function uploadHtml({ html, locator = "", selectionType = "body" }) {
	  const statusBar = document.getElementById("random-demo-status-bar");
	  if (statusBar) {
		statusBar.style.color = "#888";
		statusBar.textContent = "正在上传…";
	  }

	  chrome.runtime.sendMessage(
		{
		  type: "UPLOAD_BODY_HTML",
		  bodyHtml: html,
		  locator,
		  selectionType
		},
		(resp) => {
		  console.log("上传结果：", resp);

		  if (!statusBar) return;

		  if (resp && resp.ok) {
			statusBar.style.color = "#0a0"; // 绿色
			statusBar.textContent = "上传成功 ✓";
		  } else {
			statusBar.style.color = "#c00"; // 红色
			statusBar.textContent = "上传失败：" + (resp?.error || "未知错误");
		  }
		}
	  );
	}

      // ========= 选区高亮 & 自由选择相关 =========

      let selecting = false;           // 是否正在选择模式
      let lastHighlighted = null;      // 当前高亮元素
      let selectionTip = null;         // 顶部提示条
      let selectionStyle = null;       // 注入的样式
      let overlay = document.getElementById("random-demo-overlay");

      // 简单生成一个 CSS 选择器（用于后端以后复用）
      function getCssSelector(el) {
        if (!(el instanceof Element)) return "";
        const path = [];

        while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement) {
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

      // 确保高亮样式已注入（给选择模式和 locator 高亮共用）
      function ensureHighlightStyle() {
        if (!selectionStyle) {
          selectionStyle = document.createElement("style");
          selectionStyle.textContent = `
            .__llm_block_highlight {
              outline: 2px solid #00aaff !important;
              cursor: crosshair !important;
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
        // 不高亮我们自己的 overlay 和提示条
        if (overlay && overlay.contains(target)) return;
        if (selectionTip && selectionTip.contains(target)) return;
        highlightElement(target);
      }

	  function handleClick(e) {
		  if (!selecting) return;
		  const target = e.target;

		  // 避免点击到我们自己的 panel
		  if (overlay && overlay.contains(target)) return;
		  if (selectionTip && selectionTip.contains(target)) return;

		  e.preventDefault();
		  e.stopPropagation();

		  const el = target;

		  // 你可以改成 el.innerHTML
		  const html = el.outerHTML;
		  const locator = getCssSelector(el);
		  
		  console.log("选中元素 CSS：", locator);

		  // ======= ⬇️ 展示 HTML 到 overlay 面板中（新增） =======
		const box = document.getElementById("random-demo-box");
		let pre = document.getElementById("random-demo-body-pre");
		if (!pre) {
		  pre = document.createElement("pre");
		  pre.id = "random-demo-body-pre";
		  pre.style.whiteSpace = "pre-wrap";
		  pre.style.textAlign = "left";
		  pre.style.padding = "8px";
		  pre.style.background = "#f0f0f0";
		  pre.style.borderRadius = "6px";
		  pre.style.maxHeight = "200px";
		  pre.style.overflow = "auto";
		  pre.style.fontSize = "11px";
		  pre.textContent = html;
		  box.appendChild(pre);
		} else {
		  pre.textContent = html;
		}
		  // ======= 上传选中块 =======
		  uploadHtml({
			html,
			locator,
			selectionType: "element"
		  });

		  // 恢复 panel（显示）
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

        // 隐藏弹窗，让用户可以点到页面元素
        if (overlay) {
          overlay.style.display = "none";
        }

        // 注入高亮样式
        ensureHighlightStyle();

        // 顶部提示条
        if (!selectionTip) {
          selectionTip = document.createElement("div");
          selectionTip.textContent = "选择模式：鼠标移动高亮元素，点击选择该区域，按 ESC 取消";
          selectionTip.style.position = "fixed";
          selectionTip.style.top = "0";
          selectionTip.style.left = "0";
          selectionTip.style.right = "0";
          selectionTip.style.zIndex = "999999";
          selectionTip.style.background = "#00aaff";
          selectionTip.style.color = "#fff";
          selectionTip.style.padding = "6px 12px";
          selectionTip.style.fontSize = "14px";
          selectionTip.style.fontFamily = "Arial, sans-serif";
          selectionTip.style.textAlign = "center";
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

      // === 新增：根据 locator 选择器高亮元素 ===
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

        highlightElement(el);
        // 把元素滚动到视图中间
        try {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch {
          el.scrollIntoView();
        }
      }

		// ============= 可拖动的小面板 overlay =============
		if (!overlay) {
		overlay = document.createElement("div");
		overlay.id = "random-demo-overlay";

		// 小面板本身
		overlay.style.position = "fixed";
		overlay.style.right = "20px";
		overlay.style.bottom = "20px";
		overlay.style.zIndex = "999998";
		overlay.style.backgroundColor = "white";
		overlay.style.border = "1px solid #ddd";
		overlay.style.borderRadius = "10px";
		overlay.style.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.2)";
		overlay.style.fontFamily = "Arial, sans-serif";
		overlay.style.maxWidth = "360px";
		overlay.style.minWidth = "260px";
		overlay.style.maxHeight = "70vh";
		overlay.style.overflow = "hidden";
		overlay.style.display = "flex";
		overlay.style.flexDirection = "column";

		// ==== 拖动区域（标题栏）====
		const header = document.createElement("div");
		header.style.cursor = "move";
		header.style.padding = "6px 10px";
		header.style.background = "#f5f5f5";
		header.style.borderBottom = "1px solid #eee";
		header.style.display = "flex";
		header.style.alignItems = "center";
		header.style.justifyContent = "space-between";

		const title = document.createElement("span");
		title.textContent = "暗访者页面助手";
		title.style.fontSize = "13px";
		title.style.color = "#333";

		const miniClose = document.createElement("button");
		miniClose.textContent = "×";
		miniClose.style.border = "none";
		miniClose.style.background = "transparent";
		miniClose.style.cursor = "pointer";
		miniClose.style.fontSize = "16px";
		miniClose.style.lineHeight = "1";
		miniClose.style.color = "#666";
		miniClose.addEventListener("click", (e) => {
		e.stopPropagation();
		clearOldTimer();
		stopSelectionMode(false);
		overlay.remove();
		});

		header.appendChild(title);
		header.appendChild(miniClose);
		overlay.appendChild(header);

		// ==== 内容区域 ====
		const box = document.createElement("div");
		box.id = "random-demo-box";
		box.style.padding = "10px 12px";
		box.style.overflow = "auto";
		box.style.maxHeight = "calc(70vh - 40px)"; // 扣掉头部高度

		const textEl = document.createElement("div");
		textEl.id = "random-demo-text";
		textEl.style.marginBottom = "10px";
		textEl.style.fontSize = "15px";
		textEl.style.color = "#333";
		box.appendChild(textEl);

		// locator 输入 + 高亮按钮（保持你上一个版本的逻辑）
		const locatorWrap = document.createElement("div");
		locatorWrap.style.display = "flex";
		locatorWrap.style.gap = "8px";
		locatorWrap.style.marginBottom = "10px";
		locatorWrap.style.alignItems = "center";

		const locatorInput = document.createElement("input");
		locatorInput.type = "text";
		locatorInput.placeholder = "输入 CSS 选择器（locator）";
		locatorInput.style.flex = "1";
		locatorInput.style.padding = "4px 8px";
		locatorInput.style.borderRadius = "6px";
		locatorInput.style.border = "1px solid #ccc";
		locatorInput.style.fontSize = "12px";

		const locatorBtn = document.createElement("button");
		locatorBtn.textContent = "高亮";
		locatorBtn.style.padding = "4px 10px";
		locatorBtn.style.cursor = "pointer";
		locatorBtn.style.borderRadius = "6px";
		locatorBtn.style.border = "1px solid #ccc";
		locatorBtn.style.fontSize = "12px";
		locatorBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		highlightByLocator(locatorInput.value);
		});

		locatorWrap.appendChild(locatorInput);
		locatorWrap.appendChild(locatorBtn);
		box.appendChild(locatorWrap);

		// 按钮区域
		const btnWrap = document.createElement("div");
		btnWrap.style.display = "flex";
		btnWrap.style.flexWrap = "wrap";
		btnWrap.style.justifyContent = "center";
		btnWrap.style.gap = "8px";
		btnWrap.style.marginBottom = "10px";
		box.appendChild(btnWrap);

		// 显示 & 上传 body 的按钮
		const showBodyBtn = document.createElement("button");
		showBodyBtn.textContent = "显示并上传 body 源代码";
		showBodyBtn.style.padding = "6px 10px";
		showBodyBtn.style.cursor = "pointer";
		showBodyBtn.style.borderRadius = "6px";
		showBodyBtn.style.border = "1px solid #ccc";
		showBodyBtn.style.fontSize = "12px";

		showBodyBtn.addEventListener("click", (e) => {
		e.stopPropagation();

		let pre = document.getElementById("random-demo-body-pre");
		if (!pre) {
		  pre = document.createElement("pre");
		  pre.id = "random-demo-body-pre";
		  pre.style.whiteSpace = "pre-wrap";
		  pre.style.textAlign = "left";
		  pre.style.padding = "8px";
		  pre.style.background = "#f0f0f0";
		  pre.style.borderRadius = "6px";
		  pre.style.maxHeight = "200px";
		  pre.style.overflow = "auto";
		  pre.style.fontSize = "11px";
		  pre.textContent = document.body.innerHTML;
		  box.appendChild(pre);
		} else {
		  pre.textContent = document.body.innerHTML;
		}

		uploadHtml({
		  html: document.body.innerHTML || "",
		  selectionType: "body"
		});
		});
		btnWrap.appendChild(showBodyBtn);

		// 自由选择页面区域按钮
		const selectAreaBtn = document.createElement("button");
		selectAreaBtn.textContent = "选择页面某一块并上传";
		selectAreaBtn.style.padding = "6px 10px";
		selectAreaBtn.style.cursor = "pointer";
		selectAreaBtn.style.borderRadius = "6px";
		selectAreaBtn.style.border = "1px solid #ccc";
		selectAreaBtn.style.fontSize = "12px";

		selectAreaBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		startSelectionMode();
		});
		btnWrap.appendChild(selectAreaBtn);

		// 把内容区域挂到 overlay 上
		overlay.appendChild(box);
		
		// ==== 上传状态提示栏 ====
		const statusBar = document.createElement("div");
		statusBar.id = "random-demo-status-bar";
		statusBar.style.fontSize = "12px";
		statusBar.style.color = "#666";
		statusBar.style.textAlign = "center";
		statusBar.style.padding = "4px 8px 6px 8px";
		statusBar.style.minHeight = "20px"; // 防止空时跳动
		statusBar.style.userSelect = "none";
		overlay.appendChild(statusBar);
		// ==== 作者小字 =====
		const author = document.createElement("div");
		author.textContent = "© 2025 by easymer‘s huangxiaotao";  // 换成你的名字
		author.style.fontSize = "10px";
		author.style.color = "#888";
		author.style.textAlign = "center";
		author.style.padding = "6px 0 4px 0";
		author.style.borderTop = "1px solid #eee";

		overlay.appendChild(author);
		
		document.body.appendChild(overlay);

		// ==== 实现拖动逻辑 ====
		let isDragging = false;
		let startX = 0;
		let startY = 0;
		let startLeft = 0;
		let startTop = 0;

		header.addEventListener("mousedown", (e) => {
		e.preventDefault();
		isDragging = true;
		// 把 right/bottom 转成具体的 left/top 方便拖动
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

		// 每次点击图标：重新开始自动切换
		clearOldTimer();
		setRandomMessage();
		window.__random_demo_timer = setInterval(setRandomMessage, 3000);

      // ===== 页面环境里的代码结束 =====
    },
    args: [messages]
  });
});
