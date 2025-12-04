# 暗访者（Dark Spy）· Chrome 页面采集助手

一个专为数据采集、网页抓取、自动巡检与 AI 总结设计的 Chrome 扩展。  
支持整页采集、元素采集、图片/表格结构扫描、批量子页面巡检，以及 DeepSeek 流式 AI 总结。

---

## 🚀 功能特性

### **1️⃣ 手动采集功能**
- **上传整页 HTML**
- **选取任意元素**（自动生成精准 CSS 选择器）
- 自动提取以下结构并可直接上传：
  - 🚩 页面中所有有效图片（包含尺寸、locator 等）
  - 📊 页面内所有表格（行列数 + 全量数据）
- 高级定位能力：
  - 支持用户输入 CSS 选择器
  - 支持预览定位（高亮 + 自动滚动）
  - 支持保存采集规则，便于复用

---

### **2️⃣ 自动巡检（Auto Crawl）**
- 支持批量输入 URL（每行一个）
- 支持相对路径（如 `/post/123`），会自动补全为完整 URL
- 支持自定义 CSS selector（优先级高于规则）
- 可从已保存的采集规则中选择
- 后台自动创建隐藏标签页依次采集（不影响当前浏览）
- 每个页面加载完成后自动执行采集逻辑并上传内容

---

### **3️⃣ AI 深度总结（DeepSeek 流式）**
点击「AI 总结本页」即可生成如下内容：
- 页面总体概述（1–2 句话）
- 核心信息要点（5–10 条）
- 1 句话精炼总结  
AI 使用 **DeepSeek 智能模型**，并通过 **流式输出** 渲染到界面中，体验丝滑。

> 总结内容完全在本地实时展示，不上传到第三方服务器。

---

## 📂 文件结构说明

```
├── background.js     # 后台 Service Worker：上传逻辑、自动巡检、AI 流式请求
├── panel.js          # 页面注入脚本：UI 面板 + 选区 + 结构扫描 + 手动采集逻辑
├── config.json       # 配置 API 地址 & DeepSeek Key
├── manifest.json     # Chrome 扩展清单（Manifest V3）
├── icon.png          # 扩展图标
└── README.md
```

---

## 🔧 安装方法（开发者模式）

1. 打开浏览器：  
   `chrome://extensions/`

2. 开启右上角 **开发者模式（Developer Mode）**

3. 点击 **「加载已解压的扩展程序 Load unpacked」**

4. 选择本仓库的根目录

加载完成后，浏览器右上角会出现插件图标。

---

## 🛠 配置说明（config.json）

```json
{
  "API_URL": "http://your-backend-server/html/receive-body",
  "DEEPSEEK_API_URL": "https://api.deepseek.com",
  "DEEPSEEK_API_KEY": "your-deepseek-key"
}
```

请按需修改服务器地址和 API Key。

---

## 📘 使用指南

### **① 点击插件图标 → 弹出「页面助手」面板**

你可以在右下角看到浮动面板，包括两个页签：

- **当前页**
- **自动巡检**

---

### **② 当前页功能**

| 功能 | 说明 |
|------|------|
| 上传整页内容 | 获取 body.innerHTML 并上传 |
| 上传所选区域 | 进入选择模式，鼠标 hover 高亮，点击上传 |
| AI 总结本页 | 调用 DeepSeek API 进行结构化总结 |
| 输入 CSS selector | 支持定位 / 高亮 / 滚动到视图 |
| 保存规则 | 将选择器保存用于自动巡检 |

还会自动显示：
- 图片结构概览
- 表格结构概览  
→ 并支持一键上传结构信息

---

### **③ 自动巡检功能**

步骤如下：

1. 填写多个 URL（每行一个）
2. 可选：填写站点基础域名（默认用当前站点 origin）
3. 选择采集规则（CSS selector）
4. 或直接写自定义 CSS selector（优先级最高）
5. 点击「开始批量采集」

扩展会在后台打开隐藏标签页依次采集并上传数据。

---

## 🧩 权限声明

扩展仅使用以下必要权限：

- `activeTab` — 在当前页面注入 panel.js
- `scripting` — 注入脚本
- `tabs` — 自动巡检需要创建新标签页
- `storage` — 存储采集规则
- `host_permissions` — 访问你的后端 API（config.json 中配置）

---

## 🧑‍💻 开发与调试

### 查看后台日志：
```
chrome://extensions/
→ 找到插件
→ Service Worker → Inspect
```

### 查看前端 UI / 注入脚本日志：
按：
```
F12 → Console
```

---

## 📄 许可证

MIT License – 你可以自由使用、二次开发、商用。

---

## ✨ 作者

© 2025 by **easymer's huangxiaotao**

如需功能扩展、重构、优化、升级，也欢迎继续咨询！
