// @ts-check

import HClient_ from './src/HClient'
import * as msgpack from '@msgpack/msgpack'

/**
 * Hoctail query client public API
 *
 * Browser-specific mixin
 */
class Client extends HClient_ {
  /**
   * Create websocket
   * Auth is managed by browser (with cookies)
   * @protected
   */
  createSocket () {
    this.ws = new WebSocket(this.getEndpoint())
  }

  /**
   * Heartbeat is managed by browser, noop here
   * @protected
   */
  heartbeat () {
  }

  /**
   * The app name getter
   * @public
   * @return {string}
  */
  get app () {
    if (this._app != null || this.schema != null) {
      return this._app
    }
    return this._app = Client.parseApp()
  }

  /**
   * The app name setter
   * @public
   * @param {string} value
  */
  set app (value) {
    super.app = value
  }

  /**
   * Set up live reload for browser apps
   * @public
   */
  liveReload () {
    (async () => {
      try {
        await this.call('http_server.dev_subscribe')
        this.ws.removeEventListener('message', _cmdHandler)
        this.ws.addEventListener('message', _cmdHandler)
      } catch (e) {
        console.log(e.message)
      }
    })()
  }
}

/**
 * Callback that will reload the app on 'refresh' command
 * @callback
 * @param {MessageEvent} event
 * @private
 */
function _cmdHandler (event) {
  const message = Client.decode(new Uint8Array(event.data))
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

/**
 * Parse full app path from window.location property
 *
 * @public
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
/** 
 * @public
 * @type {any}
 * */
Client.decode = msgpack.decode
/** 
 * @public
 * @type {any}
 * */
Client.encode = msgpack.encode
/**
 * @public
*/
Client.ws = WebSocket

export default Client
