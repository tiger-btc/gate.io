const fs = require('fs');
const { promises: fsp } = fs;

/**
 * 保存 JSON 数据到文件（同步，忽略报错）
 */
function saveJsonToFileSync(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error(`保存失败: ${err.message}`);
    }
}

/**
 * 从文件读取 JSON 数据（同步，失败时返回默认值）
 */
function readJsonFromFileSync(filePath, defaultValue = {}) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (err) {
        console.error(`读取失败: ${err.message}, 返回默认值`);
        return defaultValue;
    }
}

/**
 * 保存 JSON 数据到文件（异步，忽略报错）
 */
async function saveJsonToFile(filePath, data) {
    try {
        await fsp.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error(`保存失败: ${err.message}`);
    }
}

/**
 * 从文件读取 JSON 数据（异步，失败时返回默认值）
 */
async function readJsonFromFile(filePath, defaultValue = {}) {
    try {
        const content = await fsp.readFile(filePath, 'utf8');
        return JSON.parse(content);
    } catch (err) {
        console.error(`读取失败: ${err.message}, 返回默认值`);
        return defaultValue;
    }
}

module.exports = {
    saveJsonToFileSync,
    readJsonFromFileSync,
    saveJsonToFile,
    readJsonFromFile
};
