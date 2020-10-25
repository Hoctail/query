// @ts-check

/**
 * Hoctail client constructor options
 * @typedef {object} ClientOptions
 * @property {string} baseURL endpoint URL
 * @property {string} [schema] schema ID, optional
 * @property {string} [token] auth token, use API key instead, optional
 * @property {string} [app] app name (format: 'ownerName/appName'), optional
 * @property {string} [key] api KEY, required if no {@link ClientOptions#token} supplied
 * */

/**
 * Internal callback to use for query calls, async
 * @callback QueryCallback
 * @param {string} query - SQL query string
 * @param {Array<*>} [params] - array of query parameters, optional
 * @return {Promise<Array<object>>} result array
 * @private
 */

/**
 * User supplied callback to print logs
 *
 * Can use `console.log` in most cases
 *
 * It's a noop by default if not supplied (no logging)
 * @callback LoggerFunction
 * @param {...*} args - arguments to print out
 * @return {void}
 */

/**
 * Custom event message, is used in {@link EventCallback}
 *
 * Used internally
 *
 * Example query to get the event data:
 * ```
 * select *
 * from "${schema}"."${relation}"
 * where id = ANY(${ids});
 * ```
 *
 * @typedef EventMessage
 * @property {string} eventId event id, arbitrary tag
 * @property {string} schema schema ID to select event from
 * @property {string} relation table/view name to select event from
 * @property {string[]} ids list of row IDs to select
 */

/**
 * Event reaction callback
 * @callback EventCallback
 * @param {EventMessage} message - event message
 * @return {void}
 */

/**
 * Generalized {@link WebSocket} implementation
 *
 * Supports both browser-like and nodejs-like interfaces
 * @typedef WebSocketGeneric
 * @property {function(string, function): void} addEventListener -
 * @property {function(string, function): void} removeEventListener -
 * @property {function} send -
 * @property {function(string, function): void} [on] -
 * @property {function(number): void} [setMaxListeners] -
 * @property {string} binaryType -
 * @property {number} readyState -
 * @property {function} close -
 * @property {function} [terminate] -
 * @private
 */

/**
 * Query id, a running number
 *
 * Identifies a query in the current session
 * @private
 * @var {number} query id
 */
let qid = 1

/**
 * Serializes a function definition into string
 *
 * Example:
 *  ```
 *  createSrc((i) => { return i + 1 }, 41) =>
 *    '((i) => { return i + 1 })(41)'
 *  ```
 * @private
 * @param {function} func - function definition
 * @param {...*} args - function arguments, serialized as JSON
 * @return {string} serialized function
 */
function createSrc (func, ...args) {
  const params = JSON.stringify(args).slice(1, -1)
  return `(${func.toString()})(${params})`
}

/**
 * @private
 * @type {RegExp}
 */
const quoteCheck = /^"[^"';]+"$/
/**
 * @private
 * @type {Object<number, string>}
 */
const numCache = { 0: '' }

/**
 * @private
 * @param {number} len
 * @return {string}
 */
function getNumSeq (len) {
  let num = numCache[len]
  if (num == null) {
    num = Array(len).fill(undefined).map((_, i) => `$${i + 1}`).join(',')
    numCache[len] = num
  }
  return num
}

/**
 * Normalizes remote procedure name into a canonical string
 *
 * And adds the arguments placeholders
 *
 * Example:
 * ```
 *   func => "func"
 *   app.func1 => "app"."func1"
 *   "my app".func => "my app"."func"
 * ```
 *
 * @private
 * @param {string} rpcName - remote procedure name
 * @param {number} argsLen - number of arguments
 * @return {string} resulting name, format: "schema"."name"($1,$2,$3,...)
 * @throws {Error} on wrong rpc name format
 */
function normalizeEndpoint (rpcName, argsLen) {
  const error = () => new Error(`Endpoint name error: '${rpcName}'
  Endpoint name should have one of the following formats:
    - endpoint
    - "endpoint name"
    - app.endpoint
    - "app name"."endpoint name"
  `)
  if (typeof rpcName !== 'string') {
    throw error()
  }
  let [schema, name] = rpcName.split('.').map(element => {
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

/**
 * Transaction wrapper class, a public API for client transaction
 */
class Tx {
  /**
   * Creates transaction, do not call it directly, use {@link HClient#tx}
   * @param {QueryCallback} cQuery - query executor function
   * @param {string=} [tid] - transaction id, optional
   */
  constructor (cQuery, tid) {
    /**
     * @private
     * @type {QueryCallback}
     */
    this._queryFunc = cQuery
    /**
     * Transaction id
     * @type {string|null}
     * @readonly
     */
    this.tid = tid
  }

  /**
   * Run SQL query (in transaction block)
   * @param {string} query - SQL query string
   * @param {Array<*>} params - array of query parameters
   * @return {Promise<Array<object>>} array of results
   */
  async query (query, params) {
    return this._queryFunc(query, params)
  }

  /**
   * Commit the transaction, closes the transaction block
   * @return {Promise<void>}
   */
  async commit () {
    await this._queryFunc('commit', [])
  }

  /**
   * Rollback the transaction, closes the transaction block
   * @return {Promise<void>}
   */
  async rollback () {
    await this._queryFunc('rollback', [])
  }

  /**
   * Run function in a server context (in transaction block)
   *
   * Doesn't wait, use {@link HClient#wait} to wait for the result
   * @param {function} func - arbitrary function
   * @param {...*} args - function arguments, will be JSON serialized
   * @return {Promise<void>}
   */
  async run (func, ...args) {
    await this._queryFunc('hoc run', [createSrc(func, ...args)])
  }

  /**
   * Call a remote procedure (in transaction block)
   *
   * Doesn't wait, use {@link HClient#wait} to wait for the result
   * @param {string} endpoint - procedure name
   * @param {Array.<*>} args - array of arguments, will be JSON serialized
   * @return {Promise<*>} returns procedure results if any
   */
  async call (endpoint, ...args) {
    const rows = await this._queryFunc(`select ${normalizeEndpoint(endpoint, args.length)} as value`, args)
    return rows.length > 0 ? rows[0].value : null
  }
}

/**
 * Hoctail query client public API
 */
class HClient {
  /**
   * Creates a new client
   *
   * Typical usage:
   *   `new HClient({ baseURL, key }, console.log)`
   * @constructor
   * @param {ClientOptions} options - config options
   * @param {LoggerFunction} [logger=()=>{}] - logger function, optional, noop by default
   */
  constructor (options, logger) {
    /**
     * Base endpoint URL
     * @type {string}
     * @protected
     */
    this.baseURL = options.baseURL
    /**
     * Logger function
     * @type {LoggerFunction}
     */
    this.logger = logger || function () {}
    /**
     * WebSocket instance
     * @type {WebSocketGeneric|null}
     * @protected
     */
    this.ws = null
    /**
     * Schema ID
     * @type {string|null}
     * @protected
     */
    this.schema = options.schema
    /**
     * Auth token
     * @type {string|null}
     * @protected
     */
    this.token = options.token
    /**
     * App name
     * @type {string|null}
     * @protected
     */
    this._app = options.app
    /**
     * Event message user callback
     * @type {EventCallback|null}
     * @private
     */
    this._eventCallback = null
    if (!this.token && options.key) {
      this.token = `HOC-API ${options.key}`
    }
    /**
     * Alias for {@link HClient#query}
     * @type {function(string, Array<*>, boolean): Promise<Array<Object>>}
     */
    this.q = this.query
  }

  /**
   * Start the client heartbeat
   * @protected
   */
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

  /**
   * Create websocket and set up authentication
   * @protected
   */
  createSocket () {
    if (!this.token) {
      throw new Error(`Auth token is not set, check your config`)
    }
    this.ws = new HClient.ws(this.getEndpoint(), {
      headers: { Authorization: this.token }
    })
    this.ws.setMaxListeners(0)
  }

  /**
   * Get connection endpoint path (href)
   * @return {string}
   * @protected
   */
  getEndpoint () {
    return new URL((this.app || '') + '/', this.baseURL).href
  }

  /**
   * @return {Promise<void>}
   * @private
   */
  async _wsConnect () {
    return new Promise((resolve, reject) => {
      this.createSocket()
      this.ws.binaryType = 'arraybuffer'
      const onMsg = messageHandler.bind(this)
      function onClose () {
        clearTimeout(this.pingTimeout)
      }
      const onError = (e) => {
        this.terminate(1000, e.message)
        reject(e)
      }
      this.ws.addEventListener('open', () => {
        this.heartbeat()
        // temp remove error listener, will be re-added later in `connect()`
        this.ws.removeEventListener('error', onError)
        resolve()
      })
      this.ws.addEventListener('close', onClose)
      this.ws.addEventListener('error', onError)
      this.ws.addEventListener('message', onMsg)
    })
  }

  /**
   * @return {Promise<void>}
   * @private
   */
  async _connect () {
    if (this.ws == null || this.ws.readyState === HClient.ws.CLOSED) {
      const sleep = 3000
      for (let attempts = 3; attempts > 0; attempts--) {
        try {
          await this._wsConnect()
          this.ws.addEventListener('error', (e) => {
            this.terminate(1000, e.message)
            throw new Error('WebSocket closed abnormally')
          })
          return
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

  /**
   * Explicit connect to server, optional
   *
   * Lazy (re)connection is used in {@link HClient#query}, {@link HClient#run}, {@link HClient#call}, etc...
   * @return {Promise<void>}
   */
  async connect () {
    return this._connect()
  }

  /**
   * Create an implicit transaction block
   * @param {boolean} [wait=false] - if true should wait for async call to complete
   * @return {Promise<Tx>} resolves to a transaction instance
   * @private
   */
  async _newTx (wait) {
    await this._connect()
    return new Tx(async (query, params) =>
      (await _wsQuery(this.ws, this.schema, this.app, query, params, undefined, wait)).rows)
  }

  /**
   * Run SQL query within an implicit transaction
   * @param {string} query - SQL query string
   * @param {Array<*>} params - {@link Array} of query paraameters
   * @param {boolean} wait - will wait for any {@link Promise}s to resolve
   * @return {Promise<Array.<object>>} {@link Array} of result objects
   */
  async query (query, params, wait) {
    const tx = await this._newTx(wait)
    return tx.query(query, params)
  }

  /**
   * Run function in a server context
   * @param {function} func
   * @param {...*} args
   * @return {Promise<void>} doesn't return anything
   */
  async run (func, ...args) {
    const tx = await this._newTx()
    await tx.run(func, ...args)
  }

  /**
   * Call a remote procedure
   * @param {string} endpoint - remote procedure name
   * @param {...*} args - remote procedure arguments
   * @return {Promise<*>} result, if any
   */
  async call (endpoint, ...args) {
    const tx = await this._newTx()
    return tx.call(endpoint, ...args)
  }

  /**
   * Call a remote procedure or execute a function and wait for the result
   *
   * The only way to `await` for async functions/procedures
   * @param {function|string} func - inline function or remote procedure name
   * @param {...*} args - function or procedure arguments
   * @return {Promise<*>} result, if any
   */
  async wait (func, ...args) {
    const tx = await this._newTx(true)
    if (typeof func === 'string') {
      return tx.call(func, ...args)
    } else if (typeof func === 'function') {
      const rows = await tx.query('hoc await', [createSrc(func, ...args)])
      return rows.length > 0 ? rows[0].value : null
    } else {
      throw new TypeError(`Unknown parameter type, should be string or function`)
    }
  }

  /**
   * Create transaction and optionally execute a local function in the transaction block context
   * @param {function} [func] - function to execute locally in the transaction block, optional
   * @return {Promise<Tx|Array<*>>} transaction class or result of executing the function
   */
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

  /**
   * Get the current user object
   * @return {Promise<object>}
   */
  async user () {
    return this.call('public.whoami')
  }

  /**
   * The app name getter/setter
   * @type {string}
   */
  get app () {
    return this._app
  }
  set app (arg) {
    this._app = arg
  }

  /**
   * Terminate the client
   * @param {number} [code=1005] - websocket exit code
   * @param {string} [reason=''] - websocket connection close reason
   */
  terminate (code=1005, reason='') {
    if (this.ws != null) {
      this.ws.close(code, reason)
      if (typeof this.ws.terminate === 'function') {
        this.ws.terminate()
      }
      this.ws = null
    }
  }

  /**
   *
   * @param {EventCallback} callback
   */
  eventListener (callback) {
    this._eventCallback = callback
  }
}

// will be re-defined based on the specific environment: ES5, ESM, Browser, etc.
HClient.ws = null
HClient.encode = null
HClient.decode = null

/**
 * @typedef QueryObject
 * @property {string} q SQL query string
 * @property {object|Array<any>|string|null} params SQL query params
 * @private
 */

/**
 * Parse named params object and return a canonical query object with an array of params
 *
 * Example:
 * ```
 * {
 *   q: "select * from t where id = ${myID} and name = ${myName}",
 *   params: { myId: 1, myName: "test" }
 * }
 * ```
 * is converted to:
 * ```
 * {
 *   q: "select * from t where id = $1 and name = $2",
 *   params: [1, "test"]
 * }
 * ```
 * @param {QueryObject} queryObj
 * @return {QueryObject}
 * @private
 */
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

/**
 * Construct {@link Error} object from a serialized error string
 * @param {string} error - error string, JSON serialized
 * @return {Error} resulting {@link Error} object
 * @private
 */
function emitError (error) {
  const errObj = JSON.parse(error)
  const err = new Error(errObj.message)
  const stack = err.stack
  Object.assign(err, errObj)
  if (err.stack === stack) {
    // remove stacktrace generated by error constructor above
    err.stack = stack.slice(0, stack.indexOf('\n'))
  }
  return err
}

/**
 * Main query runner
 * @param {WebSocketGeneric} ws - {@link WebSocket}-like interface
 * @param {string} schema - schema UUID
 * @param {string} appname - application name
 * @param {string} query - SQL query
 * @param {Array<any>} [params] - SQL query params, optional
 * @param {string|null} [tid] - transaction ID, optional
 * @param {boolean} [wait] - wait flag, optional, will wait for {@link Promise} resolution if true
 * @return {Promise<object>} resulting rows {@link Array}
 * @private
 */
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
            return reject(emitError(message.error))
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
        params,
        tid,
        qid: id,
        schema,
        appname,
        await: wait,
      }
      ws.send(HClient.encode(msg))
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Root message handler
 * @callback
 * @param {MessageEvent} event - event to handle
 * @return {void}
 * @private
 */
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
HClient.default = HClient

module.exports = HClient
