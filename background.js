import { buildRules } from "./src/rules.js";

const DEFAULT_CONFIG = { enabled: true, domains: [], headers: [] };

// 在扩展图标上显示当前生效的规则条数；为 0 时清空角标。
async function updateBadge(count) {
  await chrome.action.setBadgeBackgroundColor({ color: "#2da44e" });
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
}

// 读取配置，翻译成 DNR 规则，并全量替换当前动态规则。
async function syncRules() {
  const { config = DEFAULT_CONFIG } = await chrome.storage.local.get("config");
  const addRules = buildRules(config);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
    await updateBadge(addRules.length);
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
