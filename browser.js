import HClient from './src/HClient'
import msgpack from '@msgpack/msgpack'

HClient.decode = msgpack.decode
HClient.encode = msgpack.encode
HClient.ws = WebSocket

class Client extends HClient {
  createSocket () {
    this.ws = new HClient.ws(this.getEndpoint())
  }

  heartbeat () {
    // noop in browser
  }

  get app () {
    if (this._app != null || this.schema != null) {
      return this._app
    }
    return this._app = Client.parseApp()
  }

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

function _cmdHandler (event) {
  const message = HClient.decode(new Uint8Array(event.data))
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

export default Client
