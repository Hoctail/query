const { decode, encode, ExtensionCodec } = require('@msgpack/msgpack')
const HClient = require('./src/HClient')
const WS = require('ws')
const { bigIntCodec } = require('./src/ExtensionCodecs')

const extensionCodec = new ExtensionCodec()
bigIntCodec(extensionCodec, encode, decode)

/**
 * @module nodejs
 */

 /**
   * Query client for nodejs is a low level api. See {@link NodeClient} for alternatives.
   * @extends HClient
   * @param options see {@link HClient} base class
   * @param logger see {@link HClient} base class
  */
class Client extends HClient {
  createSocket () {
    if (!this.token) {
      throw new Error(`Auth token is not set, check your config`)
    }
    this.ws = new WS(this.getEndpoint(), undefined, {
      headers: { Authorization: this.token }
    })
    this.ws.setMaxListeners(0)
  }

  get closed () {
    return this.ws == null || this.ws.readyState === WS.CLOSED
  }

  decode (event) {
    if (!event.hasOwnProperty('decoded')) {
      event.decoded = Client.msgpack.decode(event.data)
    }
    return event.decoded
  }

  encode (obj) {
    return Client.msgpack.encode(obj)
  }
}
Client.msgpack = {
  encode: (obj) => {
    return encode(obj, { extensionCodec })
  },
  decode: (data)  => {
    return decode(new Uint8Array(data), { extensionCodec })
  },
}
module.exports = Client
