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
