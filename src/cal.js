const fs = require('fs');
const HttpClient = require('./modules/httpClient');
const { saveJsonToFileSync } = require('./modules/json');
const TIME_ZONE = 8;
const REVERSE_RATE = 0.7064828899273086;

const httpClient = new HttpClient();
const { api: conf } = readJsonFromFileSync('./config/runtime.json');
if (conf) {
  const { baseURL, headers } = conf;
  httpClient.updateConfig(baseURL, headers);
  console.log(`更新配置成功`);
  //console.log(headers.cookie);
}


function readJsonFromFileSync(filePath, defaultValue = {}) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    logger.error(`读取失败: ${err.message}, 返回默认值`);
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

function n(a, dit = 2) {
  try {
    return Number(a).toFixed(dit);
  } catch (error) {
    return 0;
  }
}

async function cal_fee(start_time, end_time) {
  const url = `https://www.gate.com/apiw/v2/futures/usdt/my_trades?contract=&limit=1000&offset=0&start_time=${start_time}&end_time=${end_time}&role=&position_side=`;
  if (1) {
    const ret = await httpClient.get(url);
    const { data, message } = ret;
    saveJsonToFileSync(`./logs/trade_${start_time}_${end_time}.json`, ret);
    if (message === 'success') {
      //console.log(ret);
      const limit_fee = data.filter(e => e.role === 'Maker').map(e => Number(e.fee));
      const market_fee = data.filter(e => e.role === 'Taker').map(e => Number(e.fee));
      const total_limit_fee = Math.abs(limit_fee.reduce((acc, curr) => acc + curr, 0));
      const total_market_fee = Math.abs(market_fee.reduce((acc, curr) => acc + curr, 0));

      return {
        total_limit_fee,
        total_market_fee
      }
    }

  }
  else {
    console.log(ret);
  }
}



async function cal(start_ds, end_ds) {
  const types = ['', 'pnl', 'fee'];
  const start_date = new Date(start_ds + `T00:00:00+0${TIME_ZONE}:00`);
  //const hour = end_ds === '2025-09-29' ? `07` : `23`; // 调试用
  const hour = `23`;
  const end_date = new Date(end_ds + `T${hour}:59:59+0${TIME_ZONE}:00`);
  const start_time = Math.floor(start_date.getTime() / 1000);
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const weekday = weekdays[start_date.getDay()];
  const end_time = Math.floor(end_date.getTime() / 1000);
  const type = types.at(0);
  const url = `https://www.gate.com/apiw/v2/futures/usdt/account_book?type=${type}&start_time=${start_time}&end_time=${end_time}&contract=&offset=0&limit=1000`;
  
  if (1) {
    const ret = await httpClient.get(url);
    const { data, message } = ret;
    saveJsonToFileSync(`./logs/account_book_${start_ds}_${end_ds}.json`, ret);
    //console.log('获取手续费', message);
    if (message === 'success') {
      //console.log(ret);
      const {total_limit_fee,total_market_fee} = await cal_fee(start_time,end_time);
      const fees = data.filter(e => e.type === 'fee').map(e => Number(e.change.split(' ')[0]));
      const pnls = data.filter(e => e.type === 'pnl').map(e => Number(e.change.split(' ')[0]));
      const total_fee = Math.abs(fees.reduce((acc, curr) => acc + curr, 0));
      const fee_sub = total_fee - total_limit_fee - total_market_fee;
      const total_pnl = pnls.reduce((acc, curr) => acc + curr, 0);
      const net_pnl = total_pnl - total_fee;
      const fy = total_limit_fee * 0.8 + total_market_fee * 0.715;
      const last_pnl = net_pnl + fy;
      if (total_fee || total_pnl) {
        const ds = start_ds === end_ds ? start_ds : `${formatTimestamp(start_time)} - ${formatTimestamp(end_time)}`;
        console.log(`${ds}  ${weekday}  账面盈 ${s(n(total_pnl, 2), 10)} 减手续  ${s(n(total_fee,6), 10)} (${total_limit_fee.toFixed(6)} + ${total_market_fee.toFixed(6)}) 净盈利 ${s(n(net_pnl, 2), 10)} + 应返佣 ${s(n(fy,6), 10)} 终盈利 ${s(n(last_pnl), 6)}`);
        return {
          start_ds,
          end_ds,
          total_pnl,
          total_fee,
          net_pnl,
          fy,
          last_pnl
        }
      }

    }
    else {
      console.log(ret);
    }
  }

}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function s(n, w = 3, f = ' ') {
  return String(n).padStart(w, f);
}

function sumArray(arr) {
  return arr.reduce((acc, obj) => {
    for (const key in obj) {
      if (key !== "start_ds" && key !== "end_ds") {
        acc[key] = (acc[key] || 0) + (obj[key] || 0);
      }
    }
    return acc;
  }, {});
}

function getDateRange(startDateStr, endDateStr) {
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);

  const dates = [];
  let current = new Date(startDate);

  while (current <= endDate) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");
    const day = String(current.getDate()).padStart(2, "0");
    dates.push(`${year}-${month}-${day}`);

    current.setDate(current.getDate() + 1);
  }

  return dates;
}

async function main(sd = "2025-09-01", ed = "2025-09-30") {
  console.log(`使用时区 UTC+${TIME_ZONE} 统计 ${sd} - ${ed} 交易情况`);
  const rets = [];
  const dates = getDateRange(sd, ed);

  for (const d of dates) {
    //console.log(d);
    const ret = await cal(d, d);
    if (ret) rets.push(ret);
    await sleep(2000); // 休眠 1 秒
  }

  const sum_obj = sumArray(rets);
  //console.log(sum_obj);
  const { total_pnl,
    total_fee,
    net_pnl,
    fy,
    last_pnl } = sum_obj;
  console.log(`\n${dates.at(0)} - ${dates.at(-1)}  合计:  \n\t账面盈${s(n(total_pnl, 2), 10)} 减手续${s(n(total_fee), 6)} 净盈利${s(n(net_pnl, 2), 10)} + 应返佣${s(n(fy), 6)} \n\t终盈利${s(n(last_pnl), 6)} 日均盈${s(n(last_pnl / rets.length), 6)}\n`);
}


setTimeout(async () => {
  let args = process.argv.slice(2);

  let start, end;
  if (args.length >= 2) {
    // 命令行指定了日期
    [start, end] = args;
  } else {
    // 默认：当月第一天到今天
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    start = `${year}-${month}-01`;
    end = `${year}-${month}-${day}`;
  }

  await main(start, end);
}, 0);