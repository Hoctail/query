/**
 * Hoctail client constructor options
 * @typedef {object} ClientOptions
 * @property {string} baseURL endpoint URL
 * @property {string} [schema] schema ID, optional
 * @property {string} [token] auth token, use API key instead, optional
 * @property {string} [app] app name (format: 'ownerName/appName'), optional
 * @property {string} [key] api KEY, required if no token supplied
 * @property {string|number} [logLevel] minimal log level, default: 'LOG'
 * @public
 * */

/**
 * Internal callback to use for query calls, async
 * @callback QueryCallback
 * @param {string} query - SQL query string
 * @param {Array<*>} [params] - array of query parameters, optional
 * @return {Promise<object[]>} result array
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
 * @public
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
 * @protected
 */

/**
 * Event reaction callback
 * @callback EventCallback
 * @param {EventMessage} message - event message
 * @return {void}
 * @protected
 */

/**
 * Application context options
 *
 * Used as a pointer to a specific app context
 * @typedef {Object} AppOptions
 * @property {string} [id] - app id
 * @property {string} [owner] - app owner
 * @property {string} [name] - app name
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

const LOG = {
  10: 'DEBUG5',
  11: 'DEBUG4',
  12: 'DEBUG3',
  13: 'DEBUG2',
  14: 'DEBUG1',
  15: 'LOG',
  17: 'INFO',
  18: 'NOTICE',
  19: 'WARNING',
  20: 'ERROR',
  DEBUG5: 10,
  DEBUG4: 11,
  DEBUG3: 12,
  DEBUG2: 13,
  DEBUG1: 14,
  LOG: 15,
  INFO: 17,
  NOTICE: 18,
  WARNING: 19,
  ERROR: 20,
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
 * @public
 * @hideconstructor
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
   * @param {Array<*>} [params] - array of query parameters
   * @return {Promise<object[]>} array of results
   * @public
   */
  async query (query, params) {
    return this._queryFunc(query, params)
  }

  /**
   * Commit the transaction, closes the transaction block
   * @return {Promise<void>}
   * @public
   */
  async commit () {
    await this._queryFunc('commit', [])
  }

  /**
   * Rollback the transaction, closes the transaction block
   * @return {Promise<void>}
   * @public
   */
  async rollback () {
    await this._queryFunc('rollback', [])
  }

  /**
   * Run function in a server context (in transaction block)
   *
   * Sync function only, use {@link HClient#wait} to wait for async function
   *
   * __Note: return value will be ignored!__
   * @param {function} func - arbitrary function
   * @param {...*} args - function arguments, will be JSON serialized
   * @return {Promise<void>}
   * @public
   */
  async run (func, ...args) {
    await this._queryFunc('hoc run', [createSrc(func, ...args)])
  }

  /**
   * Call a remote procedure (in transaction block)
   *
   * Sync function only, use {@link HClient#wait} to wait for async function
   * @param {string} endpoint - procedure name
   * @param {...*} args - array of arguments, will be JSON serialized
   * @return {Promise<*>} returns procedure results if any
   * @public
   */
  async call (endpoint, ...args) {
    const rows = await this._queryFunc(`select ${normalizeEndpoint(endpoint, args.length)} as value`, args)
    return rows.length > 0 ? rows[0].value : null
  }
}

/**
 * Hoctail query client public API. It's a base class and not intended for direct use.
 * Check inherited instead:
 * {@link Client}
 */
class HClient {
  /**
   * Creates a new client. This is a base class, see
   *
   * Typical usage:
   *   `new HClient({ baseURL, key }, console.log)`
   * @constructor
   * @param {ClientOptions} options - config options
   * @param {LoggerFunction} [logger] - logger function, optional, noop by default
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
     * @type {LoggerFunction|null}
     */
    this.logger = logger
    /**
     * WebSocket instance
     * @type {*}
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
    /**
     * Default log level to use for the logger
     * @type {number}
     */
    this.logLevel = parseLogLevel(options.logLevel)
    this._logsQueue = new Map()
    this._terminating = false
    this._connecting = false
  }

  /**
   * Get a slot from queue
   * @param {number} qid
   * @param {number} priority
   * @protected
   * @returns {Promise<void>}
   */
  async _slotGet (qid, priority) {
    throw new Error('Not implemented')
  }

  /**
   * Return a slot to queue
   * @param {number} qid
   * @protected
   * @returns {void}
   */
  _slotFree (qid) {
    throw new Error('Not implemented')
  }

  /**
   * Flush all the queue slots
   * @protected
   * @returns {Promise<void>}
   */
  _flushQueue () {
    throw new Error('Not implemented')
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
    throw new Error('Not implemented')
  }

  /**
   * Check if connection is closed
   * @type {boolean}
   * @protected
   */
  get closed () {
    return this.ws == null
  }

  /**
   * Decode msgpack event data and cache decoded event
   * @param {MessageEvent} event
   * @return {object}
   * @protected
   */
  decode (event) {
    throw new Error('Not implemented')
  }

  /**
   * Encode message as msgpack buffer
   * @param {object} obj
   * @return {Uint8Array}
   * @protected
   */
  encode (obj) {
    throw new Error('Not implemented')
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
    // wait until state is CLOSED or OPEN
    while (this._terminating || this._connecting) {
      await new Promise((resolve) => {
        setTimeout(resolve, 100)
      })
    }
    if (this.closed) {
      this._connecting = true
      const sleep = 3000
      for (let attempts = 3; attempts > 0; attempts--) {
        try {
          await this._wsConnect()
          this.ws.addEventListener('error', (e) => {
            this.terminate(1000, e.message)
            throw new Error('WebSocket closed abnormally')
          })
          this._connecting = false
          return
        } catch (e) {
          // in node `ws` we do have access to client errors
          if (e.target && e.target._req && e.target._req.res) {
            const code = e.target._req.res.statusCode
            const msg = e.target._req.res.statusMessage
            if (code >= 400 && code < 500) {
              // we try to create a better error here
              throw new Error(`Failed to connect, client error or permission denied. HTTP code: ${code} ${msg}`)
            }
          }
          console.error(e.message)
          if (attempts > 1) {
            await new Promise((resolve) => {
              console.error(`Sleeping between reconnect attempts...`)
              setTimeout(resolve, sleep)
            })
          }
        }
      }
      this._connecting = false
      throw new Error(`Failed to reconnect`)
    }
  }

  /**
   * Explicit connect to server, optional
   *
   * Lazy (re)connection is used in all of the query functions
   * @return {Promise<void>}
   * @public
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
      (await _wsQuery(this, query, params, undefined, wait)).rows)
  }

  /**
   * Run SQL query within an implicit transaction
   * @param {string} query - SQL query string
   * @param {Array<*>} [params] - {@link Array} of query parameters
   * @param {boolean} [wait] - will wait for any server side {@link Promise}s to resolve
   * @return {Promise<object[]>} {@link Array} of result objects
   * @public
   */
  async query (query, params, wait) {
    const tx = await this._newTx(wait)
    return tx.query(query, params)
  }

  /**
   * Run a custom function in a server context
   *
   * __Note: return value will be ignored!__
   * @example
   * let res = await client.run(() => {
   *   console.log('will be logged')
   *   return 42
   * })
   * // `res` will be `null`
   *
   * // compare to `wait()`
   * res = await client.wait(() => {
   *   console.log('will be logged')
   *   return 42
   * })
   * // `res` will be `42`
   *
   * @param {function} func - function definition
   * @param {...*} args - function arguments
   * @return {Promise<void>} doesn't return anything
   * @public
   */
  async run (func, ...args) {
    const tx = await this._newTx()
    await tx.run(func, ...args)
  }

  /**
   * Call a remote procedure
   *
   * Returns result, if synchronous
   * @param {string} endpoint - remote procedure name
   * @param {...*} args - remote procedure arguments
   * @return {Promise<*>} result, if any
   * @public
   */
  async call (endpoint, ...args) {
    const tx = await this._newTx()
    return tx.call(endpoint, ...args)
  }

  /**
   * Call an async remote procedure or execute a function and wait for the result
   *
   * The only way to `await` for async functions/procedures
   *
   * __Note: will open multiple transactions! (after each await/Promise)__
   * @param {function|string} func - inline function or remote procedure name
   * @param {...*} args - function or procedure arguments
   * @return {Promise<*>} result, if any
   * @public
   * @example
   * let res = await hoctail.wait(() => { return BigInt(Number.MAX_SAFE_INTEGER + 1) })
   * // res = 9007199254740992n
   * res = await hoctail.wait(async () => {
   *   // first transaction
   *   let sum = await Promise.resolve(2)
   *   // second transaction (after await)
   *   sum += await Promise.resolve(3)
   *   // third transaction (after another await)
   *   return sum
   * })
   * // res = 5
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
   * Create transaction and optionally execute a local sync function in the transaction block context
   * @example
   * // create transaction and execute queries
   * // (runs locally, sends queries to server and reads in the results)
   * await client.tx(async (tx) => {
   *   const rows = await tx.query(`select * from table`)
   *   for (let row of rows) {
   *     await tx.query(`insert into table2 values ($1, $2)`, [row.col1, row.col2])
   *   }
   *   return rows
   * })
   * // the above is equivalent to:
   * // (runs remotely, compiles and executes in one go)
   * await client.wait(() => {
   *   const rows = hoc.sql(`select * from table`)
   *   for (let row of rows) {
   *     hoc.sql(`insert into table2 values ($1, $2)`, [row.col1, row.col2])
   *   }
   *   return rows
   * })
   * // `client.tx()` will be much slower than `client.wait()`
   *
   * // create and use an explicit transaction
   * const tx = await client.tx()
   * await tx.query(`insert into table values($1, $2)`, [1, 'a'])
   * // ....
   * // you cannot hold here too long, server will kill long transactions
   * await tx.commit()
   * @param {function} [func] - function to execute locally in the transaction block, optional
   * @return {Promise<Tx|*>} transaction class or result of executing the function
   * @public
   */
  async tx (func) {
    await this._connect()
    const { tid } = await _wsQuery(this, 'begin')
    const tx = new Tx(async (query, params) => (await _wsQuery(this, query, params, tid)).rows, tid)
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
   *
   * Only `username` and `email` properties of the object are always returned.
   * Other props are optional, (`password` is always hidden)
   *
   * @example
   * {
   *   username: 'johndoe',
   *   firstname: 'John',
   *   lastname: 'Doe',
   *   email: 'jdoe@hoctail.io',
   *   picture: {},
   *   password: '********'
   * }
   * @return {Promise<Object<string, any>>}
   * @public
   */
  async user () {
    return this.call('public.whoami')
  }

  /**
   * The app name getter/setter
   * @type {string}
   * @public
   */
  get app () {
    return this._app
  }
  set app (arg) {
    this._app = arg
  }

  /**
   * Terminate the websocket
   *
   * Use `close()` instead
   * @param {number} [code] - websocket exit code
   * @param {string} [reason] - websocket connection close reason
   * @public
   */
  async terminate (code, reason) {
    if (!this._terminating && !this.closed) {
      this._terminating = true
      await Promise.allSettled(this._logsQueue.values())
      this._logsQueue.clear()
      await this._flushQueue()
      this.ws.close(code, reason)
      if (typeof this.ws.terminate === 'function') {
        this.ws.terminate()
      }
      this.ws = null
      this._terminating = false
    }
  }

  /**
   * Add a custom event listener for server events
   * @param {EventCallback} callback
   * @protected
   */
  eventListener (callback) {
    this._eventCallback = callback
  }

  /**
   * Restart the app, will re-require all the modules
   * @public
   */
  async restartApp () {
    const tx = await this._newTx()
    await tx.query('HOC RESTART')
  }

  /**
   * Get the current env variables from server
   * @public
   */
  async getEnv () {
    return this.wait(() => process.env)
  }

  /**
   * Set env vars, values will be stringified and keys uppercased
   *
   * Will be merged with the current env
   *
   * __Note: you may need to run `restartApp()` to read in the changes (re-read `process.env`)__
   * @param {Object<string, any>} env
   * @public
   */
  async setEnv (env) {
    await this.run(env => {
      process.env = Object.assign({}, process.env, env)
    }, env)
  }

  /**
   * Remove (undef) an env variable
   *
   * __Note: you may need to run `restartApp()` to read in the changes (re-read `process.env`)__
   * @param {string} name
   * @public
   */
  async delEnv (name) {
    await this.run(name => {
      delete process.env[name]
    }, name)
  }

  /**
   * Execute code in a server-side transaction
   *
   * @example
   * // Create a new table
   * client.stx(store => {
   *   store.system.schema.addTable('My Table')
   * })
   * // Add a table to another app
   * client.stx(store => {
   *   store.system.schema.addTable('Some Table')
   * }, { owner: 'username', name: 'app' })
   * @param {Function} func - executed function
   * @param {AppOptions} [options] - app transaction context options
   * @returns {Promise<void>}
   * @public
   */
  async stx (func, options) {
    const tx = await this._newTx()
    await tx._queryFunc('hoc run', [`
    (options => {
      const { serverSideTx } = require('@hoctail/patch-interface')
      serverSideTx(hoc, ${func.toString()}, options)
    })(${JSON.stringify(options)})
    `])
  }
}


/**
 * @typedef QueryObject
 * @property {string} q SQL query string
 * @property {object|Array<*>|string|null} params SQL query params
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
 * @param {HClient} client - client instance
 * @param {string} query - SQL query
 * @param {Array<*>} [params] - SQL query params, optional
 * @param {string|null} [tid] - transaction ID, optional
 * @param {boolean} [wait] - wait flag, optional, will wait for {@link Promise} resolution if true
 * @return {Promise<object>} resulting rows {@link Object}
 * @private
 */
async function _wsQuery (client, query, params, tid, wait = false) {
  const queryObj = parse_named({ q: String(query), params: params })
  params = queryObj.params
  query = queryObj.q
  if (params != null) {
    params = (Array.isArray(params)) ? params : [params]
  }
  const id = qid++
  await client._slotGet(id, 0)
  return new Promise((resolve, reject) => {
    const msg = {
      q: query,
      params,
      tid,
      qid: id,
      schema: client.schema,
      appname: client.app,
      await: wait,
    }
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for: ${JSON.stringify(msg)}`))
    }, 30000)
    let onClose
    const onMessage = function (event) {
      const message = client.decode(event)
      if (message.type === 'result' && message.id === id) {
        try {
          if (message.error) {
            return reject(emitError(message.error))
          }
          resolve(message.msg)
        } finally {
          client.ws.removeEventListener('message', onMessage)
          client.ws.removeEventListener('close', onClose)
          clearTimeout(timeout)
          client._slotFree(id)
        }
      }
    }
    onClose = () => {
      try {
        if (client.ws) {
          client.ws.removeEventListener('message', onMessage)
        }
      } finally {
        clearTimeout(timeout)
      }
    }
    client.ws.addEventListener('message', onMessage)
    client.ws.addEventListener('close', onClose)
    try {
      client.ws.send(client.encode(msg))
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
async function messageHandler (event) {
  const message = this.decode(event)
  switch (message.type) {
    case 'log':
      const msg = message.msg
      if (this.logger && msg.severity >= this.logLevel) {
        if (msg.text) {
          this.logger(msg.text)
          return
        }
        const logQuery = async () => {
          try {
            const rows = await this.query(`select * from "${msg.schema}".logs where id = $1`, [msg.id])
            if (rows.length > 0) {
              const row = rows[0]
              this.logger(row.message)
            }
          } catch (e) {
            this.logger(e)
          }
        }
        const promise = logQuery()
        this._logsQueue.set(logQuery, promise)
        await promise
        this._logsQueue.delete(logQuery)
      }
      break
    case 'event':
      if (typeof this._eventCallback === 'function') {
        this._eventCallback(message.msg)
      }
  }
}

/**
 * Parse logLevel severity and return a numeric value, will fail on unknown level
 * @param {string|number|null} [logLevel] - log level severity to parse
 * @return {number} numeric severity level
 */
function parseLogLevel (logLevel) {
  let outLevel = logLevel
  if (logLevel == null) {
    outLevel = LOG.LOG
  } else if (typeof logLevel === 'string') {
    outLevel = LOG[logLevel.toUpperCase()]
  } else if (typeof logLevel === 'number' && LOG[logLevel] == null) {
    outLevel = null
  }
  if (outLevel == null) {
    throw new Error(`Unknown log severity level: ${logLevel}`)
  }
  return outLevel
}

HClient.Tx = Tx
HClient.default = HClient
HClient.LOG = LOG
HClient.paseLogLevel = parseLogLevel

module.exports = HClient
