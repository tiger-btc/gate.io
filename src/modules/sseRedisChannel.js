// sseRedisChannel.js
// 功能：对接你现有的 server.js（端口 3001）
// - publish(): POST /publish
// - latest():  GET /latest/:channel （带 ETag 缓存）
// - listen():  SSE 订阅 /sse/:channel（自动重连）
//
// 依赖：eventsource（用于 Node 环境的 EventSource 实现）

// 兼容多种导出形态 & Node 未来内置
function resolveEventSource() {
  // Node 可能在未来提供 globalThis.EventSource
  if (typeof globalThis.EventSource === 'function') return globalThis.EventSource;
  // 兼容不同的导出格式
  const mod = require('eventsource');
  return mod.EventSource || mod.default || mod;
}
const EventSourceCtor = resolveEventSource();


class ChannelClient {
  /**
   * @param {Object} opts
   * @param {string} opts.baseURL  例如: 'http://127.0.0.1:3001'
   * @param {string} opts.channel  频道名
   * @param {Object} [opts.headers]  可选，附加到 HTTP 请求与 SSE 头部（如鉴权）
   * @param {number} [opts.sseRetry]  可选，SSE重连间隔ms（eventsource默认1000ms）
   */
  constructor({ baseURL, channel, headers = {}, sseRetry } = {}) {
    if (!baseURL) throw new Error('baseURL required');
    if (!channel) throw new Error('channel required');
    this.baseURL = baseURL.replace(/\/+$/, '');
    this.channel = channel;
    this.headers = headers;
    this.sseRetry = Number.isInteger(sseRetry) ? sseRetry : undefined;

    // ETag 缓存（latest用）
    this._etag = undefined;

    // SSE 连接与回调
    this._es = null;
    this._onUpdate = null;
    this._onMessage = null;
    this._onError = null;
    this._onOpen = null;
  }

  /**
   * 发布消息（同时写 Redis 最新值 + 广播）
   * @param {any} data        任意可序列化对象
   * @param {Object} [opts]
   * @param {string} [opts.event='update']  事件名
   * @param {number} [opts.ttl]             最新值KV的过期秒数（不影响广播）
   * @returns {Promise<{ok:boolean, ts:number}>}
   */
  async publish(data, { event = 'update', ttl } = {}) {
    const body = { channel: this.channel, data, event };
    if (Number.isInteger(ttl) && ttl > 0) body.ttl = ttl;

    const res = await fetch(`${this.baseURL}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.headers },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`publish failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  /**
   * 拉取“最新值”（带 ETag，支持 304）
   * @returns {Promise<{fresh: boolean, value: any | null}>}
   *          fresh=true 表示拿到新内容；false 表示服务端返回304（沿用旧值）
   */
  async latest() {
    const headers = { ...this.headers };
    if (this._etag) headers['If-None-Match'] = this._etag;

    const res = await fetch(`${this.baseURL}/latest/${encodeURIComponent(this.channel)}`, { headers });
    if (res.status === 304) {
      return { fresh: false, value: null }; // 本地不变更
    }
    if (res.status === 404) {
      this._etag = undefined;
      return { fresh: true, value: null }; // 暂无数据
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`latest failed: ${res.status} ${text}`);
    }
    const etag = res.headers.get('etag') || undefined;
    if (etag) this._etag = etag;

    const text = await res.text();
    let value = null;
    try { value = JSON.parse(text); } catch { value = text; }
    return { fresh: true, value };
  }

  /**
   * 订阅频道（SSE）
   * @param {Object} handlers
   * @param {(payload:any)=>void} [handlers.onUpdate]  处理 event:'update' 的数据
   * @param {(raw:string)=>void}  [handlers.onMessage] 兜底 onmessage（不带event名）
   * @param {(err:any)=>void}     [handlers.onError]
   * @param {()=>void}            [handlers.onOpen]
   * @returns {()=>void}          关闭函数
   */
  listen({ onUpdate, onMessage, onError, onOpen } = {}) {
    this._onUpdate  = onUpdate  || null;
    this._onMessage = onMessage || null;
    this._onError   = onError   || null;
    this._onOpen    = onOpen    || null;

    const url = `${this.baseURL}/sse/${encodeURIComponent(this.channel)}`;
    const esOpts = { headers: this.headers };
    if (this.sseRetry) esOpts['reconnectInterval'] = this.sseRetry;

    const es = new EventSourceCtor(url, esOpts);

    this._es = es;

    // 自定义事件：update
    es.addEventListener('update', (e) => {
      if (!this._onUpdate) return;
      let payload = e.data;
      try { payload = JSON.parse(e.data); } catch {} // 服务端发的是JSON字符串
      this._onUpdate(payload);
    });

    // 兜底 message
    es.onmessage = (e) => {
      if (this._onMessage) this._onMessage(e.data);
    };

    es.onerror = (err) => {
      if (this._onError) this._onError(err);
      // eventsource 会自动重连；这里不需要手动处理
    };

    es.onopen = () => {
      if (this._onOpen) this._onOpen();
    };

    // 返回关闭函数
    return () => this.close();
  }

  /**
   * 关闭 SSE 连接
   */
  close() {
    if (this._es) {
      try { this._es.close(); } catch {}
      this._es = null;
    }
  }
}

module.exports = { ChannelClient };
