#!/usr/bin/env node
/**
 * Gate.io USDT 本位合约 WebSocket 订阅&持久化日志
 * - 连接：wss://fx-webws.gateio.live/v4/ws/usdt?device_type=0
 * - 接收的size 统统为正数
 */

const WebSocket = require('ws');
const { readJsonFromFileSync } = require('./modules/json');
const { extractCookieValue } = require('./modules/bear');
const { formatTimestamp } = require('./modules/util');
const HttpClient = require('./modules/httpClient');
let add_order = null;
let reduce_order = null;
let pos = null;
const WS_URL = 'wss://fx-webws.gateio.live/v4/ws/usdt?device_type=0';
// 需要订阅的频道（按你给的顺序）
const CHANNELS = [
    //'futures.position_closes', // 仓位关闭
    //'futures.usertrades', // 用户交易成交
    'futures.positions', // 仓位变化
    'futures.orders', // 订单变化
];

let ws = null;
let pingTimer = null;
let watchdogTimer = null;
let reconnectAttempts = 0;
let closedByUser = false;
let callback = null;


const httpClient = new HttpClient();

if (require.main === module) {
    const oldLog = console.log;
    console.log = (...args) => {
        const ts = formatTimestamp(Date.now());
        oldLog(`[${ts}]`, ...args);
    };
}

async function httpGetOrders() {
    // http方式获得订单列表，刚进入程序的时候使用一次即可 后续使用ws更新
    try {
        const url = '/apiw/v2/futures/usdt/orders?contract=&status=open';
        const ret = await httpClient.get(url);

        const { message } = ret;
        //console.log(message);

        if (message === 'success') {
            const { data: old_orders } = ret;
            const orders = old_orders === null ? [] : old_orders;

            orders.forEach(order => {
                const { is_reduce_only } = order;
                if (is_reduce_only) {
                    // 止盈限价单
                    reduce_order = { ...order };
                }
                else {
                    // 入场限价单
                    add_order = { ...order };
                }

            });
            return true;

        }
        else {
            console.log(`获取所有委托订单 ${message}`);
        }
    } catch (error) {
        console.log(error.stack);
    }
}

async function httpGetPosition() {
    // http方式获得持仓信息，刚进入程序的时候使用一次即可 后续使用ws更新
    try {
        const ret = await httpClient.get('/apiw/v2/futures/usdt/positions');
        const { data, code, message } = ret;
        if (code === 200 && message === 'success') {
            const ds = data.filter(e => e.size);
            if (ds.length) {
                pos = ds.at(0);
            }
            else {
                pos = null;
            }
            return true;
        }
        else {
            console.log(`获取持仓信息 ${message}`);
        }
    } catch (error) {
        console.log(error.stack);
    }
}

async function delOrder(id_string) {
    //删除订单
    try {
        const url = `/apiw/v2/futures/usdt/orders/${id_string}`;
        const pd = null
        const ret = await httpClient.delete(url, pd);
        if (ret.message === 'success') {
            console.log(`删除订单 ${id_string} ${ret.message}`);
            return true;
        } else {
            console.log(`删除订单 ${id_string} ${ret.message}`);
        }
    } catch (error) {
        console.log(error.stack);
    }
}

async function createOrder(side, size, price, is_reduce_only) {
    // 创建订单
    try {
        const url = '/apiw/v2/futures/usdt/orders';
        const dir = side === 'SHORT' ? -1 : 1;
        const dir_2 = is_reduce_only ? -1 : 1; //减仓的话要反转
        const pd = {
            "contract": "ETH_USDT",
            "price": price ? price.toFixed(2) : '0',
            "size": (dir * dir_2 * Math.abs(size) * 100).toFixed(0),
            "reduce_only": is_reduce_only,
            "tif": "gtc",
            "text": "web"
        }
        const ret = await httpClient.post(url, pd);
        if (ret.message === 'success') {
            console.log(`创建${is_reduce_only ? '减仓' : '补仓'}订单 ${side} ${size}@${price} ${ret.message}`);
            return true;
        } else {
            console.log(ret);
        }
    } catch (error) {
        console.log(error.stack);
    }

}

async function equalOrder(type, side, size, price) {
    // 对比当前指定类型的仓位是否跟传入的参数一致
    const order = type === 'add' ? add_order : reduce_order;
    if (order === null) {
        return false;
    }
    const dir = order.is_reduce_only ? -1 : 1;
    const order_side = (dir * order.size) > 0 ? 'LONG' : 'SHORT';
    if (Math.abs(order.size / 100) === size && Number(price).toFixed(1) === Number(order.price).toFixed(1) && side === order_side) {
        return true
    }

    if (side !== order_side) {
        // 方向不一致 删除
        await delOrder(order.id_string);
    }
    return false;
}

async function updateOrder(type, side, size, price) {
    // type = add / reduce
    // 设置订单 判断跟当前的是否一致 一致的话不操作 不一致的话修改或者新建
    const ret = await equalOrder(type, side, size, price);
    const order = type === 'add' ? add_order : reduce_order;
    if (ret === false) {
        if (order === null) {
            //新建
            await createOrder(side, size, price, type === 'reduce');
        }
        else {
            //更新
            try {
                const dir = side === 'SHORT' ? -1 : 1;
                const dir_2 = type === 'reduce' ? -1 : 1; //减仓的话要反转
                const url = `/apiw/v2/futures/usdt/orders/${order.id_string}`;
                const pd = { "contract": "ETH_USDT", "size": (dir * dir_2 * Math.abs(size) * 100).toFixed(0), "price": price.toFixed(2) }
                const ret = await httpClient.put(url, pd);
                if (ret.message === 'success') {
                    return true;
                } else {
                    console.log(`更新${type === 'reduce' ? '减仓' : '补仓'}订单 ${side} ${size}@${price} ${ret.message}`);
                }

            } catch (error) {
                console.log(error.stack);
            }
        }
    }

}

async function oneKeyClose(msg) {
    try {
        const closeData = {
            only_close_positions: false
        };
        const result = await httpClient.post('/apiw/v2/futures/usdt/positions/close_all', closeData);
        console.log(`${msg} 一键平仓`, result.message);
    } catch (error) {
        console.log(error.stack);
    }
}

async function clearAllOrders() {

    try {
        const url = '/apiw/v2/futures/usdt/orders';
        const pd = {
            "contract": ""
        }
        const ret = await httpClient.delete(url, pd);
        console.log(`清空所有委托单`, ret.message);
    } catch (error) {
        console.log(error.stack);
    }
}

function getAuth() {
    try {
        const { api: conf } = readJsonFromFileSync('./config/runtime.json');
        const { baseURL, headers } = conf;
        httpClient.updateConfig(baseURL, headers);
        const cookieStr = headers.cookie;
        const token = extractCookieValue(cookieStr, 'token');
        const uid = extractCookieValue(cookieStr, 'uid');
        const jwt = `Bearer ${token}`; // 形如：Bearer eyJhbGciOiJI...

        if (!jwt.startsWith('Bearer ')) {
            console.error('[FATAL] 请通过环境变量 GATE_JWT 传入以 "Bearer " 开头的 JWT。');
        }

        // futures_voucher_mode 固定 0、device_type 固定 0（与 URL 一致）
        const base_auth = {
            method: 'uc',
            ck: { jwt, device_type: 0 },
            futures_voucher_mode: 0,
        };
        return { base_auth, uid }

    } catch (error) {
        console.log(error.stack);
    }

}

// ====== 发送：订阅 & 心跳 ======
function subscribeAll() {
    const info = getAuth();
    if (info) {
        httpGetOrders();
        httpGetPosition();
        const { uid, base_auth } = info;
        let id = 4; // 你的示例从 4 开始，这里也从 4 开始（仅为可读，ID 不必须连续）
        CHANNELS.forEach((channel) => {
            const msg = {
                auth: base_auth,
                channel,
                event: 'subscribe',
                payload: [String(uid), '!all'],
                id,
                time: Math.floor(Date.now() / 1000),
            };
            id++;
            safeSend(msg);
        });
    }

}

function startPing() {
    stopPing();
    pingTimer = setInterval(() => {
        const msg = { channel: 'futures.ping', id: 21, time: Math.floor(Date.now()) };
        safeSend(msg);
    }, 12_000); // 12s/ping
}

function stopPing() {
    if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
    }
}

function resetWatchdog() {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    // 如果 60 秒没有收到任何数据，就触发重连
    watchdogTimer = setTimeout(() => {
        console.warn('[WATCHDOG] 60s 未收到消息，准备重连...');
        forceReconnect();
    }, 60_000);
}

// ====== WebSocket 连接 & 重连 ======
function connect() {
    console.log(`[CONNECT] 正在连接：${WS_URL}`);
    ws = new WebSocket(WS_URL, {
        perMessageDeflate: true,
        handshakeTimeout: 15000,
    });

    ws.on('open', () => {
        console.log('[OPEN] WS 连接已建立');
        reconnectAttempts = 0;
        subscribeAll();

        startPing();
        resetWatchdog();
    });

    ws.on('message', (data) => {
        resetWatchdog();

        // 服务器消息可能是 Buffer/String
        let text = data.toString();
        // 日志中保留原始字符串 & 尝试解析 JSON
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) { }

        // 控制台简要输出（避免刷屏）
        let flag = false;
        if (parsed && parsed.event === 'update') {
            console.log(`[SUBSCRIBED] ${parsed.channel}`);
            if (parsed.channel === 'futures.positions') {
                flag = true;
                parsed.result.map(e => {
                    const { size, entry_price, time } = e;
                    if (size === 0 && entry_price === 0) {
                        console.log(`仓位消失`);
                        pos = null;
                    }
                    else {
                        const side = size > 0 ? 'LONG' : 'SHORT';
                        console.log(`${formatTimestamp(time)} 仓位:  ${side} ${Math.abs(size / 100)}@${Number(entry_price).toFixed(2)}`);
                        pos = { ...e };
                    }
                });
            }
            if (parsed.channel === 'futures.orders') {
                flag = true;
                parsed.result.map(e => {
                    const { id_string, price, status, left, is_reduce_only, size, create_time } = e;
                    const side = size > 0 ? 'LONG' : 'SHORT';
                    if (status === 'open') {
                        if (is_reduce_only) {
                            reduce_order = { ...e };
                            console.log(`发现减仓单`);
                        }
                        else {
                            add_order = { ...e };
                            console.log(`发现补仓单`);
                        }

                    }
                    if (status === 'finished') {
                        if (is_reduce_only) {
                            reduce_order = null;
                            console.log(`减仓单消失`);
                        }
                        else {
                            add_order = null;
                            console.log(`补仓单消失`);
                        }

                    }

                    console.log(`${formatTimestamp(create_time)} 委托${id_string} ${side} ${is_reduce_only ? '减仓' : '补仓'} ${Math.abs(left / 100)}/${Math.abs(size / 100)}@${price}  ${status}`);

                });
            }
        }
        if (flag && callback) {
            callback();
        }
    });

    ws.on('error', (err) => {
        console.error('[ERROR]', err.message);
    });

    ws.on('close', (code, reason) => {
        stopPing();
        if (watchdogTimer) clearTimeout(watchdogTimer);
        if (closedByUser) {
            console.log('[CLOSE] 用户主动关闭。', code, reason?.toString());
            return;
        }
        console.warn('[CLOSE] 连接关闭，准备重连。', code, reason?.toString());
        scheduleReconnect();
    });
}

function scheduleReconnect() {
    reconnectAttempts += 1;
    const delay = Math.min(60_000, 1000 * Math.pow(2, reconnectAttempts)); // 指数退避，最大 60s
    console.log(`[RECONNECT] ${reconnectAttempts} 次重连，${Math.round(delay / 1000)}s 后尝试...`);
    setTimeout(() => connect(), delay);
}

function forceReconnect() {
    try { ws?.terminate(); } catch (_) { }
    scheduleReconnect();
}

function safeSend(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(obj));
        } catch (e) {
            console.error('[SEND][ERR]', e.message);
        }
    }
}

// ====== 优雅退出 ======
function shutdown() {
    if (closedByUser) return;
    closedByUser = true;
    console.log('[SHUTDOWN] 正在退出...');
    stopPing();
    if (watchdogTimer) clearTimeout(watchdogTimer);
    try { ws?.close(1000, 'client shutdown'); } catch (_) { }
    setTimeout(() => process.exit(0), 300);
}

function setCallBack(fun) {
    callback = fun;
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

connect();

function get(type) {
    if (type === 'add') {
        return add_order;
    }
    if (type === 'reduce') {
        return reduce_order;
    }
    if (type === 'pos') {
        return pos;
    }
}

module.exports = {
    get, updateOrder, setCallBack, oneKeyClose, clearAllOrders
}