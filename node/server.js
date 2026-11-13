// server.js
const http = require('http');

// 创建服务
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  
  // 根据路由返回不同内容
  if (req.url === '/') {
    res.end('Hello，Node 本地服务已启动！');
  } else if (req.url === '/api/test') {
    res.end(JSON.stringify({ code: 200, msg: '接口请求成功' }));
  } else {
    res.end('404 页面不存在');
  }
});

// 启动服务，端口 3000
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`服务已启动：http://localhost:${PORT}`);
});