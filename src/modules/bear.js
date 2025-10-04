// parse-cookie-token-expiry-cn.js
function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = str.length % 4;
  if (pad) str += '='.repeat(4 - pad);
  return Buffer.from(str, 'base64').toString('utf8');
}

function extractCookieValue(cookieStr, key) {
  const parts = cookieStr.split(';').map(s => s.trim());
  for (const p of parts) {
    if (p.startsWith(key + '=')) {
      return p.slice(key.length + 1);
    }
  }
  return null;
}

function formatDateCN(date) {
  if (!date) return null;
  // 转成东八区时间（UTC+8）
  const offset = 8 * 60; // 分钟
  const local = new Date(date.getTime() + offset * 60 * 1000);
  const YYYY = local.getUTCFullYear();
  const MM = String(local.getUTCMonth() + 1).padStart(2, '0');
  const DD = String(local.getUTCDate()).padStart(2, '0');
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  const ss = String(local.getUTCSeconds()).padStart(2, '0');
  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss} (GMT+8)`;
}

/**
 * 入参：整串 cookie 字符串
 * 返回：到期时间与有效天数等信息（东八区时间）
 */
function getTokenExpiryInfoFromCookie(cookieStr) {
  const token = extractCookieValue(cookieStr, 'token');
  if (!token) return { note: 'cookie 中未找到 token=...' };

  const segs = token.split('.');
  if (segs.length < 2) return { note: 'token 不是标准 JWT' };

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(segs[1]));
  } catch {
    return { note: '无法解析 JWT payload' };
  }

  const iat = typeof payload.iat === 'number' ? payload.iat : null;
  if (!iat) return { note: 'JWT 中缺少 iat，无法计算固定 7 天到期时间' };

  const issuedAt = new Date(iat * 1000);
  const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;
  const expiresAt = new Date((iat + SEVEN_DAYS_SEC) * 1000);

  const nowMs = Date.now();
  const remainingDays = (expiresAt.getTime() - nowMs) / 86400000;

  return {
    issuedAt: formatDateCN(issuedAt),
    expiresAt: formatDateCN(expiresAt),
    validDays: 7,
    remainingDays: Number(remainingDays.toFixed(1)),
    note: '按固定策略：到期时间 = iat + 7 天（忽略 exp）'
  };
}


// --- 示例 ---
if (require.main === module) {
  const cookieStr = `你的整串cookie...`;
  console.log(getTokenExpiryInfoFromCookie(cookieStr));
}

module.exports = { getTokenExpiryInfoFromCookie,extractCookieValue };