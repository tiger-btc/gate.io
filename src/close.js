const HttpClient = require('./modules/httpClient');
const { readJsonFromFileSync } = require('./modules/json');
const { api: conf } = readJsonFromFileSync('./config/runtime.json');
const httpClient = new HttpClient();
if (conf) {
    const { baseURL, headers } = conf;
    httpClient.updateConfig(baseURL, headers);
}
async function oneKeyClose(msg) {
    try {
        const closeData = {
            only_close_positions: false
        };
        const result = await httpClient.post('/apiw/v2/futures/usdt/positions/close_all', closeData);
        console.log(`${msg} 一键平仓`, result.message);
    } catch (error) {
        logger.error(error.stack);
    }
}


async function main() {
    await oneKeyClose('手动');
}

setTimeout(main, 0);