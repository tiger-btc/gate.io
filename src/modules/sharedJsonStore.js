// sharedJsonStore.js
// 依赖：npm i redis
// 说明：基于 RedisJSON（JSON.GET/JSON.SET）+ Pub/Sub 的“共享数据”存取与事件发布

const { createClient } = require('redis');

class SharedJsonStore {
  /**
   * @param {Object} options
   * @param {string} options.url         Redis 连接串（如 redis://127.0.0.1:6379）
   * @param {string} options.key         JSON 文档主键（如 'shared:data'）
   * @param {string} [options.channel]   事件频道（默认 `${key}:events`）
   * @param {Object} [options.redisOpts] 透传给 createClient 的更多选项
   */
  constructor({ url, key, channel, redisOpts = {} }) {
    if (!url) throw new Error('url required');
    if (!key) throw new Error('key required');

    this.url = url;
    this.key = key;
    this.channel = channel || `${key}`;

    // 一个常规客户端（读/写/发布）
    this.client = createClient({ url, ...redisOpts });
    this.client.on('error', (e) => console.error('[redis] client error:', e));

    // 订阅要用独立连接（按需懒初始化）
    this.sub = null;
  }

  /** 建立连接（幂等） */
  async connect() {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
    return this;
  }

  /** 关闭所有连接 */
  async close() {
    try { if (this.sub?.isOpen) await this.sub.quit(); } catch { }
    try { if (this.client?.isOpen) await this.client.quit(); } catch { }
  }

  /** 读取整个 JSON 文档（不存在返回 {}） */
  async read() {
    await this.connect();
    const raw = await this.client.sendCommand(['JSON.GET', this.key]);
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
  }

  /**
   * 写入（合并模式）：把 update 与现有 JSON 合并，并附上 updatedAt
   * @param {Object} update
   * @param {Object} [opts]
   * @param {boolean} [opts.publishEvent=true] 写入后是否发布事件
   * @param {string}  [opts.type='UPDATED']    事件类型
   */
  async write(update, { publishEvent = true, type = 'update' } = {}) {
    await this.connect();

    // 取旧值并合并
    let newData = { ...update };
    if (type === 'update') {
      // update 更新 其他值则覆盖
      const current = await this.client.sendCommand(['JSON.GET', this.key]);
      const obj = current ? JSON.parse(current) : {};
      newData = { ...obj, ...update, updatedAt: Date.now() };
    }

    // JSON.SET 覆盖写入（整个文档）
    await this.client.sendCommand(['JSON.SET', this.key, '$', JSON.stringify(newData)]);

    // 发布事件（可被其它程序订阅）
    if (publishEvent) {
      await this.client.publish(
        this.channel,
        JSON.stringify({ event: type, data: newData, ts: Date.now() })
      );
    }
    return newData;
  }

  /**
   * 仅发布一个自定义事件（不写数据）
   * @param {string} type
   * @param {Object} [extra]
   */
  async publish(type, extra = {}) {
    await this.connect();
    await this.client.publish(
      this.channel,
      JSON.stringify({ event: type, ts: Date.now(), data: extra })
    );
  }

  /**
   * 订阅事件（可选使用）
   * @param {(msg:{type:string,key:string,ts:number,[k:string]:any})=>void} handler
   * @returns {Promise<()=>Promise<void>>} 取消订阅函数
   */
  async subscribe(handler) {
    if (!this.sub) {
      this.sub = createClient({ url: this.url });
      this.sub.on('error', (e) => console.error('[redis] sub error:', e));
      await this.sub.connect();
    }
    await this.sub.subscribe(this.channel, (message) => {
      try { handler(JSON.parse(message)); } catch { /* ignore */ }
    });
    // 返回取消订阅函数
    return async () => {
      if (this.sub?.isOpen) {
        await this.sub.unsubscribe(this.channel);
      }
    };
  }
}

module.exports = { SharedJsonStore };
