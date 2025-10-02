const fs = require('fs');
const LR_WIDTH = 5.2;
function readJsonFromFileSync(filePath, defaultValue = {}) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`读取失败: ${err.message}, 返回默认值`);
    return defaultValue;
  }
}

function formatTimestamp(timestamp) {
  // 如果传入的是秒级时间戳，需要乘以 1000
  const date = new Date(
    String(timestamp).length === 10 ? timestamp * 1000 : timestamp
  );

  const pad = (n) => (n < 10 ? '0' + n : n);

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1); // 月份从 0 开始
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}




setInterval(async () => {
  const HttpClient = require('./src/modules/httpClient');
  const httpClient = new HttpClient();
  const { api: conf } = readJsonFromFileSync('./dist/runtime.json');
  const { baseURL, headers } = conf;
  httpClient.updateConfig(baseURL, headers);
  const ret = await httpClient.get('/apiw/v2/futures/usdt/positions');
  const { data, code, message } = ret;
  if (code === 200 && message === 'success') {
    data.forEach(async e => {
      const { open_time, size, contract, entry_price, mark_price, pnl_pnl, pnl_fee, unrealised_pnl, mode, future_auto_order } = e;
      if (size) {
        const t_s = formatTimestamp(open_time);
        const yl = Number(pnl_pnl) + Number(unrealised_pnl) + (Number(pnl_fee) * 2);
        const side = mode.toUpperCase().replace('DUAL_', '');
        const msg = `${side} : ${t_s} ${size / 100} ${contract} @ ${entry_price} ==> ${mark_price} 预计盈利: ${yl.toFixed(2)} 手续费: ${Number(pnl_fee).toFixed(2)}`;
        console.log(msg);
        const zy = side === 'LONG' ? Number(entry_price) + LR_WIDTH : Number(entry_price) - LR_WIDTH;
        // 如果价格已经超过设置的价格 需要直接平仓
        let is_close = false;
        if (side === 'LONG' && mark_price > zy) {
          is_close = true;
        }
        if (side === 'SHORT' && mark_price < zy) {
          is_close = true;
        }

        if (is_close) {
          //直接平仓
          const closeData = {
            only_close_positions: false
          };
          const close_ret = await httpClient.post('/apiw/v2/futures/usdt/positions/close_all', closeData);
          console.log(close_ret);
          console.log('平仓');
        }
        else {
          let pd = {};
          let old_trigger_price = 0;
          if (future_auto_order.length === 0) {
            //没有止盈订单的时候
            pd = {
              "stop_orders": [
                {
                  "operation_type": 0,
                  "add_data": {
                    "contract": contract.replace('/', '_'),
                    "price_type": 0,
                    "rule": side === 'LONG' ? 1 : 2,
                    "trigger_price": `${zy.toFixed(1)}`,
                    "order_price": "0",
                    "order_size": 0,
                    "text": "web",
                    "close": false,
                    "order_type": `close-${side.toLowerCase()}-position`,
                    "auto_size": `close_${side.toLowerCase()}`
                  }
                }
              ]
            };

          }
          else {
            //有止盈订单的时候修改
            //console.log(zy)
            pd = {
              "stop_orders": [
                {
                  "operation_type": 1,
                  "update_data": {
                    "contract": "contract.replace('/', '_')",
                    "price_type": 0,
                    "rule": side === 'LONG' ? 1 : 2,
                    "trigger_price": `${zy.toFixed(1)}`,
                    "order_price": "0",
                    "order_size": 0,
                    "text": "web",
                    "close": false,
                    "id": future_auto_order[0]["id"],
                    "id_string": future_auto_order[0]["id_string"],
                    "order_type": `close-${side.toLowerCase()}-position`,
                    "auto_size": `close_${side.toLowerCase()}`
                  }
                }
              ]
            };
            //console.log(future_auto_order.length);
            old_trigger_price = future_auto_order[0]["trigger"]["price"];
          }
          if (Number(old_trigger_price).toFixed(1) !== zy.toFixed(1)) {
            const ret_zy = await httpClient.post('/apiw/v2/futures/usdt/price_orders/adjust', pd);
            //console.log(pd.stop_orders[0]);
            console.log(ret_zy);
            console.log(`更新止盈价格 ${zy.toFixed(1)} ==> ${Number(old_trigger_price === 0 ? zy : old_trigger_price).toFixed(1)} `);

          }
          else {
            console.log(`当前止盈价格 ${zy.toFixed(1)} 不需要修改`)
          }


        }
      }

    });
  }
}, 5000);

/*
Request URL
https://www.gate.com/apiw/v2/futures/usdt/price_orders/adjust
Request Method
POST
{
  "stop_orders": [
    {
      "operation_type": 0,
      "add_data": {
        "contract": "ETH_USDT",
        "price_type": 0,
        "rule": 1,
        "trigger_price": "4016",
        "order_price": "0",
        "order_size": 0,
        "text": "web",
        "close": false,
        "order_type": "close-long-position",
        "auto_size": "close_long"
      }
    }
  ]
}

{
  "stop_orders": [
    {
      "operation_type": 1,
      "update_data": {
        "contract": "ETH_USDT",
        "price_type": 0,
        "rule": 1,
        "trigger_price": "4010.1",
        "order_price": "0",
        "order_size": 0,
        "text": "web",
        "close": false,
        "id": 1971229868217602000,
        "id_string": "1971229868217602048",
        "order_type": "close-long-position",
        "auto_size": "close_long"
      }
    }
  ]
}

[
  {
    "user": 29022261,
    "trigger": {
      "strategy_type": 0,
      "price_type": 0,
      "price": "4001.00",
      "rule": 2,
      "expiration": 0,
      "expiration_day": 0
    },
    "initial": {
      "contract": "ETH_USDT",
      "size": 0,
      "price": "0",
      "tif": "ioc",
      "text": "web",
      "iceberg": 0,
      "is_close": false,
      "is_reduce_only": true,
      "auto_size": "close_short"
    },
    "id": 1971227280298479600,
    "id_string": "1971227280298479616",
    "trade_id": 0,
    "trade_id_string": "0",
    "status": "open",
    "finish_as": "",
    "finish_as_text": "",
    "reason": "",
    "create_time": 1758812181,
    "finish_time": 1758812181,
    "text_output": "",
    "name": "",
    "is_stop_order": false,
    "stop_trigger": {
      "rule": 0,
      "trigger_price": "",
      "order_price": ""
    },
    "mmr_trigger": {
      "rate": "",
      "mmr": "",
      "trigger_mark_price": ""
    },
    "me_order_id": 0,
    "me_order_id_string": "0",
    "parent_id_string": "0",
    "order_type": "close-short-position",
    "in_dual_mode": true,
    "stop_profit_price": "",
    "stop_loss_price": "",
    "batch_id": "29022261_ETH_USDT_2",
    "direction": "long",
    "size": 0,
    "left": 0,
    "fill_price": "",
    "is_voucher": false,
    "is_splitting": false
  }
]
*/


