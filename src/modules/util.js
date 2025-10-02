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


module.exports =  {
    formatTimestamp
};
