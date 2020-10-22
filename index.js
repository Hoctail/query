const msgpack = require('@msgpack/msgpack')
const HClient_ = require('./src/HClient')
const WebSocket = require('ws')

class HClient extends HClient_ {
}
HClient.decode = msgpack.decode
HClient.encode = msgpack.encode
HClient.ws = WebSocket

module.exports = HClient
