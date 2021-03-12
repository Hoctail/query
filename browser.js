import HClient from './src/HClient'
import { encode, decode, ExtensionCodec } from '@msgpack/msgpack'
import { bigIntCodec } from './src/ExtensionCodecs'

const extensionCodec = new ExtensionCodec()
bigIntCodec(extensionCodec, encode, decode)

/**
 * @module browser
 */

/**
 * Hoctail query client public API
 *
 * Browser-specific mixin
 * @extends HClient
 */
class Client extends HClient {
  /**
   * Create websocket
   * Auth is managed by browser (cookies)
   * @protected
   */
  createSocket () {
    this.ws = new WebSocket(this.getEndpoint())
  }

  get closed () {
    return this.ws == null || this.ws.readyState === WebSocket.CLOSED
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

  /**
   * Heartbeat is managed by browser, noop here
   * @protected
   */
  heartbeat () {
  }

  /**
   * Get app name from browser url
   * @type {string}
   */
  get app () {
    if (this._app != null || this.schema != null) {
      return this._app
    }
    return this._app = Client.parseApp()
  }

  set app (value) {
    throw new Error('Cannot set app name in browser')
  }

  /**
   * Set up live reload for browser apps
   */
  liveReload () {
    (async () => {
      try {
        await this.call('http_server.dev_subscribe')
        this.ws.removeEventListener('message', this._cmdHandler)
        this.ws.addEventListener('message', this._cmdHandler)
      } catch (e) {
        console.log(e.message)
      }
    })()
  }

  /**
   * Callback that will reload the app on 'refresh' command
   * @param {MessageEvent} event
   * @private
   */
  _cmdHandler (event) {
    const message = this.decode(event)
    if (message.type === 'cmd') {
      const msg = message.msg
      switch (msg.cmd) {
        case 'refresh':
          window.location.reload()
          break
        default:
          console.log(`Unknown command received: ${msg.cmd}`)
      }
    }
  }
}

/**
 * Parse full app path from window.location property
 *
 * @return {string} app path in 'ownerName/appName' format
 * @throws {Error} if cannot parse {@link window.location} properly
 */
Client.parseApp = () => {
  const path = window.location.pathname
  if (path) {
    const parts = path.split('/', 3)
    if (parts[1] && parts[2]) {
      return `${decodeURIComponent(parts[1])}/${decodeURIComponent(parts[2])}`
    }
  }
  throw new Error(`App name cannot be derived from: ${window.location.pathname}`)
}
Client.msgpack = {
  encode: (obj) => {
    return encode(obj, { extensionCodec })
  },
  decode: (data)  => {
    return decode(new Uint8Array(data), { extensionCodec })
  },
}

export default Client
