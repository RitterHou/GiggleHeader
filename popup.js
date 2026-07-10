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
