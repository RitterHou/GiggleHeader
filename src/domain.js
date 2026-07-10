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
