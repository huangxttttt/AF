const messages = [
  "今天也是充满希望的一天！",
  "别放弃，你比自己想象得更厉害！",
  "保持微笑，生活会对你更温柔。",
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

      // 通用上传函数
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
            selectionType
          },
          (resp) => {
            console.log("上传结果：", resp);

            const bar = document.getElementById("random-demo-status-bar");
            if (!bar) return;

            if (resp && resp.ok) {
              bar.style.color = "#16a34a"; // 绿色
              bar.textContent = "上传成功 ✓";
            } else {
              bar.style.color = "#dc2626"; // 红色
              bar.textContent = "上传失败：" + (resp?.error || "未知错误");
            }
          }
        );
      }

      // ====== 用于保存当前页检测到的图片 / 表格数据 ======
      let detectedImages = [];
      let detectedTables = [];

      // ========= 选区高亮 & 自由选择相关 =========
      let selecting = false;           // 是否正在选择模式
      let lastHighlighted = null;      // 当前高亮元素
      let selectionTip = null;         // 顶部提示条
      let selectionStyle = null;       // 注入的样式
      let overlay = document.getElementById("random-demo-overlay");

      // 工具函数：在面板里显示一块文本（HTML / JSON）
      function showTextInPanel(text) {
        const box = document.getElementById("random-demo-box");
        if (!box) return;

        let pre = document.getElementById("random-demo-body-pre");
        if (!pre) {
          pre = document.createElement("pre");
          pre.id = "random-demo-body-pre";
          pre.style.whiteSpace = "pre-wrap";
          pre.style.textAlign = "left";
          pre.style.padding = "10px 12px";
          pre.style.background = "#f9fafb";
          pre.style.borderRadius = "10px";
          pre.style.maxHeight = "220px";
          pre.style.overflow = "auto";
          pre.style.fontSize = "11px";
          pre.style.lineHeight = "1.5";
          pre.style.border = "1px solid #e5e7eb";
          pre.style.marginTop = "4px";
          box.appendChild(pre);
        }
        pre.textContent = text;
      }

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
              outline: 2px solid #2563eb !important;
              cursor: crosshair !important;
              box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15) !important;
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
        const html = el.outerHTML;
        const locator = getCssSelector(el);

        console.log("选中元素 CSS：", locator);

        // 展示 HTML 到 overlay 面板中
        showTextInPanel(html);

        // 上传选中块
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
          selectionTip.style.background = "#2563eb";
          selectionTip.style.color = "#fff";
          selectionTip.style.padding = "8px 16px";
          selectionTip.style.fontSize = "14px";
          selectionTip.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
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

      // 根据 locator 选择器高亮元素
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

      // ===== 自动统计当前页的图片/表格，并在面板中展示数量 + 查看JSON/上传按钮 =====
      function detectAndRenderSummary() {
        // 收集图片（过滤掉太小的图标）
        detectedImages = [];
        const imgs = Array.from(document.images || []);
        imgs.forEach((img) => {
          const rect = img.getBoundingClientRect();
          const w = rect.width || img.naturalWidth || img.width;
          const h = rect.height || img.naturalHeight || img.height;

          if (w < 40 || h < 40) return; // 过滤小图标

          detectedImages.push({
            src: img.src,
            alt: img.alt || "",
            width: Math.round(w),
            height: Math.round(h),
            locator: getCssSelector(img)
          });
        });

        // 收集表格
        detectedTables = [];
        const tables = Array.from(document.querySelectorAll("table"));
        tables.forEach((table) => {
          const rows = Array.from(table.rows || []);
          if (rows.length === 0) return;

          const data = rows.map((row) =>
            Array.from(row.cells || []).map((cell) =>
              (cell.innerText || "").trim()
            )
          );

          // 非常小的 1x1 表可以按需过滤
          if (data.length <= 1 && data[0] && data[0].length <= 1) return;

          detectedTables.push({
            locator: getCssSelector(table),
            rowCount: data.length,
            colCount: data[0]?.length || 0,
            data
          });
        });

        // 在面板中渲染「数量 + 查看JSON + 上传按钮」
        const box = document.getElementById("random-demo-box");
        if (!box) return;

        let summaryEl = document.getElementById("random-demo-summary");
        if (!summaryEl) {
          summaryEl = document.createElement("div");
          summaryEl.id = "random-demo-summary";
          summaryEl.style.fontSize = "12px";
          summaryEl.style.color = "#374151";
          summaryEl.style.marginBottom = "8px";
          summaryEl.style.lineHeight = "1.8";
          summaryEl.style.padding = "8px 10px";
          summaryEl.style.background = "#f9fafb";
          summaryEl.style.borderRadius = "10px";
          summaryEl.style.border = "1px solid #e5e7eb";

          const textEl = document.getElementById("random-demo-text");
          if (textEl && textEl.nextSibling) {
            box.insertBefore(summaryEl, textEl.nextSibling);
          } else {
            box.insertBefore(summaryEl, box.firstChild);
          }
        } else {
          summaryEl.innerHTML = "";
        }

		  // ⭐ 新增：本页结构分析标题
		  const titleRow = document.createElement("div");
		  titleRow.textContent = "本页结构分析";
		  titleRow.style.fontSize = "12px";
		  titleRow.style.fontWeight = "600";
		  titleRow.style.color = "#111827";
		  titleRow.style.marginBottom = "6px";
		  titleRow.style.display = "flex";
		  titleRow.style.alignItems = "center";
		  titleRow.style.gap = "6px";

		  const dot = document.createElement("span");
		  dot.style.width = "6px";
		  dot.style.height = "6px";
		  dot.style.borderRadius = "999px";
		  dot.style.background = "#2563eb";
		  titleRow.insertBefore(dot, titleRow.firstChild);

		  summaryEl.appendChild(titleRow);
		  
        function createRow(label, type) {
          const row = document.createElement("div");
          row.style.display = "flex";
          row.style.alignItems = "center";
          row.style.justifyContent = "space-between";
          row.style.gap = "6px";
          row.style.marginBottom = "4px";

          const left = document.createElement("div");
          left.style.display = "flex";
          left.style.alignItems = "center";
          left.style.gap = "4px";

          const count =
            type === "images" ? detectedImages.length : detectedTables.length;

          const labelSpan = document.createElement("span");
          labelSpan.textContent = label;
          labelSpan.style.fontWeight = "500";
          labelSpan.style.color = "#111827";

          const badge = document.createElement("span");
          badge.textContent = String(count);
          badge.style.display = "inline-flex";
          badge.style.alignItems = "center";
          badge.style.justifyContent = "center";
          badge.style.minWidth = "20px";
          badge.style.padding = "0 6px";
          badge.style.fontSize = "11px";
          badge.style.borderRadius = "999px";
          badge.style.background = "#e5edff";
          badge.style.color = "#1d4ed8";

          left.appendChild(labelSpan);
          left.appendChild(badge);

          const actions = document.createElement("div");
          actions.style.display = "flex";
          actions.style.gap = "4px";

          const viewBtn = document.createElement("button");
          viewBtn.textContent = "查看JSON";
          viewBtn.style.padding = "2px 8px";
          viewBtn.style.fontSize = "11px";
          viewBtn.style.cursor = "pointer";
          viewBtn.style.borderRadius = "999px";
          viewBtn.style.border = "1px solid #d1d5db";
          viewBtn.style.background = "#ffffff";
          viewBtn.style.color = "#374151";

          const uploadBtn = document.createElement("button");
          uploadBtn.textContent = "上传";
          uploadBtn.style.padding = "2px 10px";
          uploadBtn.style.fontSize = "11px";
          uploadBtn.style.cursor = "pointer";
          uploadBtn.style.borderRadius = "999px";
          uploadBtn.style.border = "1px solid #2563eb";
          uploadBtn.style.background = "#2563eb";
          uploadBtn.style.color = "#ffffff";
          uploadBtn.style.display = "none"; // 初始隐藏

          // hover 效果（简单一点）
          viewBtn.addEventListener("mouseenter", () => {
            viewBtn.style.background = "#f3f4f6";
          });
          viewBtn.addEventListener("mouseleave", () => {
            viewBtn.style.background = "#ffffff";
          });
          uploadBtn.addEventListener("mouseenter", () => {
            uploadBtn.style.background = "#1d4ed8";
          });
          uploadBtn.addEventListener("mouseleave", () => {
            uploadBtn.style.background = "#2563eb";
          });

          // 查看 JSON：展示到面板，并显示上传按钮
          viewBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (type === "images") {
              if (!detectedImages.length) {
                alert("当前页没有符合条件的图片。");
                return;
              }
              showTextInPanel(JSON.stringify(detectedImages, null, 2));
            } else {
              if (!detectedTables.length) {
                alert("当前页没有表格。");
                return;
              }
              showTextInPanel(JSON.stringify(detectedTables, null, 2));
            }
            uploadBtn.style.display = "inline-block";
          });

          // 上传对应类型的数据
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
                images: detectedImages
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
                tables: detectedTables
              };
              selectionType = "detected-tables";
            }

            showTextInPanel(JSON.stringify(payload, null, 2));
            uploadHtml({
              html: JSON.stringify(payload),
              locator: "",
              selectionType
            });
          });

          actions.appendChild(viewBtn);
          actions.appendChild(uploadBtn);

          row.appendChild(left);
          row.appendChild(actions);

          return row;
        }

        summaryEl.appendChild(
          createRow("图片", "images")
        );
        summaryEl.appendChild(
          createRow("表格", "tables")
        );
      }

      // ============= 可拖动的小面板 overlay =============
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "random-demo-overlay";

        // 小面板本身
        overlay.style.position = "fixed";
        overlay.style.right = "24px";
        overlay.style.bottom = "24px";
        overlay.style.zIndex = "2147483646";
        overlay.style.backgroundColor = "rgba(255,255,255,0.96)";
        overlay.style.border = "1px solid #e5e7eb";
        overlay.style.borderRadius = "16px";
        overlay.style.boxShadow = "0 18px 45px rgba(15,23,42,0.22)";
        overlay.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        overlay.style.maxWidth = "380px";
        overlay.style.minWidth = "260px";
        overlay.style.maxHeight = "70vh";
        overlay.style.overflow = "hidden";
        overlay.style.display = "flex";
        overlay.style.flexDirection = "column";
        overlay.style.backdropFilter = "blur(10px)";

        // ==== 拖动区域（标题栏）====
        const header = document.createElement("div");
        header.style.cursor = "move";
        header.style.padding = "8px 14px";
        header.style.background = "#f9fafb";
        header.style.borderBottom = "1px solid #e5e7eb";
        header.style.display = "flex";
        header.style.alignItems = "center";
        header.style.justifyContent = "space-between";

        const title = document.createElement("span");
        title.textContent = "暗访页面助手";
        title.style.fontSize = "13px";
        title.style.fontWeight = "600";
        title.style.letterSpacing = "0.02em";
        title.style.color = "#111827";

        const miniClose = document.createElement("button");
        miniClose.textContent = "×";
        miniClose.style.border = "none";
        miniClose.style.background = "transparent";
        miniClose.style.cursor = "pointer";
        miniClose.style.fontSize = "16px";
        miniClose.style.lineHeight = "1";
        miniClose.style.color = "#9ca3af";
        miniClose.style.borderRadius = "999px";
        miniClose.style.width = "22px";
        miniClose.style.height = "22px";
        miniClose.addEventListener("mouseenter", () => {
          miniClose.style.background = "#e5e7eb";
          miniClose.style.color = "#4b5563";
        });
        miniClose.addEventListener("mouseleave", () => {
          miniClose.style.background = "transparent";
          miniClose.style.color = "#9ca3af";
        });
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
        box.style.padding = "10px 12px 8px 12px";
        box.style.overflow = "auto";
        box.style.maxHeight = "calc(70vh - 70px)"; // 扣掉头部和底部高度

        const textEl = document.createElement("div");
        textEl.id = "random-demo-text";
        textEl.style.marginBottom = "8px";
        textEl.style.fontSize = "14px";
        textEl.style.fontWeight = "500";
        textEl.style.color = "#111827";
        textEl.style.lineHeight = "1.5";
        box.appendChild(textEl);

        // locator 输入 + 高亮按钮
        const locatorWrap = document.createElement("div");
        locatorWrap.style.display = "flex";
        locatorWrap.style.gap = "8px";
        locatorWrap.style.marginBottom = "10px";
        locatorWrap.style.alignItems = "center";

        const locatorInput = document.createElement("input");
        locatorInput.type = "text";
        locatorInput.placeholder = "输入 CSS 选择器（locator）";
        locatorInput.style.flex = "1";
        locatorInput.style.padding = "6px 8px";
        locatorInput.style.borderRadius = "10px";
        locatorInput.style.border = "1px solid #e5e7eb";
        locatorInput.style.fontSize = "12px";
        locatorInput.style.outline = "none";
        locatorInput.style.background = "#f9fafb";

        locatorInput.addEventListener("focus", () => {
          locatorInput.style.borderColor = "#2563eb";
          locatorInput.style.boxShadow = "0 0 0 1px rgba(37,99,235,0.15)";
          locatorInput.style.background = "#ffffff";
        });
        locatorInput.addEventListener("blur", () => {
          locatorInput.style.borderColor = "#e5e7eb";
          locatorInput.style.boxShadow = "none";
          locatorInput.style.background = "#f9fafb";
        });

        const locatorBtn = document.createElement("button");
        locatorBtn.textContent = "高亮";
        locatorBtn.style.padding = "6px 12px";
        locatorBtn.style.cursor = "pointer";
        locatorBtn.style.borderRadius = "999px";
        locatorBtn.style.border = "1px solid #d1d5db";
        locatorBtn.style.fontSize = "12px";
        locatorBtn.style.background = "#ffffff";
        locatorBtn.style.color = "#374151";
        locatorBtn.addEventListener("mouseenter", () => {
          locatorBtn.style.background = "#f3f4f6";
        });
        locatorBtn.addEventListener("mouseleave", () => {
          locatorBtn.style.background = "#ffffff";
        });
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
        btnWrap.style.justifyContent = "flex-start";
        btnWrap.style.gap = "8px";
        btnWrap.style.marginBottom = "6px";
        box.appendChild(btnWrap);

        // 显示 & 上传 body 的按钮
        const showBodyBtn = document.createElement("button");
        showBodyBtn.textContent = "上传整个页面源码";
        showBodyBtn.style.padding = "6px 10px";
        showBodyBtn.style.cursor = "pointer";
        showBodyBtn.style.borderRadius = "999px";
        showBodyBtn.style.border = "1px solid #d1d5db";
        showBodyBtn.style.fontSize = "12px";
        showBodyBtn.style.background = "#ffffff";
        showBodyBtn.style.color = "#374151";
        showBodyBtn.addEventListener("mouseenter", () => {
          showBodyBtn.style.background = "#f3f4f6";
        });
        showBodyBtn.addEventListener("mouseleave", () => {
          showBodyBtn.style.background = "#ffffff";
        });

        showBodyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const html = document.body.innerHTML || "";
          showTextInPanel(html);
          uploadHtml({
            html,
            selectionType: "body"
          });
        });
        btnWrap.appendChild(showBodyBtn);

        // 自由选择页面区域按钮
        const selectAreaBtn = document.createElement("button");
        selectAreaBtn.textContent = "选择区域并上传";
        selectAreaBtn.style.padding = "6px 10px";
        selectAreaBtn.style.cursor = "pointer";
        selectAreaBtn.style.borderRadius = "999px";
        selectAreaBtn.style.border = "1px solid #2563eb";
        selectAreaBtn.style.fontSize = "12px";
        selectAreaBtn.style.background = "#2563eb";
        selectAreaBtn.style.color = "#ffffff";
        selectAreaBtn.addEventListener("mouseenter", () => {
          selectAreaBtn.style.background = "#1d4ed8";
        });
        selectAreaBtn.addEventListener("mouseleave", () => {
          selectAreaBtn.style.background = "#2563eb";
        });

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
        statusBar.style.color = "#6b7280";
        statusBar.style.textAlign = "left";
        statusBar.style.padding = "4px 12px 4px 12px";
        statusBar.style.minHeight = "20px";
        statusBar.style.borderTop = "1px solid #e5e7eb";
        statusBar.style.background = "#f9fafb";
        overlay.appendChild(statusBar);

        // ==== 作者小字 =====
        const author = document.createElement("div");
        author.textContent = "© 2025 by easymer's huangxiaotao";
        author.style.fontSize = "10px";
        author.style.color = "#9ca3af";
        author.style.textAlign = "center";
        author.style.padding = "4px 0 6px 0";
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

      // 每次点击图标：重新开始自动切换随机句子
      clearOldTimer();
      setRandomMessage();
      window.__random_demo_timer = setInterval(setRandomMessage, 3000);

      // 面板就绪后，自动统计当前页图片/表格数量并展示
      detectAndRenderSummary();

      // ===== 页面环境里的代码结束 =====
    },
    args: [messages]
  });
});
