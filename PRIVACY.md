# GiggleHeader 隐私权政策 / Privacy Policy

_最后更新 / Last updated: 2026-07-10_

## 简体中文

GiggleHeader 是一个纯本地运行的开发者工具，用于修改浏览器发出的 HTTP 请求头。

**我们不收集任何数据。** 具体而言：

- 本扩展**不收集、不存储、不传输**任何个人信息或用户数据。
- 你配置的生效域名和请求头规则，**仅保存在你本机的 `chrome.storage.local`**，不会上传或同步到任何服务器。
- 本扩展**不发起任何网络请求**（除了浏览器本身发出、被你的规则修改的请求），**不包含任何分析、统计、追踪或第三方代码**。
- 本扩展**无法读取**你的请求内容——它基于 Manifest V3 的 `declarativeNetRequest` API，只声明"如何修改请求头"，由浏览器执行。

**权限说明：**

- `declarativeNetRequest`：用于按你的配置修改 HTTP 请求头。
- `storage`：用于在本机保存你的配置。
- 可选主机权限（optional host permissions）：仅当你在扩展中主动添加某个域名时，才向该域名申请权限，用于对其请求生效。

如需卸载，直接在 Chrome 扩展页移除即可，本机数据随之清除。

联系方式：derobukal@gmail.com

---

## English

GiggleHeader is a fully local developer tool for modifying outgoing HTTP request headers.

**We collect no data.** Specifically:

- This extension **does not collect, store, or transmit** any personal information or user data.
- The domains and header rules you configure are stored **only in your local `chrome.storage.local`** and are never uploaded or synced to any server.
- This extension **makes no network requests** (other than the browser's own requests that your rules modify) and contains **no analytics, tracking, or third‑party code**.
- This extension **cannot read** your request contents — it uses the Manifest V3 `declarativeNetRequest` API, declaring only *how* to modify headers, executed by the browser.

**Permissions:**

- `declarativeNetRequest`: to modify HTTP request headers per your configuration.
- `storage`: to save your configuration locally.
- Optional host permissions: requested only when you explicitly add a domain, to apply rules to that domain's requests.

To uninstall, remove the extension from Chrome's extensions page; local data is cleared accordingly.

Contact: derobukal@gmail.com
