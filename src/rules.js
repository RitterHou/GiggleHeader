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
