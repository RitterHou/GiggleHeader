import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDomain, originToDomain } from "../src/domain.js";

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

test("originToDomain: bare origin", () => {
  assert.equal(originToDomain("*://example.com/*"), "example.com");
});

test("originToDomain: wildcard-subdomain origin", () => {
  assert.equal(originToDomain("*://*.example.com/*"), "example.com");
});

test("originToDomain: keeps explicit subdomain", () => {
  assert.equal(originToDomain("*://api.example.com/*"), "api.example.com");
});

test("originToDomain: http scheme origin", () => {
  assert.equal(originToDomain("https://example.com/*"), "example.com");
});

test("originToDomain: invalid input returns empty", () => {
  assert.equal(originToDomain(""), "");
  assert.equal(originToDomain(null), "");
  assert.equal(originToDomain("<all_urls>"), "");
});
