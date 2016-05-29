var events = require("events"),
  util = require("../util");

var utils = require('../memjs/utils');

exports.name = "javascript";

function ReplyParser() {
  this.name = exports.name;

  this.responseBuffer = new Buffer([]);
}

util.inherits(ReplyParser, events.EventEmitter);

exports.Parser = ReplyParser;

// Buffer.toString() is quite slow for small strings
function small_toString(buf, start, end) {
  var tmp = "", i;

  for (i = start; i < end; i++) {
    tmp += String.fromCharCode(buf[i]);
  }

  return tmp;
}

ReplyParser.prototype.appendToBuffer = function (dataBuf) {
  var old = this.responseBuffer;
  this.responseBuffer = new Buffer(old.length + dataBuf.length);
  old.copy(this.responseBuffer, 0);
  dataBuf.copy(this.responseBuffer, old.length);
  return this.responseBuffer;
};

ReplyParser.prototype.execute = function (dataBuf) {
  var response = utils.parseMessage(this.appendToBuffer(dataBuf));
  while (response) {
    this.send_reply(response);

    var respLength = response.header.totalBodyLength + 24;
    this.responseBuffer = this.responseBuffer.slice(respLength);
    response = utils.parseMessage(this.responseBuffer);
  }
};

ReplyParser.prototype.send_reply = function (reply) {
  this.emit("reply", reply);
};
