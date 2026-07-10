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
