# GiggleHeader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个纯本地、零数据收集的 Chrome MV3 扩展，用于给浏览器发出的所有请求添加/覆盖/删除 HTTP 请求头。

**Architecture:** 单一数据源存于 `chrome.storage.local`；popup 只负责编辑并写入 storage；background service worker 监听 storage 变化，把配置翻译成 `declarativeNetRequest` 动态规则。配置→规则的翻译逻辑抽成纯函数 `buildRules`，独立于 chrome API，可单元测试。MVP 阶段不引用自定义图标（用浏览器默认图标），保持零第三方依赖、开箱可加载。

**Tech Stack:** Chrome Manifest V3、`declarativeNetRequest` API、`chrome.storage.local`、原生 JS（ESM）、Node 内置 `node:test`（唯一测试工具，零依赖）。

---

## 文件结构

```
GiggleHeader/
├── package.json           # type: module；test 脚本用 node --test
├── manifest.json          # MV3 配置、权限、popup、service worker
├── background.js          # service worker：storage → buildRules → DNR 动态规则
├── src/
│   └── rules.js           # 纯函数 buildRules(config) → DNR 规则数组（被 background 与测试共用）
├── popup.html             # 弹窗结构
├── popup.css              # 弹窗样式
├── popup.js               # 弹窗交互：读写 storage、渲染行
└── test/
    └── rules.test.js      # buildRules 单元测试
```

**职责边界：**
- `src/rules.js`：唯一放"配置如何变成规则"业务逻辑的地方，纯函数、无副作用、不依赖 chrome API。
- `background.js`：负责与 chrome API 打交道（读 storage、更新 DNR 规则），逻辑委托给 `buildRules`。
- `popup.js`：只读写 `chrome.storage.local` 的 `config`，绝不直接碰 DNR 规则——保证单一数据源。

---

## Task 1: 项目脚手架与首个失败测试

**Files:**
- Create: `package.json`
- Create: `test/rules.test.js`

- [ ] **Step 1: 创建 package.json**

`package.json`:
```json
{
  "name": "giggle-header",
  "version": "1.0.0",
  "description": "纯本地修改 HTTP 请求头的 Chrome 扩展，零数据收集。",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: 写失败测试（buildRules 尚不存在）**

`test/rules.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRules } from "../src/rules.js";

test("全局开关关闭时返回空数组", () => {
  const config = { enabled: false, headers: [{ id: "a", name: "X-A", value: "1", enabled: true, op: "set" }] };
  assert.deepEqual(buildRules(config), []);
});

test("set 操作生成带 value 的 modifyHeaders 规则", () => {
  const config = { enabled: true, headers: [{ id: "a", name: "X-A", value: "1", enabled: true, op: "set" }] };
  const rules = buildRules(config);
  assert.equal(rules.length, 1);
  const r = rules[0];
  assert.equal(r.id, 1);
  assert.equal(r.priority, 1);
  assert.equal(r.action.type, "modifyHeaders");
  assert.deepEqual(r.action.requestHeaders, [{ header: "X-A", operation: "set", value: "1" }]);
  assert.ok(Array.isArray(r.condition.resourceTypes) && r.condition.resourceTypes.includes("main_frame"));
  assert.equal(r.condition.urlFilter, undefined);
});

test("remove 操作生成不带 value 的规则", () => {
  const config = { enabled: true, headers: [{ id: "a", name: "X-A", value: "1", enabled: true, op: "remove" }] };
  const r = buildRules(config)[0];
  assert.deepEqual(r.action.requestHeaders, [{ header: "X-A", operation: "remove" }]);
});

test("行内 enabled=false 的行被跳过", () => {
  const config = { enabled: true, headers: [{ id: "a", name: "X-A", value: "1", enabled: false, op: "set" }] };
  assert.deepEqual(buildRules(config), []);
});

test("name 为空或纯空白的行被跳过", () => {
  const config = { enabled: true, headers: [
    { id: "a", name: "", value: "1", enabled: true, op: "set" },
    { id: "b", name: "   ", value: "1", enabled: true, op: "set" },
  ] };
  assert.deepEqual(buildRules(config), []);
});

test("多行时规则 id 从 1 递增且顺序对应", () => {
  const config = { enabled: true, headers: [
    { id: "a", name: "X-A", value: "1", enabled: true, op: "set" },
    { id: "b", name: "X-B", value: "2", enabled: true, op: "set" },
  ] };
  const rules = buildRules(config);
  assert.deepEqual(rules.map(r => r.id), [1, 2]);
  assert.equal(rules[1].action.requestHeaders[0].header, "X-B");
});

test("跳过的行不占用 id（id 在保留行内连续）", () => {
  const config = { enabled: true, headers: [
    { id: "a", name: "", value: "1", enabled: true, op: "set" },
    { id: "b", name: "X-B", value: "2", enabled: true, op: "set" },
  ] };
  const rules = buildRules(config);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].id, 1);
  assert.equal(rules[0].action.requestHeaders[0].header, "X-B");
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test`
Expected: FAIL —— 报错找不到模块 `../src/rules.js`（Cannot find module）。

- [ ] **Step 4: 提交**

```bash
git add package.json test/rules.test.js
git commit -m "test: 添加 buildRules 单元测试"
```

---

## Task 2: 实现 buildRules 纯函数

**Files:**
- Create: `src/rules.js`
- Test: `test/rules.test.js`（已存在）

- [ ] **Step 1: 实现 buildRules**

`src/rules.js`:
```js
// 所有需要拦截的资源类型，覆盖浏览器发出的各类请求。
const ALL_RESOURCE_TYPES = [
  "main_frame", "sub_frame", "stylesheet", "script", "image",
  "font", "object", "xmlhttprequest", "ping", "csp_report",
  "media", "websocket", "webtransport", "webbundle", "other",
];

/**
 * 把用户配置翻译成 declarativeNetRequest 动态规则数组。
 * 纯函数：不读写 storage、不调用 chrome API。
 *
 * @param {{enabled: boolean, headers: Array<{id:string,name:string,value:string,enabled:boolean,op:string}>}} config
 * @returns {Array<object>} DNR 规则数组
 */
export function buildRules(config) {
  if (!config || !config.enabled || !Array.isArray(config.headers)) {
    return [];
  }

  const rules = [];
  for (const h of config.headers) {
    if (!h || h.enabled !== true) continue;
    const name = typeof h.name === "string" ? h.name.trim() : "";
    if (name === "") continue;

    const operation = h.op === "remove" ? "remove" : "set";
    const headerSpec = { header: name, operation };
    if (operation === "set") {
      headerSpec.value = typeof h.value === "string" ? h.value : "";
    }

    rules.push({
      id: rules.length + 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [headerSpec],
      },
      condition: {
        resourceTypes: ALL_RESOURCE_TYPES,
      },
    });
  }
  return rules;
}
```

- [ ] **Step 2: 运行测试确认全部通过**

Run: `npm test`
Expected: PASS —— 7 个测试全部通过。

- [ ] **Step 3: 提交**

```bash
git add src/rules.js
git commit -m "feat: 实现 buildRules 配置到 DNR 规则的翻译"
```

---

## Task 3: manifest.json

**Files:**
- Create: `manifest.json`

- [ ] **Step 1: 创建 manifest.json**

`manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "GiggleHeader",
  "version": "1.0.0",
  "description": "纯本地修改 HTTP 请求头的开发者工具，零数据收集。",
  "permissions": ["declarativeNetRequest", "storage"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html",
    "default_title": "GiggleHeader"
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add manifest.json
git commit -m "feat: 添加 MV3 manifest"
```

---

## Task 4: background service worker

**Files:**
- Create: `background.js`

- [ ] **Step 1: 创建 background.js**

`background.js`:
```js
import { buildRules } from "./src/rules.js";

const DEFAULT_CONFIG = { enabled: true, headers: [] };

// 读取配置，翻译成 DNR 规则，并全量替换当前动态规则。
async function syncRules() {
  const { config = DEFAULT_CONFIG } = await chrome.storage.local.get("config");
  const addRules = buildRules(config);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  } catch (e) {
    console.error("GiggleHeader: 更新动态规则失败", e);
  }
}

// 首次安装：写入默认配置并同步。
chrome.runtime.onInstalled.addListener(async () => {
  const { config } = await chrome.storage.local.get("config");
  if (!config) {
    await chrome.storage.local.set({ config: DEFAULT_CONFIG });
  }
  await syncRules();
});

// 浏览器启动时重新同步（动态规则本身会持久化，这里确保与配置一致）。
chrome.runtime.onStartup.addListener(syncRules);

// 配置变化时重新同步。
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.config) {
    syncRules();
  }
});
```

- [ ] **Step 2: 提交**

```bash
git add background.js
git commit -m "feat: 添加 background service worker 同步 DNR 规则"
```

---

## Task 5: popup UI

**Files:**
- Create: `popup.html`
- Create: `popup.css`
- Create: `popup.js`

- [ ] **Step 1: 创建 popup.html**

`popup.html`:
```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <header class="topbar">
    <span class="title">GiggleHeader</span>
    <label class="switch" title="全局开关">
      <input type="checkbox" id="master-toggle">
      <span class="slider"></span>
    </label>
  </header>
  <div id="rows" class="rows"></div>
  <button id="add-row" class="add-btn">+ 添加一行</button>
  <script type="module" src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: 创建 popup.css**

`popup.css`:
```css
* { box-sizing: border-box; }
body {
  width: 380px;
  margin: 0;
  padding: 12px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  color: #1f2328;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.title { font-weight: 600; font-size: 15px; }

.switch { position: relative; display: inline-block; width: 40px; height: 22px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute; inset: 0; cursor: pointer;
  background: #ccc; border-radius: 22px; transition: .2s;
}
.slider::before {
  content: ""; position: absolute; height: 16px; width: 16px;
  left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: .2s;
}
.switch input:checked + .slider { background: #2da44e; }
.switch input:checked + .slider::before { transform: translateX(18px); }

.rows { display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; align-items: center; gap: 6px; }
.row select, .row input[type="text"] {
  height: 28px; border: 1px solid #d0d7de; border-radius: 6px; padding: 0 6px; font-size: 12px;
}
.row select { flex: 0 0 64px; }
.row input.name { flex: 1 1 40%; }
.row input.value { flex: 1 1 40%; }
.row input.value:disabled { background: #f6f8fa; color: #9aa0a6; }
.row .del {
  flex: 0 0 24px; height: 24px; border: none; background: transparent;
  color: #cf222e; cursor: pointer; font-size: 14px; border-radius: 4px;
}
.row .del:hover { background: #ffebe9; }

.add-btn {
  margin-top: 10px; width: 100%; height: 30px;
  border: 1px dashed #d0d7de; border-radius: 6px; background: #f6f8fa;
  cursor: pointer; font-size: 13px; color: #1f2328;
}
.add-btn:hover { background: #eef1f4; }
```

- [ ] **Step 3: 创建 popup.js**

`popup.js`:
```js
let config = { enabled: true, headers: [] };

const rowsEl = document.getElementById("rows");
const masterToggle = document.getElementById("master-toggle");
const addBtn = document.getElementById("add-row");

async function load() {
  const res = await chrome.storage.local.get("config");
  config = res.config || { enabled: true, headers: [] };
  render();
}

async function save() {
  await chrome.storage.local.set({ config });
}

function uid() {
  return crypto.randomUUID();
}

function render() {
  masterToggle.checked = config.enabled;
  rowsEl.replaceChildren();
  for (const h of config.headers) {
    rowsEl.appendChild(renderRow(h));
  }
}

function renderRow(h) {
  const row = document.createElement("div");
  row.className = "row";

  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.checked = h.enabled;
  enabled.title = "启用该行";
  enabled.addEventListener("change", () => {
    h.enabled = enabled.checked;
    save();
  });

  const op = document.createElement("select");
  for (const [val, label] of [["set", "设置"], ["remove", "删除"]]) {
    const o = document.createElement("option");
    o.value = val;
    o.textContent = label;
    if (h.op === val) o.selected = true;
    op.appendChild(o);
  }
  op.addEventListener("change", () => {
    h.op = op.value;
    render();
    save();
  });

  const name = document.createElement("input");
  name.type = "text";
  name.className = "name";
  name.placeholder = "Header 名";
  name.value = h.name;
  name.addEventListener("input", () => {
    h.name = name.value;
    save();
  });

  const value = document.createElement("input");
  value.type = "text";
  value.className = "value";
  value.placeholder = "值";
  value.value = h.value;
  value.disabled = h.op === "remove";
  value.addEventListener("input", () => {
    h.value = value.value;
    save();
  });

  const del = document.createElement("button");
  del.className = "del";
  del.textContent = "✕";
  del.title = "删除该行";
  del.addEventListener("click", () => {
    config.headers = config.headers.filter((x) => x.id !== h.id);
    render();
    save();
  });

  row.append(enabled, op, name, value, del);
  return row;
}

masterToggle.addEventListener("change", () => {
  config.enabled = masterToggle.checked;
  save();
});

addBtn.addEventListener("click", () => {
  config.headers.push({ id: uid(), name: "", value: "", enabled: true, op: "set" });
  render();
  save();
});

load();
```

- [ ] **Step 4: 提交**

```bash
git add popup.html popup.css popup.js
git commit -m "feat: 添加 popup 编辑界面"
```

---

## Task 6: 手动端到端验证

**Files:** 无（仅验证）

- [ ] **Step 1: 加载扩展**

1. 打开 Chrome，访问 `chrome://extensions`。
2. 右上角打开"开发者模式"。
3. 点击"加载已解压的扩展程序"，选择项目根目录 `GiggleHeader/`。
4. 确认扩展出现、无报错（若 service worker 报错，点"service worker"链接看控制台）。

- [ ] **Step 2: 验证 set 生效**

1. 点击扩展图标打开 popup，点"+ 添加一行"。
2. 操作选"设置"，Header 名填 `X-Giggle-Test`，值填 `hello`。
3. 新开标签访问 `https://httpbin.org/headers`（该页回显收到的请求头）。
4. Expected: 返回的 JSON 中 `headers` 含 `"X-Giggle-Test": "hello"`。

- [ ] **Step 3: 验证行内开关与总开关**

1. 关闭该行的启用勾选，刷新 `httpbin.org/headers`。
2. Expected: `X-Giggle-Test` 消失。
3. 重新勾选该行，关闭右上角总开关，刷新。
4. Expected: `X-Giggle-Test` 仍消失（总开关优先）。

- [ ] **Step 4: 验证 remove 生效**

1. 打开总开关与行内开关，把操作改为"删除"，Header 名填一个浏览器通常会发送的头，如 `Referer`。
2. 从某页面跳转访问 `https://httpbin.org/headers`。
3. Expected: 返回 JSON 的 `headers` 中不含 `Referer`。

- [ ] **Step 5: 记录验证结果并提交（如有文档更新）**

若验证中发现需要修正的问题，回到对应 Task 修复；全部通过后本任务完成。无代码变更则无需提交。

---

## Self-Review 结论

- **Spec 覆盖**：修改请求头(set) → Task 2/5；删除(remove) → Task 2/5；全局开关 → Task 2(过滤)/5(UI)；行内开关 → Task 2/5；全局生效(无 URL 过滤，resourceTypes 全集) → Task 2；单一数据源(popup 只写 storage) → Task 4/5；纯函数可测 → Task 1/2；手动端到端 → Task 6。均有对应任务。
- **偏离说明**：spec 架构列出 `icons/`，本计划 MVP 阶段省略自定义图标（manifest 不引用，用浏览器默认），以保证零依赖、开箱可加载；列为后续可选增量。
- **类型一致性**：`config` 结构（`enabled`、`headers[{id,name,value,enabled,op}]`）在 Task 1/2/4/5 中保持一致；`buildRules` 签名与返回结构在测试(Task 1)与实现(Task 2)一致；popup 与 background 都通过 `chrome.storage.local` 的 `config` 键交互。
- **无占位符**：所有代码步骤均给出完整代码，命令与预期输出明确。
