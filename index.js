const { decode, encode } = require('@msgpack/msgpack')
const HClient = require('./src/HClient')
const WS = require('ws')

/**
 * @module nodejs
 */

/**
 * Query client for nodejs
 * @extends HClient
 * @public
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
      event.decoded = decode(new Uint8Array(event.data))
    }
    return event.decoded
  }

  encode (obj) {
    return encode(obj)
  }
}
module.exports = Client
