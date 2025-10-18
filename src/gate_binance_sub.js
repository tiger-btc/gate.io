// reader.js
const { SharedJsonStore } = require('./modules/sharedJsonStore');
const _ = require('lodash');

function formatTimestamp(ts) {
    const d = new Date(ts);
    const yyyy = d.getFullYear();
    const MM = _.padStart(d.getMonth() + 1, 2, '0');
    const dd = _.padStart(d.getDate(), 2, '0');
    const hh = _.padStart(d.getHours(), 2, '0');
    const mm = _.padStart(d.getMinutes(), 2, '0');
    const ss = _.padStart(d.getSeconds(), 2, '0');
    return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}`;
}

let pos = {
    side: null,//方向
    in: 0, // 入场价格
    in_t: '', // 入场时间
    out: 0, //出场价
    out_t: '', // 出场时间
    win: 0, //盈利
    max_win: 0, // 最大浮盈
    max_lost: 0, //最大浮亏
    reason: ''
};

function open(side, price) {
    pos.side = side;
    pos.in = price;
    pos.in_t = formatTimestamp(Date.now());
}

function pnl(price) {
    if (pos.in) {
        const { side, in: in_price } = pos;
        const win = side === 'LONG' ? price - in_price : in_price - price;
        pos.win = win;
        if (pos.max_win < win || pos.max_win === 0) {
            pos.max_win = win;
        }

        if (pos.max_lost > win || pos.max_win === 0) {
            pos.max_lost = win;
        }
    }
}

function close(price, reason) {
    if (pos.in) {
        pnl(price);
        pos.reason = reason;
        pos.out = price;
        pos.out_t = formatTimestamp(Date.now());
    }
    const ret = { ...pos }
    pos = {
        side: null,//方向
        in: 0, // 入场价格
        in_t: '', // 入场时间
        out: 0, //出场价
        out_t: '', // 出场时间
        win: 0, //盈利
        max_win: 0, // 最大浮盈
        max_lost: 0, //最大浮亏
        reason: ''
    };
    return ret;

}



(async () => {
    const gate = new SharedJsonStore({
        url: 'redis://127.0.0.1:6379',
        key: 'gate_price',
    });
    const binance = new SharedJsonStore({
        url: 'redis://127.0.0.1:6379',
        key: 'binance_price',
    });
    const gate_pos = new SharedJsonStore({
        url: 'redis://127.0.0.1:6379',
        key: 'gate_pos',
    });
    await gate.connect();
    await binance.connect();
    await gate_pos.connect();
    await gate_pos.publish('start', { msg: '开始测试' });
    const price = { gate: 0, binance: 0 };
    let prices = [];
    let start_t = Date.now();



    async function callback() {
        price['sub'] = price['gate'] - price['binance'];
        price['sub_t'] = price['gate_t'] - price['binance_t'];
        //prices.push(price);
        const now_t = Date.now();
        if (price.gate && price.binance) {
            prices.push({ ...price, ts: now_t });
        }
        else {
            return;
        }

        prices = prices.slice(-1000);
        //console.log(price);
        const seconds = 90;
        const part_prices = prices.filter(e => (now_t - e.ts) < (seconds * 1000)); //取60s以内的数据
        const n = 0.5;
        const avg_sub = _.meanBy(part_prices, item => item.sub);
        const max_sub = _.maxBy(part_prices, 'sub').sub;
        const min_sub = _.minBy(part_prices, 'sub').sub;
        const hot = (price['sub'] - min_sub) * 100 / (max_sub - min_sub);
        const part_cond_long = part_prices.every(e => e.sub < -n / 2) && avg_sub < -n;
        const part_cond_short = part_prices.every(e => e.sub > n / 2) && avg_sub > n;
        const want = 6;
        const zs = -1;
        if (pos.in) {
            pnl(price.gate);
            let reason = '';
            if (pos.max_win > want && pos.win < pos.max_win) {
                // 到达止盈线以后回调立刻出
                reason = '止盈';
            }
            if (pos.win < zs) {
                reason = '止损';
            }
            if (part_cond_long && pos.side === 'SHORT') {
                reason = '空转多';
            }
            if (part_cond_long && pos.side === 'SHORT') {
                reason = '多转空';
            }
            if (reason) {
                const t_pos = close(price.gate, reason);
                await gate_pos.publish('close', t_pos);
                start_t = now_t + 300 * 1000; //休息5分钟
            }
            console.log(pos);
        }
        let time_window = (now_t - start_t) / 1000;
        console.log(`\n${time_window.toFixed(1)}s ${price.gate} L:${part_cond_long ? 'Y' : 'N'} S:${part_cond_short ? 'Y' : 'N'} l:${part_prices.length}/${prices.length} cur:${price['sub'].toFixed(2)} \nmin:${min_sub.toFixed(2)} avg:${avg_sub.toFixed(2)} max:${max_sub.toFixed(2)} hot:${hot.toFixed(1)}%`);
        const per = 10;
        if (pos.in === 0 && time_window > seconds) {
            if (part_cond_long && hot < per) {
                console.log(`开多 ${price.gate}`);
                open('LONG', price.gate);
                pos.ex = {
                    cur: price['sub'],
                    min: min_sub,
                    max: max_sub,
                    avg: avg_sub,
                    hot
                }
                await gate_pos.publish('open', pos);
            }
            if (part_cond_short && hot > (100 - per)) {
                console.log(`开空 ${price.gate}`);
                open('SHORT', price.gate);
                pos.ex = {
                    cur: price['sub'],
                    min: min_sub,
                    max: max_sub,
                    avg: avg_sub,
                    hot
                }
                await gate_pos.publish('open', pos);
            }

        }

    }

    // 订阅事件
    await gate.subscribe((msg) => {
        const { data: { price: gate_price, updatedAt: t } } = msg;
        price['gate'] = gate_price;
        price['gate_t'] = t;
        callback();
    });

    await binance.subscribe((msg) => {
        const { data: { price: binance_price, updatedAt: t } } = msg;
        price['binance'] = binance_price;
        price['binance_t'] = t;
    });


})();
