/**
 * 规范化用户输入的域名：去空白、协议、前导 *.、路径/查询、端口，转小写。
 * 保留主机名本身（含子域名层级）。非法或不含点的输入返回空串。
 * @param {string} input
 * @returns {string}
 */
export function normalizeDomain(input) {
  if (typeof input !== "string") return "";
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, ""); // 去协议
  s = s.replace(/^\*\./, "");         // 去前导 *.
  s = s.split("/")[0];                // 去路径/查询
  s = s.split(":")[0];                // 去端口
  if (!s.includes(".")) return "";
  return s;
}

/**
 * 从可选权限的 origin 模式反推域名。
 * 接受形如 "*://example.com/*"、"*://*.example.com/*"、"https://example.com/*"。
 * 去掉 scheme、前导 *.、路径、端口，转小写。非法输入返回空串。
 * @param {string} origin
 * @returns {string}
 */
export function originToDomain(origin) {
  if (typeof origin !== "string") return "";
  let s = origin.trim().toLowerCase();
  s = s.replace(/^\*:\/\//, "");      // 去 *://
  s = s.replace(/^https?:\/\//, ""); // 或去 http(s)://
  s = s.replace(/^\*\./, "");         // 去前导 *.
  s = s.split("/")[0];                // 去路径
  s = s.split(":")[0];                // 去端口
  if (!s.includes(".")) return "";
  return s;
}
