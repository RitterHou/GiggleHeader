# GiggleHeader 按域名生效改造 设计文档

**日期**：2026-07-10
**状态**：已批准，待实现
**关联**：在 [2026-07-10-giggleheader-request-header-modifier-design.md](2026-07-10-giggleheader-request-header-modifier-design.md) 基础上的功能变更

## 背景与动机

初版扩展用 `host_permissions: <all_urls>` 对所有请求全局生效。上架 Chrome Web Store 时，广泛主机权限会触发"深入审核"（更慢、更严、更易被拒），也更容易被审核员往"可疑软件"方向联想（正是 ModHeader 被下架的敏感点）。

本次改造把作用域从"全局所有网站"改为"用户指定的域名列表"，并把主机权限从安装时静态声明改为运行时按需申请（`optional_host_permissions`）。这样商店审核只看到 `storage` 与 `declarativeNetRequest` 两个不敏感权限，绕开深入审核，也更安全。

## 范围

**做什么**：
- 新增全局「生效域名列表」：所有 header 规则只对列表内的域名（及其子域名）生效。
- 主机权限改为可选权限，用户在 popup 添加域名时运行时申请。
- `buildRules` 给规则注入 `requestDomains` 条件；域名列表为空时不产生任何规则。
- popup 新增域名管理区。

**不做什么（YAGNI）**：
- 不做路径级 / 查询参数级过滤，只到域名（含子域名）粒度。
- 不做按单条 header 各自指定域名（作用域是全局列表，所有 header 共享）。
- 不保留任何"对所有网站全局生效"的开关。

## 作用域模型

全局一份域名列表，与 header 列表分开管理。所有启用的 header 规则统一对列表内域名生效。

## 数据模型

`chrome.storage.local` 的 `config`：

```js
{
  enabled: true,                 // 全局总开关（不变）
  domains: ["example.com"],      // 新增：全局生效域名列表（已授权的规范化域名）
  headers: [                     // 不变
    { id, name, value, enabled, op }
  ]
}
```

默认配置：`{ enabled: true, domains: [], headers: [] }`。

## 域名规范化与匹配

- 用户输入经 `normalizeDomain(input)` 规范化：去除前后空白、`http(s)://` 协议前缀、端口、路径/查询（`/` 及其后）、以及前导 `*.`。**保留主机名本身，不删子域名层级**。示例：`https://api.example.com/x?y` → `api.example.com`；`*.example.com` → `example.com`；`  example.com:8080  ` → `example.com`。空串或非法（不含 `.`）返回空串，调用方拒绝加入。
- 匹配语义：DNR `condition.requestDomains: ["example.com"]` 天然匹配 `example.com` 及其所有子域名（`api.example.com` 等），符合"含子域名"要求。

## 权限

`manifest.json`：

```json
{
  "permissions": ["declarativeNetRequest", "storage"],
  "optional_host_permissions": ["*://*/*"]
}
```

- 删除 `host_permissions`。
- 安装时不授予任何主机权限；用户添加域名时运行时申请对应 origin。

### 权限申请流（在 popup 中，用户手势内）

- 添加域名 `d`：调用 `chrome.permissions.request({ origins: ["*://" + d + "/*", "*://*." + d + "/*"] })`。用户点"允许"（返回 `true`）后才把 `d` 写入 `config.domains` 并保存；拒绝则不改动，提示未授权。
- 删除域名 `d`：从 `config.domains` 移除并保存，同时 `chrome.permissions.remove({ origins: [...同上] })`（失败忽略，不阻塞）。

## buildRules 变化

`buildRules(config)`（`src/rules.js`）：

- 若 `!config.enabled` 或 `domains` 为空数组 或 `headers` 非数组 → 返回 `[]`。
- 否则对每条 `enabled === true` 且 `name` 规范化后非空的 header 生成规则：
  - `action`：不变（`modifyHeaders`，set 带 value / remove 不带）。
  - `condition`：`{ requestDomains: [...规范化后的 domains], resourceTypes: ALL_RESOURCE_TYPES }`。
  - `id`：保留行内从 1 递增（不变）。
  - `priority: 1`（不变）。
- 域名规范化在写入 `config.domains` 时已完成，`buildRules` 直接使用；但仍对 `domains` 做一次防御性过滤（去空、去重）。

## background 变化

- `syncRules` 逻辑不变（读 config → buildRules → 全量替换动态规则 → 更新 badge）。
- `DEFAULT_CONFIG` 增加 `domains: []`。
- badge 仍显示生效规则条数（domains 为空时 buildRules 返回空 → badge 清空）。

## popup 变化

在总开关下方、header 列表上方新增「生效域名」区：

- 展示 `config.domains` 每个域名，右侧删除按钮。
- 一个输入框 + "添加"按钮：读取输入 → `normalizeDomain` → 非法则提示 → 合法则 `permissions.request` → 授权成功写入并重渲染。
- header 行渲染逻辑不变。
- 域名列表为空时，显示一行浅色提示："请至少添加一个生效域名，否则规则不会生效"。

## 错误处理

- `permissions.request` 被拒绝：不修改 config，popup 给出简短提示（如输入框下方红字），不抛出。
- 非法域名输入（规范化为空或不含 `.`）：不申请权限，提示"请输入合法域名"。
- `permissions.remove` 失败：忽略（域名已从配置移除，规则不再生效即达目的）。

## 测试策略

`buildRules` 纯函数单测（`test/rules.test.js`）在原有基础上扩展/调整：

- `domains` 为空 → `[]`（即使 enabled 且有 header）。
- 有 domains + 一条 set header → 规则 `condition.requestDomains` 等于该 domains，且含 `resourceTypes`。
- remove op → 同前，requestHeaders 不带 value。
- 全局开关关 → `[]`。
- 行内 enabled=false / name 空 → 跳过（不变）。
- 多域名 → requestDomains 含全部域名。
- `normalizeDomain` 若抽为可导出纯函数，单独测：`https://api.example.com/x` → `api.example.com`、`*.example.com` → `example.com`、`  example.com:8080  ` → `example.com`、`""`/`"foo"`（无点）→ `""`。

`normalizeDomain` 抽到 `src/rules.js` 或同目录 `src/domain.js` 作为可导出纯函数，供 popup 与测试共用。

**手动端到端**：加载扩展 → popup 添加域名 `httpbin.org`（授权）→ 设置 header → 访问 `https://httpbin.org/headers` 确认生效 → 访问其他站点确认**不**生效 → 删除域名确认失效。

## 审核收益

- manifest 无广泛主机权限 → 常规审核，绕开深入审核警告。
- 隐私更强：仅对用户显式授权的域名改 header，不触碰其他网站。
