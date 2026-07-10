# GiggleHeader 设计文档

**日期**：2026-07-10
**状态**：已批准，待实现

## 背景与动机

ModHeader 扩展（用于修改 HTTP header 的开发者工具）被 Chrome 标记为"包含恶意软件"并禁用。ModHeader 7.x 曾因数据收集问题被下架。本项目目标是自己实现一个**纯本地、零数据收集、开源可审计**的替代品，只覆盖最核心、最常用的能力。

## 范围（Scope）

**做什么**：
- 修改浏览器发出请求的 **Request Headers**：添加/覆盖（set）、删除（remove）。
- 全局生效——对浏览器发出的**所有请求**应用规则（不做 URL 过滤）。
- 总开关：一键启用/禁用全部。
- 行内开关：每条 header 规则可单独启用/禁用。

**不做什么（YAGNI）**：
- 不修改 Response Headers。
- 不做 URL / 域名过滤条件。
- 不做多套 Profile 配置切换。
- 不做 URL 重定向、导入/导出等高级功能。

如后续需要，这些都可以在当前架构上增量添加。

## 技术方案

采用 **`declarativeNetRequest`（DNR）API**（Manifest V3 官方推荐）。

**为什么不用其他方案**：
- `webRequest` blocking（`onBeforeSendHeaders`）：MV3 中普通扩展已无法获得 blocking 权限，走不通。
- MV2：已被 Chrome 淘汰，新装扩展无法加载。

DNR 的关键优势：扩展代码**读不到**请求的实际内容，只是声明"如何改 header"，由浏览器执行。权限干净、性能好，天然避开"窥探全部流量"的嫌疑——这正对应替换 ModHeader 的动机。

## 架构

```
GiggleHeader/
├── manifest.json          # MV3；权限: declarativeNetRequest, storage；host_permissions: <all_urls>
├── background.js          # service worker：读配置 → 生成并更新 DNR 动态规则
├── popup.html             # 弹窗结构
├── popup.css              # 弹窗样式
├── popup.js               # 弹窗交互逻辑
└── icons/                 # 16 / 48 / 128 图标
```

### 组件职责

- **manifest.json**：声明 MV3 配置、权限、popup 入口、service worker 入口。
- **background.js**（service worker）：
  - 职责：把用户配置翻译成 DNR 动态规则并保持同步。
  - 依赖：`chrome.storage`、`chrome.declarativeNetRequest`。
  - 触发时机：扩展安装/启动（`onInstalled`、`onStartup`）、以及 `chrome.storage.onChanged`。
- **popup.\***：
  - 职责：展示与编辑配置，改动即时写入 storage。
  - 依赖：`chrome.storage.local`。
  - 不直接操作 DNR 规则——只写 storage，由 background 统一处理，保证单一数据源。

## 数据模型

存储于 `chrome.storage.local`，键名 `config`：

```js
{
  enabled: true,                 // 全局总开关
  headers: [
    {
      id: "<唯一字符串>",        // 稳定标识，用于渲染与规则 id 映射
      name: "X-Example",         // header 名
      value: "hello",            // header 值（op 为 remove 时忽略）
      enabled: true,             // 行内开关
      op: "set"                  // "set"(添加/覆盖) | "remove"(删除)
    }
  ]
}
```

## 数据流

单向、单一数据源：

```
用户在 popup 编辑
  → popup.js 写入 chrome.storage.local (config)
    → background.js 监听 chrome.storage.onChanged
      → 过滤出「全局开关开 且 行内开关开 且 name 非空」的 header
        → 翻译成 DNR 规则数组，调用 declarativeNetRequest.updateDynamicRules()
          → 浏览器对后续所有请求自动改 header
```

### DNR 规则翻译规则

- 仅当 `config.enabled === true` 时生成规则；否则清空全部动态规则。
- 每条 `enabled === true` 且 `name` 非空的 header 生成一条规则：
  - `action.type = "modifyHeaders"`
  - `action.requestHeaders = [{ header: name, operation: op === "remove" ? "remove" : "set", value }]`（remove 时不带 value）
  - `condition.urlFilter = "*"`，`condition.resourceTypes` 覆盖全部相关类型（如 main_frame、sub_frame、xmlhttprequest、script、stylesheet、image、font、media、websocket、other 等）
  - `priority = 1`
- 更新时先取当前动态规则 id 全量移除，再添加新规则（`removeRuleIds` + `addRules`），避免 id 冲突。

## 错误处理

- `updateDynamicRules` 失败：在 service worker 中 `catch` 并 `console.error`，不阻塞其余逻辑。
- header name 非法（空、含非法字符）：popup 侧做基本校验/提示；background 侧跳过 name 为空的行，避免生成非法规则。
- storage 读取为空（首次安装）：background 写入默认 `config`（`enabled: true, headers: []`）。

## 测试策略

- **规则翻译纯函数**：把「config → DNR 规则数组」抽成不依赖 chrome API 的纯函数，单元测试覆盖：全局关、行内关、set、remove、空 name 跳过、多行等场景。
- **手动端到端验证**：加载未打包扩展 → 设置一个自定义 header → 打开一个可回显请求头的页面（如 httpbin.org/headers 或本地 echo 服务）确认 header 生效 → 关闭总开关确认失效。

## 隐私定位

- 纯本地运行：无任何网络请求、无数据上报、无第三方依赖/SDK。
- 全部代码开源、可审计。
- 权限最小化说明：`<all_urls>` 与 `declarativeNetRequest` 是"全局修改请求头"这一功能的必需权限；扩展本身不读取请求内容。
