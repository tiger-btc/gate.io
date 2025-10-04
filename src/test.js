const account = require('./account');
globalThis.account = account;
const { get, setCallBack } = account;
const { formatTimestamp } = require('./modules/util');
function dis_pos(pos) {
    let msg = pos;
    if (pos) {
        const { open_time, size: raw_size, entry_price, pnl_pnl, pnl_fee } = pos;
        const t_s = formatTimestamp(open_time);
        const side = raw_size > 0 ? 'LONG' : 'SHORT';
        const size = Math.abs(raw_size / 100);
        msg = `${t_s} 仓位: ${side}: ${size}@${entry_price} 已实现盈亏: ${Number(pnl_pnl).toFixed(2)} 手续费: ${Number(pnl_fee).toFixed(2)} `;
        console.log(msg);
    }

}

function dis_order(order) {
    let msg = order;
    if (msg) {
        const { id_string, price, status, left: raw_left, is_reduce_only, size: raw_size, create_time } = order;
        const t_s = formatTimestamp(create_time);
        const side = raw_size > 0 ? 'LONG' : 'SHORT';
        const size = Math.abs(raw_size / 100);
        const left = Math.abs(raw_left / 100);
        msg = `${t_s} ${is_reduce_only ? '减仓' : '补仓'}委托 ${id_string} ${status}: ${side} ${left}/${size} at ${price}`;
        console.log(msg);
    }

}

function show() {
    const pos = get('pos');
    const add_order = get('add');
    const reduce_order = get('reduce');
    console.log('-'.repeat(50), '\n');
    dis_pos(pos);
    dis_order(add_order);
    dis_order(reduce_order);
}

setTimeout(show,1000);

setCallBack(show)