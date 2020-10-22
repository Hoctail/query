// @ts-check
let qid = 1

function createDoBlock (func, ...args) {
  const params = JSON.stringify(args).slice(1, -1)
  return `do $v8$ (${func.toString()})(${params}) $v8$ language plv8`
}

function createAwaitBlock (func, ...args) {
  const params = JSON.stringify(args).slice(1, -1)
  return `do $v8$ 
(async (txid) => {
  try {
    hoc.resolve(txid, await (${func.toString()})(${params}))
  } catch (e) {
    hoc.reject(txid, e)
  }
})(hoc.txid)
$v8$ language plv8`
}

const quoteCheck = /^"[^"';]+"$/
const numCache = { 0: '' }

function getNumSeq (len) {
  let num = numCache[len]
  if (num == null) {
    num = Array(len).fill().map((_, i) => `$${i + 1}`).join(',')
    numCache[len] = num
  }
  return num
}

function normalizeEndpoint (endpoint, argsLen) {
  const error = () => new Error(`Endpoint name error: '${endpoint}'
  Endpoint name should have one of the following formats:
    - endpoint
    - "endpoint name"
    - app.endpoint
    - "app name"."endpoint name"
  `)
  if (typeof endpoint !== 'string') {
    throw error()
  }
  let [schema, name] = endpoint.split('.').map(element => {
    if (!quoteCheck.exec(element)) {
      element = `"${element}"`
      if (!quoteCheck.exec(element)) {
        throw error()
      }
    }
    return element
  })
  const num = getNumSeq(argsLen)
  return `${name ? `${schema}.${name}` : schema}(${num})`
}

const Tx = function (cQuery, tid) {
  this.tid = tid
  this.query = async (query, params) => cQuery(query, params)
  this.commit = async () => cQuery('commit', [])
  this.rollback = async () => cQuery('rollback', [])
  this.run = async (func, ...args) => cQuery(createDoBlock(func, ...args), [])
  this.call = async (endpoint, ...args) => {
    const rows = await cQuery(`select ${normalizeEndpoint(endpoint, args.length)} as value`, args)
    return rows.length > 0 ? rows[0].value : null
  }
}

class HClient {
  constructor (options, logger) {
    this.baseURL = options.baseURL
    this.logger = logger || function () {}
    this.ws = null
    this.schema = options.schema
    this.token = options.token
    this._app = options.app
    this._eventCallback = null
    if (!this.token && options.key) {
      this.token = `HOC-API ${options.key}`
    }
    this.q = this.query
  }

  heartbeat () {
    function hb (client, callback) {
      clearTimeout(client.ws.pingTimeout)
      client.ws.pingTimeout = setTimeout(() => {
        client.terminate(1000, `Timed out`)
        callback(new Error(`Timed out`))
      }, 30000 + 1000)
    }

    this.ws.on('ping', () => {
      hb(this, (e) => {
        if (e) {
          console.log(e.message)
        }
      })
    })
  }

  createSocket () {
    if (!this.token) {
      throw new Error(`Auth token is not set, check your config`)
    }
    this.ws = new HClient.ws(this.getEndpoint(), {
      headers: { Authorization: this.token }
    })
    this.ws.setMaxListeners(0)
  }

  getEndpoint () {
    return new URL((this.app || '') + '/', this.baseURL).href
  }

  async _wsConnect () {
    return new Promise((resolve, reject) => {
      this.createSocket()
      this.ws.binaryType = 'arraybuffer'
      this.ws.addEventListener('open', () => {
        this.heartbeat()
        resolve()
      })
      this.ws.addEventListener('close', function clear () {
        clearTimeout(this.pingTimeout)
      })
      this.ws.addEventListener('error', (e) => {
        this.terminate(1000, e.message)
        reject(e)
      })
      this.ws.addEventListener('message', messageHandler.bind(this))
    })
  }

  async _connect () {
    if (this.ws == null || this.ws.readyState === HClient.ws.CLOSED) {
      const sleep = 3000
      for (let attempts = 3; attempts > 0; attempts--) {
        try {
          return await this._wsConnect()
        } catch (e) {
          console.log(e.message)
          if (attempts > 1) {
            await new Promise((resolve) => {
              console.log(`Sleeping between reconnect attempts...`)
              setTimeout(resolve, sleep)
            })
          }
        }
      }
      throw new Error(`Failed to reconnect`)
    }
  }

  async connect () {
    return this._connect()
  }

  async _newTx (wait) {
    await this._connect()
    return new Tx(async (query, params) => (await _wsQuery(this.ws, this.schema, this.app, query, params, undefined, wait)).rows)
  }

  async query (query, params, wait) {
    const tx = await this._newTx(wait)
    return tx.query(query, params)
  }

  async run (func, ...args) {
    const tx = await this._newTx()
    await tx.run(func, ...args)
  }

  async call (endpoint, ...args) {
    const tx = await this._newTx()
    return tx.call(endpoint, ...args)
  }

  async wait (func, ...args) {
    const tx = await this._newTx(true)
    return tx.query(createAwaitBlock(func, ...args), [])
  }

  async tx (func) {
    await this._connect()
    const { tid } = await _wsQuery(this.ws, this.schema, this.app, 'begin')
    const tx = new Tx(async (query, params) => (await _wsQuery(this.ws, this.schema, this.app, query, params, tid)).rows, tid)
    if (func == null) {
      return tx
    }

    let res
    try {
      res = await func(tx)
    } catch (e) {
      await tx.rollback()
      throw e
    }
    await tx.commit()
    return res
  }

  async user () {
    return this.call('public.whoami')
  }

  set app (value) {
    this._app = value
  }

  get app () {
    return this._app
  }

  terminate (code, reason) {
    if (this.ws != null) {
      this.ws.close(code, reason)
      if (typeof this.ws.terminate === 'function') {
        this.ws.terminate()
      }
      this.ws = null
    }
  }

  eventListener (callback) {
    this._eventCallback = callback
  }
}

function parse_named (queryObj) {
  const params_arr = []
  let i = 0
  if (queryObj.params == null || typeof queryObj.params === 'string' || Array.isArray(queryObj.params))
    return queryObj
  const query = queryObj.q.replace(/\${(\w+)}/g,
    (match, p1) => {
      params_arr[i++] = queryObj.params[p1]
      return `$${i}`
    })
  if (params_arr.length > 0) {
    queryObj.q = query
    queryObj.params = params_arr
  }
  return queryObj
}

function emitError (errObj) {
  const err = new Error(errObj.message)
  const stack = err.stack
  Object.assign(err, errObj)
  if (err.stack === stack) {
    // remove stacktrace generated by error constructor above
    err.stack = stack.slice(0, stack.indexOf('\n'))
  }
  return err
}

async function _wsQuery (ws, schema, appname, query, params, tid, wait = false) {
  const queryObj = parse_named({ q: String(query), params: params })
  params = queryObj.params
  query = queryObj.q
  if (params != null) {
    params = (Array.isArray(params)) ? params : [params]
  }
  const id = qid++
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out`))
    }, 30000)
    const onMessage = function (event) {
      const message = HClient.decode(new Uint8Array(event.data))
      if (message.type === 'result' && message.id === id) {
        try {
          if (message.error) {
            return reject(emitError(JSON.parse(message.error)))
          }
          resolve(message.msg)
        } finally {
          ws.removeEventListener('message', onMessage)
          clearTimeout(timeout)
        }
      }
    }
    ws.addEventListener('message', onMessage)
    try {
      const msg = {
        q: query,
        params: params,
        tid: tid,
        qid: id,
        schema: schema,
        appname: appname,
        await: wait,
      }
      ws.send(HClient.encode(msg))
    } catch (e) {
      reject(e)
    }
  })
}

function messageHandler (event) {
  const message = HClient.decode(new Uint8Array(event.data))
  switch (message.type) {
    case 'log':
      if (typeof message.msg === 'string') {
        this.logger(message.msg)
      } else {
        this.logger(...message.msg)
      }
      break
    case 'event':
      if (typeof this._eventCallback === 'function') {
        this._eventCallback(message.msg)
      }
  }
}

HClient.Tx = Tx
HClient.encode = undefined
HClient.decode = undefined
HClient.ws = undefined

module.exports = HClient
