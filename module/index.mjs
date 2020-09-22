import msgpack from '@msgpack/msgpack'
import WebSocket from 'ws'
import HClient from '../src/HClient'

HClient.decode = msgpack.decode
HClient.encode = msgpack.encode
HClient.ws = WebSocket

export default HClient
