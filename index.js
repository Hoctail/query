const msgpack = require('@msgpack/msgpack')
const HClient = require('./src/HClient')
const WebSocket = require('ws')

HClient.decode = msgpack.decode
HClient.encode = msgpack.encode
HClient.ws = WebSocket

module.exports = HClient
