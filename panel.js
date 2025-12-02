// panel.js：运行在页面里的脚本，负责小面板 UI + 选区等
(() => {
  // 以前在 background 里的 messages，移到这里来
  const messages = [
    "今天也是充满希望的一天！",
    "别放弃，你比自己想象得更厉害！",
    "保持微笑，生活会对你更温柔。",
    "世界那么大，开心一点不亏！",
    "越自律，越自由！"
  ];

  // ======== 全局状态变量（本脚本内部） ========
  let detectedImages = [];
  let detectedTables = [];

  let selecting = false;        // 是否正在选择模式
  let lastHighlighted = null;   // 当前高亮元素
  let selectionTip = null;      // 顶部提示条
  let selectionStyle = null;    // 注入的样式
  let overlay = document.getElementById("random-demo-overlay");

  // ================== 定时器 / 随机文案 ==================
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

  // ================== 上传到后台 ==================
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

  // ================== 工具函数：在面板里显示文本 ==================
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

  // ================== 生成 CSS 选择器 ==================
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

  // ================== 选区高亮 & 自由选择相关 ==================
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
      selectionTip.style.fontFamily =
        "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
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

  // ================== 自动统计图片 / 表格并渲染到面板 ==================
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

    // 在面板中渲染
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

    // ⭐ 标题
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
      uploadBtn.style.display = "none";

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

    summaryEl.appendChild(createRow("图片", "images"));
    summaryEl.appendChild(createRow("表格", "tables"));
  }

  // ================== 创建面板 overlay + 页签 ==================
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
    overlay.style.fontFamily =
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
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

    // ========= 菜单栏式 Tab（在标题下方） =========
    const tabBar = document.createElement("div");
    tabBar.style.display = "flex";
    tabBar.style.alignItems = "stretch";
    tabBar.style.gap = "16px";
    tabBar.style.padding = "0 12px";
    tabBar.style.borderBottom = "1px solid #e5e7eb";
    tabBar.style.background = "#f9fafb";

    function createTabItem(text, tabName, isActive) {
      const item = document.createElement("div");
      item.textContent = text;
      item.dataset.tab = tabName;
      item.className = "random-demo-tab-item";
      item.style.fontSize = "12px";
      item.style.padding = "8px 0";
      item.style.cursor = "pointer";
      item.style.userSelect = "none";
      item.style.whiteSpace = "nowrap";

      if (isActive) {
        item.style.color = "#2563eb";
        item.style.borderBottom = "2px solid #2563eb";
        item.classList.add("active");
      } else {
        item.style.color = "#6b7280";
        item.style.borderBottom = "2px solid transparent";
      }

      item.addEventListener("mouseenter", () => {
        if (!item.classList.contains("active")) {
          item.style.color = "#374151";
        }
      });
      item.addEventListener("mouseleave", () => {
        if (!item.classList.contains("active")) {
          item.style.color = "#6b7280";
        }
      });

      return item;
    }

    // tab1：现有功能
    const tabMain = createTabItem("元素获取", "main", true);
    // tab2：预留页
    const tabExtra = createTabItem("自动巡检", "extra", false);

    tabBar.appendChild(tabMain);
    tabBar.appendChild(tabExtra);
    overlay.appendChild(tabBar);

    // ========= 内容区域容器 =========
    const contentWrapper = document.createElement("div");
    contentWrapper.style.flex = "1";
    contentWrapper.style.overflow = "hidden";

    // ==== Tab1 内容：原来的 random-demo-box ====
    const box = document.createElement("div");
    box.id = "random-demo-box";
    box.style.padding = "10px 12px 8px 12px";
    box.style.overflow = "auto";
    box.style.maxHeight = "calc(70vh - 70px)";

    // 随机文案
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

    // 按钮区域（上传整页 / 选择区域）
    const btnWrap = document.createElement("div");
    btnWrap.style.display = "flex";
    btnWrap.style.flexWrap = "wrap";
    btnWrap.style.justifyContent = "flex-start";
    btnWrap.style.gap = "8px";
    btnWrap.style.marginBottom = "6px";
    box.appendChild(btnWrap);

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
      uploadHtml({ html, selectionType: "body" });
    });
    btnWrap.appendChild(showBodyBtn);

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

    // ==== Tab2 内容：预留给新功能 ====
// ==== Tab2 内容：自动巡检子页面 ====
const extraBox = document.createElement("div");
extraBox.id = "random-demo-box-extra";
extraBox.style.padding = "10px 12px 8px 12px";
extraBox.style.overflow = "auto";
extraBox.style.maxHeight = "calc(70vh - 70px)";
extraBox.style.display = "none"; // 默认隐藏

// 标题
const crawlTitle = document.createElement("div");
crawlTitle.textContent = "自动巡检子页面";
crawlTitle.style.fontSize = "14px";
crawlTitle.style.fontWeight = "600";
crawlTitle.style.color = "#111827";
crawlTitle.style.marginBottom = "8px";
extraBox.appendChild(crawlTitle);

// 小说明
const crawlDesc = document.createElement("div");
crawlDesc.textContent = "说明：登录好当前系统后，在下面输入需要巡检的子页面 URL（每行一个），然后点击开始巡检。插件会依次打开这些页面并上传页面 HTML 到后端。";
crawlDesc.style.fontSize = "12px";
crawlDesc.style.color = "#4b5563";
crawlDesc.style.lineHeight = "1.6";
crawlDesc.style.marginBottom = "10px";
extraBox.appendChild(crawlDesc);

// 文本输入框
const urlTextarea = document.createElement("textarea");
urlTextarea.placeholder = "例如：\nhttps://xxx.com/page1\nhttps://xxx.com/page2\n/user/list\n/report/detail?id=1";
urlTextarea.style.width = "100%";
urlTextarea.style.minHeight = "120px";
urlTextarea.style.padding = "8px 10px";
urlTextarea.style.borderRadius = "10px";
urlTextarea.style.border = "1px solid #e5e7eb";
urlTextarea.style.fontSize = "12px";
urlTextarea.style.fontFamily = "monospace";
urlTextarea.style.boxSizing = "border-box";
urlTextarea.style.marginBottom = "8px";
extraBox.appendChild(urlTextarea);

// 基础 URL（用于相对地址）
const baseUrlWrap = document.createElement("div");
baseUrlWrap.style.display = "flex";
baseUrlWrap.style.alignItems = "center";
baseUrlWrap.style.gap = "6px";
baseUrlWrap.style.marginBottom = "8px";

const baseUrlLabel = document.createElement("span");
baseUrlLabel.textContent = "基础域名（可选）：";
baseUrlLabel.style.fontSize = "12px";
baseUrlLabel.style.color = "#4b5563";

const baseUrlInput = document.createElement("input");
baseUrlInput.type = "text";
baseUrlInput.placeholder = "例如：https://xxx.com（不填则默认用当前页面域名）";
baseUrlInput.style.flex = "1";
baseUrlInput.style.padding = "6px 8px";
baseUrlInput.style.borderRadius = "10px";
baseUrlInput.style.border = "1px solid #e5e7eb";
baseUrlInput.style.fontSize = "12px";
baseUrlInput.style.outline = "none";
baseUrlInput.style.background = "#f9fafb";

baseUrlInput.addEventListener("focus", () => {
  baseUrlInput.style.borderColor = "#2563eb";
  baseUrlInput.style.boxShadow = "0 0 0 1px rgba(37,99,235,0.15)";
  baseUrlInput.style.background = "#ffffff";
});
baseUrlInput.addEventListener("blur", () => {
  baseUrlInput.style.borderColor = "#e5e7eb";
  baseUrlInput.style.boxShadow = "none";
  baseUrlInput.style.background = "#f9fafb";
});

baseUrlWrap.appendChild(baseUrlLabel);
baseUrlWrap.appendChild(baseUrlInput);
extraBox.appendChild(baseUrlWrap);

// 按钮区域
const crawlBtnRow = document.createElement("div");
crawlBtnRow.style.display = "flex";
crawlBtnRow.style.gap = "8px";
crawlBtnRow.style.alignItems = "center";
crawlBtnRow.style.marginTop = "4px";
extraBox.appendChild(crawlBtnRow);

const startCrawlBtn = document.createElement("button");
startCrawlBtn.textContent = "开始巡检";
startCrawlBtn.style.padding = "6px 12px";
startCrawlBtn.style.cursor = "pointer";
startCrawlBtn.style.borderRadius = "999px";
startCrawlBtn.style.border = "1px solid #2563eb";
startCrawlBtn.style.fontSize = "12px";
startCrawlBtn.style.background = "#2563eb";
startCrawlBtn.style.color = "#ffffff";
startCrawlBtn.addEventListener("mouseenter", () => {
  startCrawlBtn.style.background = "#1d4ed8";
});
startCrawlBtn.addEventListener("mouseleave", () => {
  startCrawlBtn.style.background = "#2563eb";
});

const stopHint = document.createElement("span");
stopHint.textContent = "巡检过程中你可以随时关闭面板，不影响登录状态。";
stopHint.style.fontSize = "11px";
stopHint.style.color = "#6b7280";

crawlBtnRow.appendChild(startCrawlBtn);
crawlBtnRow.appendChild(stopHint);

// 点击开始巡检：整理 URL 列表，发给 background
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

  const currentOrigin = location.origin; // https://域名:端口
  const base = (baseUrlInput.value || "").trim() || currentOrigin;

  // 把相对路径转成完整 URL
  const fullUrls = lines.map((u) => {
    if (u.startsWith("http://") || u.startsWith("https://")) {
      return u;
    }
    // 简单拼接：确保有 /
    if (u.startsWith("/")) {
      return base.replace(/\/+$/, "") + u;
    }
    return base.replace(/\/+$/, "") + "/" + u;
  });

  console.log("准备自动巡检这些地址：", fullUrls);

  chrome.runtime.sendMessage(
    {
      type: "AUTO_CRAWL_START",
      urls: fullUrls
    },
    (resp) => {
      console.log("AUTO_CRAWL_START resp:", resp);
      if (!resp || !resp.ok) {
        alert("启动自动巡检失败：" + (resp?.error || "未知错误"));
      } else {
        alert("已开始自动巡检，页面会依次跳转抓取并上传。");
      }
    }
  );
});


    // 装进 wrapper 并挂到 overlay
    contentWrapper.appendChild(box);
    contentWrapper.appendChild(extraBox);
    overlay.appendChild(contentWrapper);

    // ========= 切换 Tab =========
    function switchTab(tabName) {
      const mainBox = document.getElementById("random-demo-box");
      const extraBox = document.getElementById("random-demo-box-extra");
      const items = overlay.querySelectorAll(".random-demo-tab-item");

      items.forEach((it) => {
        const active = it.dataset.tab === tabName;
        it.classList.toggle("active", active);
        it.style.color = active ? "#2563eb" : "#6b7280";
        it.style.borderBottom = active
          ? "2px solid #2563eb"
          : "2px solid transparent";
      });

      if (tabName === "main") {
        mainBox.style.display = "block";
        extraBox.style.display = "none";
      } else {
        mainBox.style.display = "none";
        extraBox.style.display = "block";
      }
    }

    tabMain.addEventListener("click", (e) => {
      e.stopPropagation();
      switchTab("main");
    });
    tabExtra.addEventListener("click", (e) => {
      e.stopPropagation();
      switchTab("extra");
    });

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

  // ================== 启动逻辑 ==================
  clearOldTimer();
  setRandomMessage();
  window.__random_demo_timer = setInterval(setRandomMessage, 3000);
  detectAndRenderSummary();

  // ===== 页面环境里的代码结束 =====
})();
