// @ts-check

const msgpack = require('@msgpack/msgpack')
const HClient_ = require('./src/HClient')

/**
 * Hoctail query client public API
 */
class HClient extends HClient_ {}
HClient.decode = msgpack.decode
HClient.encode = msgpack.encode
HClient.ws = require('ws')

module.exports = HClient
