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
