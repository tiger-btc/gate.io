
const logger = require('./modules/logger');
const { io } = require('socket.io-client');
const { readJsonFromFileSync } = require('./modules/json');
const { formatTimestamp } = require('./modules/util');
const { NotificationService } = require('./modules/notificationService');
const { get, setCallBack, updateOrder, clearAllOrders, oneKeyClose } = require('./account');

const WANT_USDT = 2.8;

const oldLog = console.log;
console.log = (...args) => {
  const ts = formatTimestamp(Date.now());
  oldLog(`[${ts}]`, ...args);
};

class SocketClient {
  constructor(url = 'http://127.0.0.1:3000') {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.url = url;
    this.connect();
    this.lastPrice = 0; // 最新价格
    this.indicators = {}; // 指标信息
    this.wantUsdt = WANT_USDT; // 期望利润
    this.scale = 0.02; // 默认缩放
    this.config = readJsonFromFileSync('./config/default.json');
    this.bark = new NotificationService(this.config.notification);
    this.bark.sendNotification('交易系统启动', 'GATE.IO');
  }

  async send_to_phone(msg) {
    if (this.bark) {
      const ts = formatTimestamp(Date.now());
      return await this.bark.sendNotification(`${ts} ${msg}`, 'GATE.IO');
    }
  }


  // 连接Socket.IO服务器
  connect() {
    console.log(`正在连接Socket.IO服务器 ${this.url}`);
    this.socket = io(this.url, {
      reconnection: true,
      timeout: 10000
    });
    this.setupEventHandlers();
  }

  // 设置事件处理器
  setupEventHandlers() {
    // 连接成功
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('Socket.IO连接成功', {
        socketId: this.socket.id,
        url: this.url
      });
      this.send_to_phone('大脑已连接');
    });

    // 连接断开
    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      console.warn('Socket.IO连接断开', {
        reason,
        socketId: this.socket.id
      });
      this.send_to_phone('大脑断开');
    });

    // 连接错误
    this.socket.on('connect_error', (error) => {
      this.reconnectAttempts++;
      console.log(`Socket.IO连接错误 ${error.message}`);
    });

    // 重连尝试
    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`Socket.IO重连尝试 ${attemptNumber} `);
    });

    // 重连成功
    this.socket.on('reconnect', (attemptNumber) => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log(`Socket.IO重连 ${attemptNumber} 成功`);
      this.send_to_phone('大脑已恢复连接');

    });

    // 监听交易信号
    const trade_map = ['open', 'add', 'reduce', 'close'];
    for (let action of trade_map) {
      this.socket.on(`trade:${action}`, async (data) => {
        await this.handleTradeSignal(data.trade);
      });
    }


    // 监听其他事件
    this.socket.onAny((eventName, ...args) => {
      // 其他事件暂不关心
      // heartbeat
      //console.log(eventName);
      if (eventName === 'heartbeat') {
        //console.log(args);
        this.lastPrice = args[0].lastPrice;
        this.indicators = args[0].indicators;
      }

      if (eventName === 'position:update') {
        const last_pos = this.pos === null ? {} : { ...this.pos };
        this.pos = args[0].position;
        if (this.pos) {
          if (this.pos.sub_price * last_pos.sub_price < 0 || this.pos.sub_price_avg * last_pos.sub_price_avg < 0) {
            console.log('盈 <==> 亏');
          }
        }
      }
    });
  }

  // 处理交易信号
  async handleTradeSignal(data) {
    try {
      //console.log('收到交易信号', data);
      const { quantity: amount, type, side, timestamp, reason, price } = data;
      const msg = `收到 ${side} ${type} ${amount} 在 ${price} ${reason}`;
      this.bark.sendTradeNotification(msg, { success: true });
      // 检查信号时效性（可选）
      if (timestamp) {
        const now = Date.now();
        const signalTime = new Date(timestamp).getTime();
        const delay = now - signalTime;

        if (delay > 30000) { // 30秒
          return;
        }
      }
      console.log(msg);
      if (type === 'OPEN') {
        // 市价开单
        // 开单 1.5s后
        const size = this.scale * amount;
        await updateOrder('add', side, size, price);
      }
      if (type === 'ADD' || type === 'REDUCE') {
        setTimeout(async () => {
          await this.go();
        }, 1500);
      }

      if (type === 'CLOSE') {
        // 平仓
        await oneKeyClose('保险平仓');
      }

    } catch (error) {
      logger.error('处理交易信号时发生错误', {
        data,
        error: error.message,
        es: error.stack
      });
    }
    finally {

    }
  }

  // 断开连接
  disconnect() {
    if (this.socket) {
      console.log('正在断开Socket.IO连接');
      this.socket.disconnect();
      this.isConnected = false;
    }
  }

  // 获取连接状态
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      socketId: this.socket?.id || null,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  getRemotePosition() {
    // 获得模拟服务器仓位 只关心 方向 价格 数量
    if (this.pos) {
      const { side, size, avgPrice: price, reduceCount, addCount, reduce_conf, sub_price_avg, sub_price, entryRefPrice: entryPrice, add_conf } = this.pos;
      const add_sub = add_conf[0] === 0 ? 200 : add_conf[0];
      const reduce_sub = reduce_conf.at(reduceCount) === 0 ? 6 : reduce_conf.at(reduceCount);
      const add_size = add_conf[1];
      const add_price = side === 'LONG' ? entryPrice - add_sub : entryPrice + add_sub; // 补仓价格用加仓价格
      const reduce_size = size / (reduceCount + 1);
      const reduce_price = side === 'LONG' ? price + reduce_sub : price - reduce_sub; // 减仓价格用均价

      return {
        side, // 方向
        size,  // 大小
        price: Number(price).toFixed(2),  // 持仓价格
        add_price, // 补仓价
        add_size, // 补仓数量
        reduce_price, // 减仓价
        reduce_size, // 减仓数量
        zy: reduce_sub,
        entryPrice, // 补仓价
        reduceCount, // 减仓次数
        addCount, // 加仓次数
        sub_price_avg, //持仓差价
        sub_price //补仓差价
      };
    }
    return null;

  }

  async getLocalPosition() {
    // 获得本地交易所仓位
    const pos = get('pos');
    if (pos) {
      const { size: raw_size, entry_price: price } = pos;

      const side = raw_size > 0 ? 'LONG' : 'SHORT';
      const size = Math.abs(raw_size / 100);
      return {
        side, size, price
      };
    }
    return null;

  }

  getLimitPriceByPos(pos) {
    // 根据仓位和利润计算出应该设置的止盈价格
    let wantUsdt = this.wantUsdt;
    const feeRate = 0.0002;//限价单
    const { side, size, price, fee = 0 } = pos;
    if (size <= 0) throw new Error("size 必须大于 0");

    if (side === "LONG") {
      // 净利润 = size*(target - entry) - entry_fee - feeRate*size*target = wantUsdt
      return (wantUsdt + fee + size * price) / (size * (1 - feeRate));
    } else if (side === "SHORT") {
      // 净利润 = size*(entry - target) - entry_fee - feeRate*size*target = wantUsdt
      return (size * price - (wantUsdt + fee)) / (size * (1 + feeRate)); // ← 修正点
    } else {
      throw new Error("side 必须是 LONG 或 SHORT");
    }

  }

  async set_reduce(local_pos, remote_pos) {
    // 设置减仓
    if (local_pos) {
      // 本地有仓位
      console.log(`真实仓位: ${local_pos.side} ${Number(local_pos.price).toFixed(2)} ${local_pos.size}`);
      const { side, size: local_size, price: local_entry } = local_pos;
      const can_open_flag = side === 'LONG' ? this.indicators.can_open_long_flag : this.indicators.can_open_short_flag;
      if (remote_pos) {
        console.log(`模拟仓位: ${remote_pos.side} ${Number(remote_pos.price).toFixed(2)} ${remote_pos.size}`);
        // 服务端也有仓位才会设置止盈
        // reduceCount = 0 的时候 如果 加仓次数 禁止标志 可开仓标志 可加仓标志 都满足的话 不设置止盈 有一项不符合 设置止盈 提前跑
        const { addCount, reduceCount } = remote_pos;
        console.log(`加仓 ${addCount}次 减仓 ${reduceCount}次 禁止: ${this.indicators.no_flag} 开仓条件: ${can_open_flag} 加仓条件:${this.indicators.can_add_flag}`);
        let need_quit = false;
        if (addCount > 0 || this.indicators.no_flag || !can_open_flag || !this.indicators.can_add_flag || reduceCount > 0) {
          // 加过仓 止盈跑路
          // 禁止标志亮了 止盈跑
          // 开仓条件不符合了 止盈跑
          // 可加仓标志不符合了 止盈跑
          // 减仓次数超过1次 止盈跑
          need_quit = true;
          console.log('感知到危险,提前跑');
        }
        const size = need_quit ? local_size : local_size / 2; // 情况不对的时候跑全部 其他的时候跑一半
        const price_1 = this.getLimitPriceByPos({ ...local_pos, size });
        console.log(`本地止盈 ${Math.abs(price_1 - Number(local_entry)).toFixed(2)} 点`, price_1.toFixed(2));
        const price_2 = remote_pos.reduce_price;
        console.log(`模拟止盈 ${remote_pos.zy} 点`, price_2);
        const min_price = price_1 > price_2 ? price_2 : price_1;
        const max_price = price_1 > price_2 ? price_1 : price_2;
        const price = side === 'LONG' ? min_price : max_price;//多仓取小的 空仓取大的容易实现
        const rl = 0.15;//让点
        const target_price = side === 'LONG' ? price - rl : price + rl;
        await updateOrder('reduce', side, size, target_price);
      }
      else {
        // 服务端没有仓位的话 直接设置止盈  考虑设置止损
        const { side, size } = local_pos;
        const price = this.getLimitPriceByPos(local_pos);
        console.log('本地止盈', price);
        await updateOrder('reduce', side, size, price);
      }
    }

  }

  async set_add(local_pos, remote_pos) {
    // 加仓补仓

    if (remote_pos) {
      // 服务端有仓位 且禁止标志没打开 
      // 补仓
      const { side, entryPrice: old_price, addCount, size: remote_size } = remote_pos; //entryPrice使用模拟端补仓价 price 使用模拟端持仓价  使用补仓价更安全


      //console.log(`模拟仓位: ${side} 补仓价:${Number(old_price).toFixed(2)} ${remote_size}  补仓:${addCount}次`);
      const can_open_flag = side === 'LONG' ? this.indicators.can_open_long_flag : this.indicators.can_open_short_flag;
      if (local_pos === null) {
        // 本地无仓位 这里判断null 是为了区别于网络获取失败的时候结果的undefined
        if (this.indicators.no_flag === false && this.indicators.can_add_flag === true && can_open_flag === true) {
          // 符合追仓条件
          const size = remote_size * this.scale;
          const add_or_sub = side === 'LONG' ? -1.5 : 1.5;
          const price = Number(old_price) + add_or_sub; // 这里设置追仓价 为模拟端持仓价 上下5*0.36=1.8左右 数值越追加开仓机会越多 但是太小的话需要考虑滑点带来的伤害
          console.log(`追仓 ${side} ${size} ==> ${price}`);
          await updateOrder('add', side, size, price);
        }
        else {
          // 不符合追仓条件
          if (this.indicators.no_flag) {
            console.log('转变为禁止标志');
            if (get('add') || get('reduce')) {
              // 如果有委托 那么取消了
              await clearAllOrders();
            }
          }
        }

      }
      else {
        // 本地有仓位 浮亏 准备补仓
        // 得到模拟仓位的加仓价格、加仓配置、加仓次数 算出应该的补仓价格、补仓数量
        const { add_price: price, add_size } = remote_pos;
        const local_size = Math.abs(Number(local_pos.size));
        const remote_size = remote_pos.size * this.scale;
        const price_ok = (side === 'LONG' ? this.lastPrice > price : this.lastPrice < price) && this.lastPrice;
        // 开多的时候 加仓的价格必须比当前价格要低
        // 开空的时候 加仓的价格必须比当前价格要高

        if (add_size > 0 && this.indicators.can_add_flag === true && local_size <= remote_size && price_ok) {
          //要对比仓位大小,不然会出现本地现价单成交了 但是模拟端没成交 就会不停的成交
          const size = add_size * this.scale;

          console.log(`第${addCount}次补仓 ${side} ${size} ==> ${price}`);
          await updateOrder('add', side, size, price);
        }
      }

    }


  }

  async go() {
    // 核心逻辑
    // 设置限价单 取得本地仓位 设置止盈单
    this.last_t = Date.now();
    try {

      const local_pos = await this.getLocalPosition();
      const remote_pos = this.getRemotePosition();
      if (remote_pos) {
        // 模拟有仓位

        const { sub_price_avg, sub_price } = remote_pos;
        console.log(`入场价差 ${sub_price.toFixed(2)} 持仓价差 ${sub_price_avg.toFixed(2)}`);

        await this.set_reduce(local_pos, remote_pos);
        await this.set_add(local_pos, remote_pos);


        oldLog('\n\n');
      }
      else {
        // 模拟无仓位 考虑减仓
        if (local_pos) {
          await this.set_reduce(local_pos, remote_pos);
        }

      }

    } catch (error) {
      logger.error(error.stack);
    }
    finally {
      this.last_t = Date.now();
    }

  }

}


if (require.main === module) {
  global.socket = new SocketClient();
  socket.get = get;
  const callback = function () {
    global.socket.go();
  }
  //setCallBack(callback);
  //setTimeout(callback, 1000);
  setInterval(callback, 1000);
}
module.exports = SocketClient;

