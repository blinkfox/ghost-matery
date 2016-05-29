node_memcached
===========================

这是一个为 node.js 开发的 memcached 客户端，使用二进制传输协议，支持 SASL 鉴权。特别针对阿里云 OCS 进行优化。

该项目基于 [redis](https://github.com/mranney/node_redis) 和 [memjs](https://github.com/alevy/memjs) 开发。

安装:

    npm install node_memcached

## 从 0.2.x 版本迁移

从 0.2.x 版本迁移的开发者请注意，在所有的命令返回中不再使用 res.val.toString() 得到数据，直接使用即可：

```javascript
  client.get('key', function(err, res) {
    // 不要这样
    console.log(res.val.toString());
  })

  client.get('key', function(err, res) {
    // 直接获取数据
    console.log(res);
  })
```

## 使用方法

```javascript
  var PORT = 11211;
  var HOST = '127.0.0.1';
  var username = 'myname';
  var password = 'mypass';
  var memcached = require("node_memcached");

  var client = memcached.createClient(PORT, HOST, {
    username: username,
    password: password
  });

  client.on("error", function (err) {
    console.log("Error " + err);
  });

  // 10 为过期时间， 10秒
  client.set('hello', 'world', 10);

  client.get('hello', function(err, res) {
    console.log(err, res);
  });

  // 也可以不用设置过期时间
  client.set('number', 1);

  client.increment('number', 2);

  client.decrement('number', 1);

  client.get('number', function(err, res) {
    console.log(err, res);
  });
```

# API

## Connection Events

`client` 会发送以下事件.

### "connect"

`client` 在与 memcached 服务器建立连接后发送 'connect' 事件, 但并不代表 `client` 已经可以向 memcached 发送命令。

### "ready"

`client` 在发送 `connect` 事件后, 如果设置了 username 和 password，那么将在 SASL 鉴权 成功后发送 `ready` 事件,
否则会立即发送 `ready` 事件。 在 `ready` 事件之前，所有的命令都会被加入队列，一旦 `ready` 发送， 这些命令将会依次执行。

### "error"

`client` 会在遇到无法处理的错误时发送 `error` 事件。

注意，在 node 中 `error` 是一个特殊的事件，如果 `cliet` 发送了这个事件而没有被侦听，那么将会导致 node 进程退出。因此
你应该在创建 `client` 的时候主动侦听该事件并作出相应处理。例如：

```javascript
  var client = Memcached.createClient();
  client.on('error', function(err) {
    log('Error', err)
  })
```

### "end"

`client` 会在与 memcached 断开连接后发送 `end` 事件。

## createClient()

### 选项

redis.createClient() = redis.createClient(PORT, HOST);

redis.createClient() = redis.createClient(PORT, HOST, {
  username: '',
  password: ''
})

* `PORT`: memcached 服务器的端口号，默认为 11211
* `HOST`: memcached 服务器的 IP 地址，默认为 127.0.0.1
* `username`: 如果设置了该项，则启用 SASL 鉴权，否则直接连接 memcached 服务器。
* `password`: 如果设置了该项，则启用 SASL 鉴权，否则直接连接 memcached 服务器。

`createClient()` 将返回一个 `MemcachedClient`  对象.

## end()

强制关闭 `client` 与 memcached 服务器之间的连接。

## 自动重连

在 `client` 断开连接后，如果开发者没有调用 client.end()，则 `client` 将会自动尝试重新连接 memcached 服务器，初始延时为 150ms，
重连失败后延时加长，最长为 1 分钟并且会持续尝试直到连接成功。

## 打开调试信息

在运行 node 之前输出环境变量 DEBUG=node_memcached 将会打印调试信息。

