var net = require("net"),
  util = require("./lib/util"),
  Queue = require("./lib/queue"),
  to_array = require("./lib/to_array"),
  events = require("events"),
  debug = require('debug')('node_memcached'),
  parsers = [], commands,
  connection_id = 0,
  default_port = 11211,
  default_host = "127.0.0.1";

var protocol = require('./protocol');
var makeRequestBuffer = require('./lib/memjs/utils').makeRequestBuffer;
var makeExpiration = require('./lib/memjs/utils').makeExpiration;
var utils = require('./lib/memjs/utils');

parsers.push(require("./lib/parser/javascript"));

function MemcachedClient(stream, options) {
  this.stream = stream;
  this.options = options = options || {};

  this.connection_id = ++connection_id;
  this.connected = false;
  this.ready = false;
  this.should_buffer = false;
  this.command_queue_high_water = this.options.command_queue_high_water || 1000;
  this.command_queue_low_water = this.options.command_queue_low_water || 0;
  this.command_queue = new Queue(); // holds sent commands to de-pipeline them
  this.offline_queue = new Queue(); // holds commands issued but not able to be sent
  options.expires = 0;
  this.enable_offline_queue = true;
  if (typeof this.options.enable_offline_queue === "boolean") {
    this.enable_offline_queue = this.options.enable_offline_queue;
  }

  this.initialize_retry_vars();

  this.closing = false;
  this.auth_username = null;
  if (options.username !== undefined) {
    this.auth_username = options.username;
  }
  this.auth_pass = null;
  if (options.password !== undefined) {
    this.auth_pass = options.password;
  }
  this.parser_module = null;

  var self = this;

  this.stream.on("connect", function () {
    debug('event: connect');
    self.on_connect();
  });

  this.stream.on("data", function (buffer_from_socket) {
    self.on_data(buffer_from_socket);
  });

  this.stream.on("error", function (msg) {
    self.on_error(msg.message);
  });

  this.stream.on("close", function () {
    self.connection_gone("close");
  });

  this.stream.on("end", function () {
    self.connection_gone("end");
  });

  this.stream.on("drain", function () {
    self.should_buffer = false;
    self.emit("drain");
  });

  events.EventEmitter.call(this);
}
util.inherits(MemcachedClient, events.EventEmitter);
exports.MemcachedClient = MemcachedClient;

// todo: handle this
MemcachedClient.prototype.initialize_retry_vars = function () {
  this.retry_timer = null;
  this.retry_delay = 150;
  this.retry_backoff = 1.7;
  this.attempts = 1;
  this.retry_max_delay = 60000; // 1 minute
};

MemcachedClient.prototype.unref = function () {
  debug("User requesting to unref the connection");
  if (this.connected) {
    debug("unref'ing the socket connection");
    this.stream.unref();
  }
  else {
    debug("Not connected yet, will unref later");
    this.once("connect", function () {
      this.unref();
    })
  }
};

// flush offline_queue and command_queue, erroring any items with a callback first
MemcachedClient.prototype.flush_and_error = function (message) {
  var command_obj, error;

  error = new Error(message);

  while (this.offline_queue.length > 0) {
    command_obj = this.offline_queue.shift();
    if (typeof command_obj.callback === "function") {
      try {
        command_obj.callback(error);
      } catch (callback_err) {
        this.emit("error", callback_err);
      }
    }
  }
  this.offline_queue = new Queue();

  while (this.command_queue.length > 0) {
    command_obj = this.command_queue.shift();
    if (typeof command_obj.callback === "function") {
      try {
        command_obj.callback(error);
      } catch (callback_err) {
        this.emit("error", callback_err);
      }
    }
  }
  this.command_queue = new Queue();
};

MemcachedClient.prototype.on_error = function (msg) {
  var message = "Memcached connection to " + this.host + ":" + this.port + " failed - " + msg;

  if (this.closing) {
    return;
  }

  debug(message);

  this.flush_and_error(message);

  this.connected = false;
  this.ready = false;

  this.emit("error", new Error(message));
  // "error" events get turned into exceptions if they aren't listened for.  If the user handled this error
  // then we should try to reconnect.
  this.connection_gone("error");
};

MemcachedClient.prototype.do_auth = function () {
  var self = this;

  debug("Sending auth to " + self.host + ":" + self.port + " id " + self.connection_id);

  self.send_anyway = true;
  self.send_command("auth", [this.auth_username, this.auth_pass], function (err, res) {
    if (err) {
      return self.emit("error", new Error("Auth error"));
    }

    debug("Auth succeeded " + self.host + ":" + self.port + " id " + self.connection_id);

    if (self.auth_callback) {
      self.auth_callback(err, res);
      self.auth_callback = null;
    }

    // now we are really connected
    self.emit("connect");
    self.initialize_retry_vars();

    self.ready_check();
  });
  self.send_anyway = false;
};

MemcachedClient.prototype.on_connect = function () {
  debug("Stream connected " + this.host + ":" + this.port + " id " + this.connection_id);

  this.connected = true;
  this.ready = false;
  this.command_queue = new Queue();
  this.emitted_end = false;
  this.stream.setNoDelay();
  this.stream.setKeepAlive(true);
  this.stream.setTimeout(0);

  this.init_parser();

  if (this.auth_username && this.auth_pass) {
    this.do_auth();
  }
  else {

    this.emit("connect");
    this.initialize_retry_vars();

    this.ready_check();
  }
};

MemcachedClient.prototype.init_parser = function () {
  var self = this;

  debug("Using default parser module: " + parsers[0].name);
  this.parser_module = parsers[0];

  // return_buffers sends back Buffers from parser to callback. detect_buffers sends back Buffers from parser, but
  // converts to Strings if the input arguments are not Buffers.
  this.reply_parser = new this.parser_module.Parser({ });

  this.reply_parser.on("reply", function (reply) {
    self.return_reply(reply);
  });
  // "error" is bad.  Somehow the parser got confused.  It'll try to reset and continue.
  this.reply_parser.on("error", function (err) {
    self.emit("error", new Error("Memcached reply parser error: " + err.stack));
  });
};

MemcachedClient.prototype.on_ready = function () {
  debug('memcached client is ready.');

  this.ready = true;

  this.send_offline_queue();

  this.emit("ready");
};

MemcachedClient.prototype.ready_check = function () {
  var self = this;

  debug("checking server ready state...");

  this.send_anyway = true;  // secret flag to send_command to send something even if not "ready"
  this.noop(function (err, res) {
    if (err) {
      return self.emit("error", "Ready check failed");
    }

    self.on_ready();
  });
  this.send_anyway = false;
};

MemcachedClient.prototype.send_offline_queue = function () {
  var command_obj, buffered_writes = 0;

  while (this.offline_queue.length > 0) {
    command_obj = this.offline_queue.shift();
    debug("Sending offline command: " + command_obj.command);
    buffered_writes += !this.send_command(command_obj.command, command_obj.args, command_obj.callback);
  }
  this.offline_queue = new Queue();
  // Even though items were shifted off, Queue backing store still uses memory until next add, so just get a new Queue

  if (!buffered_writes) {
    this.should_buffer = false;
    this.emit("drain");
  }
};

MemcachedClient.prototype.connection_gone = function (why) {
  var self = this;

  // If a retry is already in progress, just let that happen
  if (this.retry_timer) {
    return;
  }

  debug("Memcached connection is gone from " + why + " event.");
  this.connected = false;
  this.ready = false;

  // since we are collapsing end and close, users don't expect to be called twice
  if (!this.emitted_end) {
    this.emit("end");
    this.emitted_end = true;
  }

  this.flush_and_error("Memcached connection gone from " + why + " event.");

  // If this is a requested shutdown, then don't retry
  if (this.closing) {
    this.retry_timer = null;
    debug("connection ended from quit command, not retrying.");
    return;
  }

  var nextDelay = Math.floor(this.retry_delay * this.retry_backoff);
  if (nextDelay > this.retry_max_delay) {
    this.retry_delay = this.retry_max_delay;
  }
  else {
    this.retry_delay = nextDelay;
  }

  debug("Retry connection in " + this.retry_delay + " ms");

  this.attempts += 1;
  this.emit("reconnecting", {
    delay: self.retry_delay,
    attempt: self.attempts
  });
  this.retry_timer = setTimeout(function () {
    debug("Retrying connection...");

    self.stream.connect(self.port, self.host);
    self.retry_timer = null;
  }, this.retry_delay);
};

MemcachedClient.prototype.reconnect = function () {
  if (this.connected) {
    debug("Retrying connect, but this.connected == true.");
    return;
  }

  var self = this;

  self.emit("reconnecting");

  debug("Retrying connection...");

  // if we still can not connect to server here, will NOT reconnect automatically
  // because this.attempts >= this.max_attempts)
  self.stream.connect(self.port, self.host);
};

MemcachedClient.prototype.on_data = function (data) {
  /*  if (exports.debug_mode) {
   console.log("net read " + this.host + ":" + this.port + " id " + this.connection_id + ": " + data.toString());
   }*/

  try {
    this.reply_parser.execute(data);
  } catch (err) {
    // This is an unexpected parser problem, an exception that came from the parser code itself.
    // Parser should emit "error" events if it notices things are out of whack.
    // Callbacks that throw exceptions will land in return_reply(), below.
    // TODO - it might be nice to have a different "error" event for different types of errors
    this.emit("error", err);
  }
};

// if a callback throws an exception, re-throw it on a new stack so the parser can keep going.
// if a domain is active, emit the error on the domain, which will serve the same function.
// put this try/catch in its own function because V8 doesn't optimize this well yet.
function try_callback(client, callback, reply) {
  if (!reply || !reply.header || reply.header.status == undefined) {
    client.emit("error", "can not pase message");
    return;
  }

  if (protocol.status.KEY_ENOENT === reply.header.status) {
    if (reply.header.opcode == protocol.opcode.GET) {
      callback(null);
      return;
    }
  }

  if (protocol.status.SUCCESS !== reply.header.status) {
    if (protocol.errors[reply.header.status]) {
      callback(protocol.errors[reply.header.status]);
    }
    else {
      callback('Unknown error');
    }
    return;
  }

  callback(null, reply.val.toString());
}

MemcachedClient.prototype.return_reply = function (reply) {
  var command_obj;

  command_obj = this.command_queue.shift();

  if (command_obj) {
    if (typeof command_obj.callback === "function") {
      try_callback(this, command_obj.callback, reply);
    }
    else {
      debug("no callback for reply: " + (reply && reply.toString && reply.toString()));
    }
  }
};

// This Command constructor is ever so slightly faster than using an object literal, but more importantly, using
// a named constructor helps it show up meaningfully in the V8 CPU profiler and in heap snapshots.
function Command(command, args, sub_command, buffer_args, callback) {
  this.command = command;
  this.args = args;
  this.sub_command = sub_command;
  this.buffer_args = buffer_args;
  this.callback = callback;
}

MemcachedClient.prototype.send_command = function (command, args, callback) {
  var arg, command_obj, i, il, elem_count, buffer_args, stream = this.stream, command_str = "", buffered_writes = 0, last_arg_type, lcaseCommand;

  if (typeof command !== "string") {
    throw new Error("First argument to send_command must be the command name string, not " + typeof command);
  }

  if (Array.isArray(args)) {
    if (typeof callback === "function") {
      // probably the fastest way:
      //     client.command([arg1, arg2], cb);  (straight passthrough)
      //         send_command(command, [arg1, arg2], cb);
    } else if (!callback) {
      // most people find this variable argument length form more convenient, but it uses arguments, which is slower
      //     client.command(arg1, arg2, cb);   (wraps up arguments into an array)
      //       send_command(command, [arg1, arg2, cb]);
      //     client.command(arg1, arg2);   (callback is optional)
      //       send_command(command, [arg1, arg2]);
      //     client.command(arg1, arg2, undefined);   (callback is undefined)
      //       send_command(command, [arg1, arg2, undefined]);
      last_arg_type = typeof args[args.length - 1];
      if (last_arg_type === "function" || last_arg_type === "undefined") {
        callback = args.pop();
      }
    } else {
      throw new Error("send_command: last argument must be a callback or undefined");
    }
  } else {
    throw new Error("send_command: second argument must be an array");
  }

  // if the value is undefined or null and command is set or setx, need not to send message to redis
  if (command === 'set') {
    if (args[args.length - 1] === undefined || args[args.length - 1] === null) {
      var err = new Error('send_command: ' + command + ' value must not be undefined or null');
      return callback && callback(err);
    }
  }

  buffer_args = false;
  for (i = 0, il = args.length, arg; i < il; i += 1) {
    if (Buffer.isBuffer(args[i])) {
      buffer_args = true;
    }
  }

  command_obj = new Command(command, args, false, buffer_args, callback);

  if ((!this.ready && !this.send_anyway) || !stream.writable) {
    if (!stream.writable) {
      debug("send command: stream is not writeable.");
    }

    if (this.enable_offline_queue) {
      debug("Queueing " + command + " for next server connection.");
      this.offline_queue.push(command_obj);
      this.should_buffer = true;
    } else {
      var not_writeable_error = new Error('send_command: stream not writeable. enable_offline_queue is false');
      if (command_obj.callback) {
        command_obj.callback(not_writeable_error);
      } else {
        throw not_writeable_error;
      }
    }

    return false;
  }

  this.command_queue.push(command_obj);

  var buf;
  var extras;
  // Always use "Multi bulk commands", but if passed any Buffer args, then do multiple writes, one for each arg.
  // This means that using Buffers in commands is going to be slower, so use Strings if you don't already have a Buffer.
  if (command === "auth") {
    command_str = "\0" + args[0] + "\0" + args[1];

    buf = makeRequestBuffer(protocol.opcode.SASL_AUTH, 'PLAIN', '', command_str);

    buffered_writes += !stream.write(buf);
  }
  else if (command === "get") {
    buf = makeRequestBuffer(protocol.opcode.GET, args[0], '', '', '');

    buffered_writes += !stream.write(buf);
  }
  else if (command === "delete") {
    buf = makeRequestBuffer(protocol.opcode.DELETE, args[0], '', '', '');

    buffered_writes += !stream.write(buf);
  }
  else if (command === "set") {
    extras = Buffer.concat([new Buffer('00000000', 'hex'), makeExpiration(args[2] || this.options.expires)]);

    buf = makeRequestBuffer(protocol.opcode.SET, args[0], extras, args[1].toString(), '');

    buffered_writes += !stream.write(buf);
  }
  else if (command === "add") {
    extras = Buffer.concat([new Buffer('00000000', 'hex'), makeExpiration(args[2] || this.options.expires)]);

    buf = makeRequestBuffer(protocol.opcode.ADD, args[0], extras, args[1].toString(), '');

    buffered_writes += !stream.write(buf);
  }
  else if (command === "replace") {
    extras = Buffer.concat([new Buffer('00000000', 'hex'), makeExpiration(args[2] || this.options.expires)]);

    buf = makeRequestBuffer(protocol.opcode.REPLACE, args[0], extras, args[1].toString(), '');

    buffered_writes += !stream.write(buf);
  }
  else if (command === "increment") {
    extras = utils.makeAmountInitialAndExpiration(args[1], 0, (args[2] || this.options.expires));

    buf = makeRequestBuffer(protocol.opcode.INCREMENT, args[0], extras, '', '');

    buffered_writes += !stream.write(buf);
  }
  else if (command === "decrement") {
    extras = utils.makeAmountInitialAndExpiration(args[1], 0, (args[2] || this.options.expires));

    buf = makeRequestBuffer(protocol.opcode.DECREMENT, args[0], extras, '', '');

    buffered_writes += !stream.write(buf);
  }
  else if (command === "quit") {
    this.closing = true;
    buf = makeRequestBuffer(protocol.opcode.QUIT, '', '', '', '');

    buffered_writes += !stream.write(buf);
  }
  else if (command === "noop") {
    buf = makeRequestBuffer(protocol.opcode.NO_OP, '', '', '', '');

    buffered_writes += !stream.write(buf);
  }
  else if (command === "version") {
    this.closing = true;
    buf = makeRequestBuffer(protocol.opcode.VERSION, '', '', '', '');

    buffered_writes += !stream.write(buf);
  }
  else if (command === "append") {
    buf = makeRequestBuffer(protocol.opcode.APPEND, args[0], '', args[1].toString(), '');

    buffered_writes += !stream.write(buf);
  }
  else if (command === "prepend") {
    buf = makeRequestBuffer(protocol.opcode.PREPEND, args[0], '', args[1].toString(), '');

    buffered_writes += !stream.write(buf);
  }

  //if (exports.debug_mode) {
  //  console.log("send " + this.host + ":" + this.port + " id " + this.connection_id + ": " + command_str);
  //}

  if (buffered_writes || this.command_queue.getLength() >= this.command_queue_high_water) {
    this.should_buffer = true;
  }
  return !this.should_buffer;
};

MemcachedClient.prototype.end = function () {
  this.stream._events = {};
  this.connected = false;
  this.ready = false;
  this.closing = true;
  return this.stream.destroySoon();
};

// This static list of commands is updated from time to time.  ./lib/commands.js can be updated with generate_commands.js
commands = ["get", "add", "set", "auth", "quit", "delete", "replace", "increment", "decrement", "append", "prepend", "noop", "version"];

commands.forEach(function (fullCommand) {
  var command = fullCommand.split(' ')[0];

  MemcachedClient.prototype[command] = function (args, callback) {
    if (Array.isArray(args) && typeof callback === "function") {
      return this.send_command(command, args, callback);
    } else {
      return this.send_command(command, to_array(arguments));
    }
  };
  MemcachedClient.prototype[command.toUpperCase()] = MemcachedClient.prototype[command];
});

exports.createClient = function (port_arg, host_arg, options) {
  var port = port_arg || default_port,
    host = host_arg || default_host,
    memcached_client, net_client;

  net_client = net.createConnection(port, host);

  memcached_client = new MemcachedClient(net_client, options);

  memcached_client.port = port;
  memcached_client.host = host;

  return memcached_client;
};

exports.createClientFromString = function (s) {

};

exports.protocol = protocol;
