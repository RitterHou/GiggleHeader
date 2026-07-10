# 按域名生效改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 GiggleHeader 从「对所有网站全局生效」改造为「只对用户指定域名列表生效」，并把主机权限改为运行时按需申请，以绕开 Chrome Web Store 的广泛主机权限深入审核。

**Architecture:** 新增可导出纯函数 `normalizeDomain` 处理域名输入；`buildRules` 增加 `domains` 维度，给 DNR 规则注入 `requestDomains` 条件，域名列表为空则不产生规则；manifest 用 `optional_host_permissions` 替换 `host_permissions`；popup 新增域名管理区，添加域名时用 `chrome.permissions.request` 运行时申请权限。

**Tech Stack:** Chrome Manifest V3、declarativeNetRequest（`requestDomains`）、`chrome.permissions`（可选权限）、`chrome.storage.local`、原生 JS（ESM）、Node 内置 `node:test`。

---

## 文件结构

```
GiggleHeader/
├── manifest.json          # 修改：host_permissions → optional_host_permissions
├── background.js          # 修改：DEFAULT_CONFIG 增加 domains: []
├── src/
│   ├── domain.js          # 新增：normalizeDomain 纯函数
│   └── rules.js           # 修改：buildRules 增加 domains → requestDomains
├── popup.html             # 修改：新增「生效域名」区
├── popup.css              # 修改：新增域名区样式
├── popup.js               # 修改：域名管理 + 权限申请流
└── test/
    ├── domain.test.js     # 新增：normalizeDomain 单测
    └── rules.test.js      # 修改：buildRules 加 domains 维度
```

**约定**：所有测试名用 ASCII（旧版 Node 18 的 `node --test` 解析中文测试名会报 TAP lexer 错误）。

---

## Task 1: normalizeDomain 纯函数

**Files:**
- Create: `src/domain.js`
- Create: `test/domain.test.js`

- [ ] **Step 1: 写失败测试**

`test/domain.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDomain } from "../src/domain.js";

test("strips protocol and path", () => {
  assert.equal(normalizeDomain("https://api.example.com/x?y"), "api.example.com");
});

test("keeps subdomain levels", () => {
  assert.equal(normalizeDomain("a.b.example.com"), "a.b.example.com");
});

test("strips leading wildcard", () => {
  assert.equal(normalizeDomain("*.example.com"), "example.com");
});

test("strips port and surrounding whitespace", () => {
  assert.equal(normalizeDomain("  example.com:8080  "), "example.com");
});

test("lowercases", () => {
  assert.equal(normalizeDomain("HTTP://Example.COM"), "example.com");
});

test("returns empty string for input without a dot", () => {
  assert.equal(normalizeDomain("localhost"), "");
});

test("returns empty string for empty or non-string input", () => {
  assert.equal(normalizeDomain(""), "");
  assert.equal(normalizeDomain(null), "");
  assert.equal(normalizeDomain(123), "");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/domain.test.js`
Expected: FAIL —— Cannot find module `../src/domain.js`。

- [ ] **Step 3: 实现 normalizeDomain**

`src/domain.js`:
```js
/**
 * 规范化用户输入的域名：去空白、协议、前导 *.、路径/查询、端口，转小写。
 * 保留主机名本身（含子域名层级）。非法或不含点的输入返回空串。
 * @param {string} input
 * @returns {string}
 */
export function normalizeDomain(input) {
  if (typeof input !== "string") return "";
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, ""); // 去协议
  s = s.replace(/^\*\./, "");         // 去前导 *.
  s = s.split("/")[0];                // 去路径/查询
  s = s.split(":")[0];                // 去端口
  if (!s.includes(".")) return "";
  return s;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test test/domain.test.js`
Expected: PASS —— 7 个测试通过。

- [ ] **Step 5: 提交**

```bash
git add src/domain.js test/domain.test.js
git commit -m "feat: 添加 normalizeDomain 域名规范化纯函数"
```

---

## Task 2: buildRules 支持 domains（requestDomains）

**Files:**
- Modify: `src/rules.js`
- Modify: `test/rules.test.js`

- [ ] **Step 1: 更新测试文件（加 domains 维度）**

把 `test/rules.test.js` 全部替换为：
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRules } from "../src/rules.js";

const DOMAINS = ["example.com"];

test("returns empty array when domains list is empty", () => {
  const config = { enabled: true, domains: [], headers: [{ id: "a", name: "X-A", value: "1", enabled: true, op: "set" }] };
  assert.deepEqual(buildRules(config), []);
});

test("returns empty array when global switch is off", () => {
  const config = { enabled: false, domains: DOMAINS, headers: [{ id: "a", name: "X-A", value: "1", enabled: true, op: "set" }] };
  assert.deepEqual(buildRules(config), []);
});

test("set op produces modifyHeaders rule scoped to requestDomains", () => {
  const config = { enabled: true, domains: DOMAINS, headers: [{ id: "a", name: "X-A", value: "1", enabled: true, op: "set" }] };
  const rules = buildRules(config);
  assert.equal(rules.length, 1);
  const r = rules[0];
  assert.equal(r.id, 1);
  assert.equal(r.priority, 1);
  assert.equal(r.action.type, "modifyHeaders");
  assert.deepEqual(r.action.requestHeaders, [{ header: "X-A", operation: "set", value: "1" }]);
  assert.deepEqual(r.condition.requestDomains, ["example.com"]);
  assert.ok(Array.isArray(r.condition.resourceTypes) && r.condition.resourceTypes.includes("main_frame"));
});

test("remove op produces a rule without value", () => {
  const config = { enabled: true, domains: DOMAINS, headers: [{ id: "a", name: "X-A", value: "1", enabled: true, op: "remove" }] };
  const r = buildRules(config)[0];
  assert.deepEqual(r.action.requestHeaders, [{ header: "X-A", operation: "remove" }]);
});

test("skips rows with inline enabled=false", () => {
  const config = { enabled: true, domains: DOMAINS, headers: [{ id: "a", name: "X-A", value: "1", enabled: false, op: "set" }] };
  assert.deepEqual(buildRules(config), []);
});

test("skips rows with empty or blank name", () => {
  const config = { enabled: true, domains: DOMAINS, headers: [
    { id: "a", name: "", value: "1", enabled: true, op: "set" },
    { id: "b", name: "   ", value: "1", enabled: true, op: "set" },
  ] };
  assert.deepEqual(buildRules(config), []);
});

test("multiple domains all appear in requestDomains", () => {
  const config = { enabled: true, domains: ["a.com", "b.com"], headers: [{ id: "a", name: "X-A", value: "1", enabled: true, op: "set" }] };
  const r = buildRules(config)[0];
  assert.deepEqual(r.condition.requestDomains, ["a.com", "b.com"]);
});

test("dedupes and drops blank domains", () => {
  const config = { enabled: true, domains: ["a.com", "a.com", "  "], headers: [{ id: "a", name: "X-A", value: "1", enabled: true, op: "set" }] };
  const r = buildRules(config)[0];
  assert.deepEqual(r.condition.requestDomains, ["a.com"]);
});

test("assigns sequential ids from 1 for multiple kept rows", () => {
  const config = { enabled: true, domains: DOMAINS, headers: [
    { id: "a", name: "X-A", value: "1", enabled: true, op: "set" },
    { id: "b", name: "X-B", value: "2", enabled: true, op: "set" },
  ] };
  const rules = buildRules(config);
  assert.deepEqual(rules.map(r => r.id), [1, 2]);
  assert.equal(rules[1].action.requestHeaders[0].header, "X-B");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test test/rules.test.js`
Expected: FAIL —— 现有 `buildRules` 未处理 `domains`，`requestDomains` 断言不通过。

- [ ] **Step 3: 更新 buildRules**

把 `src/rules.js` 全部替换为：
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
 * 规则只对 config.domains 列表内的域名（及其子域名）生效；域名为空则不产生规则。
 *
 * @param {{enabled: boolean, domains: string[], headers: Array<{id:string,name:string,value:string,enabled:boolean,op:string}>}} config
 * @returns {Array<object>} DNR 规则数组
 */
export function buildRules(config) {
  if (!config || !config.enabled || !Array.isArray(config.headers) || !Array.isArray(config.domains)) {
    return [];
  }

  const domains = [...new Set(
    config.domains.filter((d) => typeof d === "string" && d.trim() !== "")
  )];
  if (domains.length === 0) return [];

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
        requestDomains: domains,
        resourceTypes: ALL_RESOURCE_TYPES,
      },
    });
  }
  return rules;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS —— domain 与 rules 两个测试文件全部通过。

- [ ] **Step 5: 提交**

```bash
git add src/rules.js test/rules.test.js
git commit -m "feat: buildRules 按域名生效，注入 requestDomains"
```

---

## Task 3: manifest 权限改造

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: 替换权限声明**

把 `manifest.json` 全部替换为：
```json
{
  "manifest_version": 3,
  "name": "GiggleHeader",
  "version": "1.0.0",
  "description": "纯本地修改 HTTP 请求头的开发者工具，零数据收集。",
  "permissions": ["declarativeNetRequest", "storage"],
  "optional_host_permissions": ["*://*/*"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html",
    "default_title": "GiggleHeader",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 2: 校验 JSON 合法**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('ok')"`
Expected: 输出 `ok`。

- [ ] **Step 3: 提交**

```bash
git add manifest.json
git commit -m "feat: 主机权限改为 optional_host_permissions 运行时申请"
```

---

## Task 4: background 默认配置加 domains

**Files:**
- Modify: `background.js`

- [ ] **Step 1: 更新 DEFAULT_CONFIG**

在 `background.js` 中把：
```js
const DEFAULT_CONFIG = { enabled: true, headers: [] };
```
改为：
```js
const DEFAULT_CONFIG = { enabled: true, domains: [], headers: [] };
```

- [ ] **Step 2: 校验语法**

Run: `node --check background.js`
Expected: 无输出（语法通过）。

- [ ] **Step 3: 提交**

```bash
git add background.js
git commit -m "feat: background 默认配置增加 domains 字段"
```

---

## Task 5: popup 域名管理 UI 与权限申请流

**Files:**
- Modify: `popup.html`
- Modify: `popup.css`
- Modify: `popup.js`

- [ ] **Step 1: 更新 popup.html**

把 `popup.html` 全部替换为：
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

  <section class="domains-section">
    <div class="section-label">生效域名</div>
    <div id="domains" class="domains"></div>
    <div class="domain-add">
      <input type="text" id="domain-input" class="domain-input" placeholder="域名，如 example.com">
      <button id="add-domain" class="add-domain-btn">添加</button>
    </div>
    <div id="domain-error" class="domain-error"></div>
  </section>

  <div class="section-label">请求头</div>
  <div id="rows" class="rows"></div>
  <button id="add-row" class="add-btn">+ 添加一行</button>
  <script type="module" src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: 更新 popup.css（追加域名区样式）**

在 `popup.css` 末尾追加：
```css
.section-label { font-size: 12px; font-weight: 600; color: #57606a; margin: 4px 0 8px; }
.domains-section { margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #eaeef2; }
.domains { display: flex; flex-direction: column; gap: 5px; margin-bottom: 8px; }
.domain-row { display: flex; align-items: center; justify-content: space-between; gap: 6px;
  background: #f6f8fa; border: 1px solid #eaeef2; border-radius: 6px; padding: 4px 6px 4px 10px; }
.domain-name { font-size: 12px; color: #1f2328; word-break: break-all; }
.domain-del { flex: 0 0 20px; height: 20px; border: none; background: transparent;
  color: #cf222e; cursor: pointer; font-size: 13px; border-radius: 4px; }
.domain-del:hover { background: #ffebe9; }
.domain-hint { font-size: 12px; color: #9aa0a6; padding: 4px 2px; }
.domain-add { display: flex; gap: 6px; }
.domain-input { flex: 1 1 0; min-width: 0; height: 28px; border: 1px solid #d0d7de;
  border-radius: 6px; padding: 0 8px; font-size: 12px; }
.add-domain-btn { flex: 0 0 auto; height: 28px; padding: 0 12px; border: 1px solid #d0d7de;
  border-radius: 6px; background: #f6f8fa; cursor: pointer; font-size: 12px; }
.add-domain-btn:hover { background: #eef1f4; }
.domain-error { font-size: 11px; color: #cf222e; min-height: 14px; margin-top: 4px; }
```

- [ ] **Step 3: 更新 popup.js**

把 `popup.js` 全部替换为：
```js
import { normalizeDomain } from "./src/domain.js";

let config = { enabled: true, domains: [], headers: [] };

const rowsEl = document.getElementById("rows");
const masterToggle = document.getElementById("master-toggle");
const addBtn = document.getElementById("add-row");
const domainsEl = document.getElementById("domains");
const domainInput = document.getElementById("domain-input");
const addDomainBtn = document.getElementById("add-domain");
const domainErrorEl = document.getElementById("domain-error");

async function load() {
  const res = await chrome.storage.local.get("config");
  config = res.config || { enabled: true, domains: [], headers: [] };
  if (!Array.isArray(config.domains)) config.domains = [];
  render();
}

async function save() {
  await chrome.storage.local.set({ config });
}

function uid() {
  return crypto.randomUUID();
}

function originsFor(domain) {
  return [`*://${domain}/*`, `*://*.${domain}/*`];
}

function setDomainError(msg) {
  domainErrorEl.textContent = msg || "";
}

function render() {
  masterToggle.checked = config.enabled;
  renderDomains();
  rowsEl.replaceChildren();
  for (const h of config.headers) {
    rowsEl.appendChild(renderRow(h));
  }
}

function renderDomains() {
  domainsEl.replaceChildren();
  if (config.domains.length === 0) {
    const hint = document.createElement("div");
    hint.className = "domain-hint";
    hint.textContent = "请至少添加一个生效域名，否则规则不会生效";
    domainsEl.appendChild(hint);
    return;
  }
  for (const d of config.domains) {
    const row = document.createElement("div");
    row.className = "domain-row";
    const name = document.createElement("span");
    name.className = "domain-name";
    name.textContent = d;
    const del = document.createElement("button");
    del.className = "domain-del";
    del.textContent = "✕";
    del.title = "移除域名";
    del.addEventListener("click", () => removeDomain(d));
    row.append(name, del);
    domainsEl.appendChild(row);
  }
}

async function addDomain() {
  const d = normalizeDomain(domainInput.value);
  if (!d) {
    setDomainError("请输入合法域名，如 example.com");
    return;
  }
  if (config.domains.includes(d)) {
    domainInput.value = "";
    setDomainError("");
    return;
  }
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: originsFor(d) });
  } catch (e) {
    setDomainError("权限申请失败");
    return;
  }
  if (!granted) {
    setDomainError("未授权该域名，规则不会对它生效");
    return;
  }
  config.domains.push(d);
  domainInput.value = "";
  setDomainError("");
  render();
  save();
}

async function removeDomain(d) {
  config.domains = config.domains.filter((x) => x !== d);
  render();
  save();
  try {
    await chrome.permissions.remove({ origins: originsFor(d) });
  } catch (e) {
    // 忽略：域名已从配置移除，规则不再生效即达目的
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

addDomainBtn.addEventListener("click", addDomain);
domainInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addDomain();
});

load();
```

- [ ] **Step 4: 校验语法**

Run: `node --check popup.js`
Expected: 无输出（语法通过）。

- [ ] **Step 5: 提交**

```bash
git add popup.html popup.css popup.js
git commit -m "feat: popup 新增生效域名管理与权限申请"
```

---

## Task 6: 手动端到端验证

**Files:** 无（仅验证）

- [ ] **Step 1: 重新加载扩展**

1. `chrome://extensions` → 找到 GiggleHeader → 点刷新↻（manifest 变了必须刷新）。
2. 确认无报错。

- [ ] **Step 2: 验证按域名生效**

1. 打开 popup，在「生效域名」输入 `httpbin.org` → 点添加 → 浏览器弹权限请求 → 点"允许"。
2. 域名出现在列表中，角标此时可能仍为 0（还没加 header）。
3. 「请求头」加一行：设置 `X-Giggle-Test` = `hello`。
4. 访问 `https://httpbin.org/headers`。
5. Expected: 返回 JSON 含 `"X-Giggle-Test": "hello"`，角标显示 `1`。

- [ ] **Step 3: 验证域名隔离**

1. 访问另一个能回显请求头的站点（如 `https://postman-echo.com/get`，未授权）。
2. Expected: 返回内容里**没有** `X-Giggle-Test`（未授权域名不生效）。

- [ ] **Step 4: 验证删除域名与空列表**

1. 在 popup 删除 `httpbin.org`。
2. Expected: 列表变回"请至少添加一个生效域名"提示，角标归 0。
3. 刷新 `https://httpbin.org/headers`。
4. Expected: `X-Giggle-Test` 消失。

- [ ] **Step 5: 重新打包（供上架）**

```bash
cd /Users/Ray/Projects/JavaScriptProjects/GiggleHeader
rm -f dist/giggleheader-v1.0.0.zip
zip -rX dist/giggleheader-v1.0.0.zip manifest.json background.js src popup.html popup.css popup.js icons -x '*.DS_Store'
unzip -l dist/giggleheader-v1.0.0.zip
```
Expected: 包内含 `src/domain.js` 与 `src/rules.js`，无 test/docs 文件。

---

## Self-Review 结论

- **Spec 覆盖**：全局域名列表 → Task 2/4/5；optional_host_permissions → Task 3；域名规范化(含子域名) → Task 1；权限申请/移除流 → Task 5；buildRules 注入 requestDomains + 空列表不生效 → Task 2；popup 域名管理区 + 空提示 → Task 5；测试(domain + rules) → Task 1/2；手动端到端 → Task 6。均覆盖。
- **类型一致性**：`config` 结构 `{enabled, domains, headers}` 在 Task 2/4/5 一致；`normalizeDomain` 签名在 Task 1(定义)、Task 5(popup 使用)、测试中一致；`originsFor(domain)` 在 popup 内部 add/remove 复用同一实现；`requestDomains` 字段名在 Task 2 实现与测试一致。
- **无占位符**：所有代码步骤给出完整文件/片段，命令与预期输出明确。
- **注意**：Task 2 用整份替换 `test/rules.test.js`（旧测试无 domains 字段，会因新的 `Array.isArray(config.domains)` 校验全部返回 `[]`，必须同步更新）。
