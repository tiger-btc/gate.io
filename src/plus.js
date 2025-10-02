const HttpClient = require('./modules/httpClient');
const logger = require('./modules/logger');
const { io } = require('socket.io-client');
const { readJsonFromFileSync } = require('./modules/json');
const { formatTimestamp } = require('./modules/util');
const { NotificationService } = require('./modules/notificationService');

const WANT_USDT = 2.8;

const oldLog = console.log;
console.log = (...args) => {
  const ts = formatTimestamp(Date.now());
  oldLog(`[${ts}]`, ...args);
};

class SocketClient {
  constructor(url = 'http://127.0.0.1:3000', lr_width = 5) {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.url = url;
    this.connect();
    this.pos = null; // 模拟服务器仓位
    this.lastPrice = 0;
    this.reduce_order_id_string = ''; // 限价止盈单id
    this.add_order_id_string = ''; // 限价加仓单id
    this.lr_width = lr_width;//暂时放弃使用
    this.httpClient = new HttpClient();
    this.contract = "ETH_USDT";
    this.local_pos_cache = null; // 交易所仓位(上一次)
    this.local_order_cache = [];
    this.indicators = {};
    this.wantUsdt = WANT_USDT;
    this.last_t = 0;
    this.scale = 1;
    this.limit_add_size = 0;
    this.config = readJsonFromFileSync('./config/default.json');
    this.bark = new NotificationService(this.config.notification);
    setTimeout(async () => {
      this.bark.sendNotification('交易系统启动', 'GATE.IO');
      await this.updateAuth();
    }, 0);
    setInterval(async () => {
      await this.updateAuth();
    }, 1000);
  }

  async send_to_phone(msg) {
    if (this.bark) {
      return await this.bark.sendNotification(msg, 'GATE.IO');
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
        this.pos = args[0].position;
      }
    });
  }

  // 处理交易信号
  async handleTradeSignal(data) {
    try {
      console.log('收到交易信号', data);
      this.bark.sendTradeNotification(data, '');

      const { quantity: amount, type, side, timestamp, reason, price } = data;
      // 检查信号时效性（可选）
      if (timestamp) {
        const now = Date.now();
        const signalTime = new Date(timestamp).getTime();
        const delay = now - signalTime;

        if (delay > 30000) { // 30秒
          return;
        }
      }
      console.log(`收到 ${side} ${type} ${amount} 在 ${price} ${reason}`);

      // 执行交易操作
      let flag = false;
      if (type === 'OPEN') {
        // 市价开单
        // 开单 1.5s后
        const size = this.scale * amount;
        await this.createAddOrder(side, size, 0);
        flag = true;
      }
      if (type === 'ADD' || type === 'REDUCE') {
        // 加减仓 不操作  加减仓操作统统放在常规判断中使用现价单代替
        // 1.5s后改限价单.
        flag = true;
      }

      if (flag) {
        setTimeout(async () => {
          await this.go();
        }, 1.5 * 1000);
      }


      if (type === 'CLOSE') {
        // 平仓
        // 不做操作
        this.reduce_order_id_string = '';
        this.add_order_id_string = '';
        this.pos = null;
        await this.oneKeyClose('保险平仓');
        await this.clearOrders();
        if (0) {
          // 可以在这里判断 如果是止损的话  反向开仓吃一波
          const reverse_side = side === 'LONG' ? "SHORT" : "LONG";
          const reverse_price = side === 'LONG' ? price + 0.5 : price - 0.5; //让0.5的利润
          const reverse_size = 0.01;
          await this.createAddOrder(reverse_side, reverse_size, reverse_price);
          console.log(`反向开单 ${reverse_side} ${reverse_size} ${reverse_price} `);

        }

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
      const { side, size, avgPrice: price, reduceCount, addCount, reduce_conf, sub_price_avg, sub_price, entryPrice, add_conf } = this.pos;
      const add_sub = add_conf[0] === 0 ? 200 : add_conf[0];

      const add_size = add_conf[1];
      const add_price = side === 'LONG' ? entryPrice - add_sub : entryPrice + add_sub;
      return { side, size, price: Number(price).toFixed(2), zy: reduce_conf.at(reduceCount), reduceCount, addCount, entryPrice, sub_price_avg, sub_price, add_price, add_size };
    }
    return null;

  }

  async getLocalPosition() {
    // 获得本地交易所仓位
    try {
      const ret = await this.httpClient.get('/apiw/v2/futures/usdt/positions');
      const { data, code, message } = ret;
      if (code === 200 && message === 'success') {
        const ds = data.filter(e => e.size);
        if (ds.length) {
          const { open_time, size, contract: pair, entry_price, mark_price, pnl_pnl, pnl_fee, unrealised_pnl, mode } = ds.at(0); // LONG
          const t_s = formatTimestamp(open_time);
          const side = mode.toUpperCase().replace('DUAL_', '');
          const contract = pair.replace('/', '_');
          const will_fee = (mark_price * size / 100) * 0.00048;
          const yl = Number(pnl_pnl) + Number(unrealised_pnl) + (Number(pnl_fee)) - will_fee;
          const total_fee = Math.abs((Number(pnl_fee)) - will_fee);
          const fy = total_fee * 0.7;
          const total_win = yl + fy;
          const msg = `真实仓位: ${side} : ${t_s} ${size / 100} ${contract} @ ${entry_price} 当前价格: ${mark_price} \n预计盈利: ${yl.toFixed(2)} 期望盈利:${WANT_USDT} 共计盈利:${total_win.toFixed(2)}\n手续费: ${Number(pnl_fee).toFixed(2)} - ${will_fee.toFixed(2)} = ${total_fee.toFixed(2)} 返佣：${fy.toFixed(2)}`;
          console.log(msg);
          const pos =
          {
            side,
            size: Math.abs(size) / 100,
            price: Number(entry_price).toFixed(2),
            fee: Math.abs(pnl_fee)
          }
          this.local_pos_cache = pos;
          return pos;
        }
        else {
          this.local_pos_cache = null;
          return null;

        }
      }
    } catch (error) {
      logger.error(error.stack);
    }
  }

  async oneKeyClose(msg) {
    try {
      const closeData = {
        only_close_positions: false
      };
      const result = await this.httpClient.post('/apiw/v2/futures/usdt/positions/close_all', closeData);
      console.log(`${msg} 一键平仓`, result);
      this.send_to_phone('一键平仓');
    } catch (error) {
      logger.error(error.stack);
    }
  }

  async clearOrders() {

    try {
      const url = '/apiw/v2/futures/usdt/orders';
      const pd = {
        "contract": ""
      }
      const ret = await this.httpClient.delete(url, pd);
      console.log(`清空所有委托单`, ret.message);
      this.reduce_order_id_string = ''; // 限价止盈单id
      this.add_order_id_string = ''; // 限价加仓单id
      this.send_to_phone('取消所有委托');
    } catch (error) {
      logger.error(error.stack);
    }
  }

  getLimitPriceByPos(pos) {
    // 根据仓位和利润计算出应该设置的止盈价格

    let wantUsdt = this.wantUsdt;

    /*
    const remote_pos = this.getRemotePosition();
    if (remote_pos) {
      const { addCount, reduceCount } = remote_pos;
    }
    */


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
        console.log(`本地止盈 ${Math.abs(price_1 - Number(local_entry)).toFixed(2)}`, price_1.toFixed(2));
        const price_2 = side === 'LONG' ? Number(remote_pos.price) + remote_pos.zy : Number(remote_pos.price) - remote_pos.zy;
        console.log(`模拟止盈 ${remote_pos.zy} 点`, price_2);
        const min_price = price_1 > price_2 ? price_2 : price_1;
        const max_price = price_1 > price_2 ? price_1 : price_2;
        const price = side === 'LONG' ? min_price : max_price;//多仓取小的 空仓取大的容易实现
        const rl = 0.15;//让点
        const target_price = side === 'LONG' ? price - rl : price + rl;
        if (this.reduce_order_id_string === '') {
          // 没有的话 创建订单并更新
          return await this.createReduceOrder(side, size, target_price);
        }
        else {
          // 有的话 直接修改
          return await this.updateReduceOrder(side, size, target_price);
        }
      }
      else {
        // 服务端没有仓位的话 直接设置止盈  考虑设置止损
        const { side, size } = local_pos;
        const price = this.getLimitPriceByPos(local_pos);
        console.log('本地止盈', price);

        if (this.reduce_order_id_string === '') {
          // 没有的话 创建订单并更新
          return await this.createReduceOrder(side, size, price);
        }
        else {
          // 有的话 直接修改
          return await this.updateReduceOrder(side, size, price);
        }

      }
    }

  }

  async set_add(local_pos, remote_pos) {
    // 加仓补仓

    if (remote_pos) {
      // 服务端有仓位 且禁止标志没打开 
      // 补仓
      const { side, size: remote_size, entryPrice: old_price, add_conf, addCount } = remote_pos; //entryPrice使用模拟端补仓价 price 使用模拟端持仓价  使用补仓价更安全
      // 先得到追仓的订单  如果有订单 且方向不一致的话 先清除订单
      let order_side = '';
      if (this.limit_add_size < 0) {
        order_side = 'SHORT';
      }
      if (this.limit_add_size > 0) {
        order_side = 'LONG';
      }
      if (order_side === '' || order_side === side) {
        //正常
      }
      else {
        console.log('委托订单方向不对，清空');
        await this.clearOrders();
      }

      console.log(`模拟仓位: ${side} 补仓价:${Number(old_price).toFixed(2)} ${remote_size} ${add_conf} 补仓:${addCount}次`);
      const can_open_flag = side === 'LONG' ? this.indicators.can_open_long_flag : this.indicators.can_open_short_flag;
      if (local_pos === null) {
        // 本地无仓位 这里判断null 是为了区别于网络获取失败的时候结果的undefined
        if (this.indicators.no_flag === false && this.indicators.can_add_flag === true && can_open_flag === true) {
          // 符合追仓条件

          const size = remote_size * this.scale;
          const add_or_sub = side === 'LONG' ? -1.5 : 1.5;
          const price = Number(old_price) + add_or_sub; // 这里设置追仓价 为模拟端持仓价 上下5*0.36=1.8左右 数值越追加开仓机会越多 但是太小的话需要考虑滑点带来的伤害
          console.log(`追仓 ${side} ${size} ==> ${price}`);
          if (this.add_order_id_string === '') {
            await this.createAddOrder(side, size, price);
          }
          else {
            await this.updateLimitOrder(this.add_order_id_string, size, price);
          }

        }
        else {
          // 不符合追仓条件
          if (this.indicators.no_flag) {
            console.log('转变为禁止标志');
            if (this.add_order_id_string || this.reduce_order_id_string) {
              // 如果有委托 那么取消了
              await this.clearOrders();
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

        if (add_size > 0 && this.indicators.can_add_flag === true && local_size <= remote_size) { 
          //要对比仓位大小,不然会出现本地现价单成交了 但是模拟端没成交 就会不停的成交
          const size = add_size * this.scale;
          console.log(`第${addCount}次补仓 ${side} ${size} ==> ${price}`);
          if (this.add_order_id_string === '') {
            await this.createAddOrder(side, size, price);
          }
          else {
            await this.updateLimitOrder(this.add_order_id_string, size, price);
          }
        }
      }

    }
    else {
      //服务端仓位为空
      this.add_order_id_string = '';
      //await this.clearOrders(); //清除所有委托
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

        if (sub_price < 0) {
          // 持仓差价小于0 设置加仓
          console.log(`入场价差 ${sub_price.toFixed(2)} 考虑加仓`);
          await this.set_add(local_pos, remote_pos);
        }

        if (sub_price_avg > 0) {
          // 浮盈 设置减仓
          console.log(`持仓价差 ${sub_price_avg.toFixed(2)} 考虑减仓`);
          await this.set_reduce(local_pos, remote_pos);
        }
        oldLog('\n\n');
      }
      else {
        // 模拟无仓位 考虑减仓
        await this.set_reduce(local_pos, remote_pos);
      }

    } catch (error) {
      logger.error(error.stack);
    }
    finally {
      this.last_t = Date.now();
    }

  }

  async createReduceOrder(side, size, price) {
    // 创建限价单止盈订单
    try {
      await this.clearOrders();
      const url = '/apiw/v2/futures/usdt/orders';
      const dir = side === 'SHORT' ? 1 : -1;
      const pd = {
        "text": "web",
        "contract": this.contract,
        "reduce_only": true,
        "price": price.toFixed(2),
        "order_type": "limit",
        "tif": "gtc",
        "size": (dir * size * 100).toFixed(0) // 平空是整数平多是负数
      }
      const ret = await this.httpClient.post(url, pd);
      const msg = `创建止盈限价单 ${side} ${price.toFixed(2)} ${size} ${ret.message}`;
      console.log(msg);
      this.send_to_phone(msg);
      if (ret.message === 'success') {
        this.reduce_order_id_string = ret.data.id_string;
      }
      else {

      }
    } catch (error) {
      logger.error(error.stack);

    }

  }


  async createAddOrder(side, size, price) {
    // 这里要处理重复进场的问题
    try {
      if (this.add_order_id_string === '') {
        // 没有入场
        //await this.clearOrders();
        const url = '/apiw/v2/futures/usdt/orders';
        const dir = side === 'SHORT' ? -1 : 1;
        const pd = {
          "contract": this.contract,
          "price": price ? price.toFixed(2) : '0',
          "size": (dir * size * 100).toFixed(0),
          "reduce_only": false,
          "tif": "gtc",
          "text": "web"
        }
        const ret = await this.httpClient.post(url, pd);
        //const ret = { data: { id_string: "test" } };
        if (price) {
          this.add_order_id_string = ret.data.id_string;
          const msg = `补仓限价单@${price.toFixed(2)} ${side} ${size} ${ret.message}`
          console.log(msg);
          this.send_to_phone(msg);
        }
        else {
          const msg = `开入市价单 ${side} ${size} ${ret.message}`;
          console.log(msg);
          this.send_to_phone(msg);
        }

        return this.add_order_id_string;
      }
      else {
        // 已经有入场了 不需要了

      }

    } catch (error) {
      logger.error(error.stack);
    }

  }

  async updateLimitOrder(id_string, size, price) {
    try {
      // 多单无法改成空单 空单无法改成多单 但是同向可以改
      const cur_order = this.local_order_cache.filter(e => e.id_string === id_string).at(0);
      if (!cur_order) {
        const msg = `传入订单编号 ${id_string} 查找不到,请尽快处理`;
        console.log(msg);
        this.send_to_phone(msg);
        await this.clearOrders();
        return false;
      }

      const cur_order_price = Number(cur_order.price).toFixed(1);
      const order_type = cur_order.is_reduce_only ? '平仓' : '补仓';
      const m_s = `${order_type} 委托价格: ${cur_order_price} ==> ${price.toFixed(1)}`;
      if (price.toFixed(1) !== cur_order_price) {
        const url = `/apiw/v2/futures/usdt/orders/${id_string}`;
        const pd = { "contract": this.contract, "size": (size * 100).toFixed(0), "price": price.toFixed(1) }
        const ret = await this.httpClient.put(url, pd);
        const msg = `修改${m_s} ${ret.message}`;
        console.log(msg);
        this.send_to_phone(msg);
        return ret;
      }

    } catch (error) {
      logger.error(error.stack);
    }

  }

  async updateReduceOrder(side, size, price) {
    // 修改限价单止盈订单
    try {
      const dir = side === 'SHORT' ? 1 : -1; //止盈是反方向
      const ret = await this.updateLimitOrder(this.reduce_order_id_string, size * dir, price);
      if (ret) {
        const msg = `修改止盈限价单 ${this.reduce_order_id_string} ${side} ${price.toFixed(2)} ${size}`;
        console.log(msg);
        this.send_to_phone(msg);
      }
    } catch (error) {
      logger.error(error.stack);
    }
  }

  async updateAddOrder(side, size, price) {
    // 修改限价单止盈订单
    try {
      const dir = side === 'SHORT' ? -1 : 1; //加仓是正方向
      const ret = await updateLimitOrder(this.add_order_id_string, size * dir, price);
      if (ret) {
        const msg = `修改止盈限价单 ${this.reduce_order_id_string} ${side} ${price.toFixed(2)} ${size}`;
        console.log(msg);
        this.send_to_phone(msg);
      }
    } catch (error) {
      logger.error(error.stack);
    }
  }

  async update_id_string() {

    try {
      const url = '/apiw/v2/futures/usdt/orders?contract=&status=open';
      const ret = await this.httpClient.get(url);

      const { message } = ret;
      //console.log(message);

      if (message === 'success') {
        const { data: old_orders } = ret;
        const orders = old_orders === null ? [] : old_orders;
        this.local_order_cache = orders;
        if (orders.length > 2) {
          console.log(`当前订单数量为 ${orders.length} 清除冲突订单`);
          await this.clearOrders();
          return;
        }
        let limit_add_size = 0;
        orders.forEach(order => {
          const { id_string, is_reduce_only, size } = order;
          if (is_reduce_only) {
            // 止盈限价单
            this.reduce_order_id_string = id_string;
          }
          else {
            // 入场限价单
            this.add_order_id_string = id_string;
            limit_add_size = size;
          }

        });
        this.limit_add_size = limit_add_size;

        if (orders.length === 0) {
          this.add_order_id_string = '';
          this.reduce_order_id_string = '';
        }
        return true;

      }
      else {
        console.log(`获取所有委托订单 ${message}`);
      }
    } catch (error) {
      logger.error(error.stack);
    }
  }

  async updateAuth() {
    try {
      const t_sub = (Date.now() - this.last_t) / 1000;
      //console.log(`保护:${t_sub}`);
      if (t_sub < 30) {
        // 30s 更新一次配置文件
        return null
      }
      //console.log('正常更新配置文件');
      const { api: conf, trading } = readJsonFromFileSync('./dist/runtime.json');
      if (conf) {
        const { baseURL, headers } = conf;
        this.scale = trading.amount;
        this.httpClient.updateConfig(baseURL, headers);
      }
    } catch (error) {
      logger.error(error.stack);
    } finally {
      const t_sub = (Date.now() - this.last_t) / 1000;
      //console.log(`进入逻辑:${t_sub}`);
      if (t_sub < 5) {
        // 5s 执行一次自动巡检
        return null
      }
      //console.log('正常更新委托');
      await this.update_id_string();
      if (t_sub > 5) { //this.local_pos_cache === null &&
        //模拟服务端仓位不为空 试着同步仓位
        await this.go();
      }
      this.last_t = Date.now();
    }
  }

}


if (require.main === module) {
  global.socket = new SocketClient();
}
module.exports = SocketClient;

