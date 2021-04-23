# Welcome to @hoctail/query
[![Version](https://img.shields.io/npm/v/@hoctail/query.svg)](https://www.npmjs.com/package/@hoctail/query)
[![Documentation](https://img.shields.io/badge/documentation-yes-brightgreen.svg)](https://hoctail.github.io/query/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/Hoctail/query/blob/master/LICENSE)

> Hoctail query client is a low level API for browser and nodejs.

### 🏠 [Homepage](https://github.com/hoctail/query)

## Install

```sh
yarn install @hoctail/query
```

## Examples

```js
import Client from '@hoctail/query'

const options = {
  baseURL: 'wss://api.hoctail.io', // Hoctail endpoint URL
  key: 'xxx-xxxx-xxxx-xxxxxxxxx', // your API key
  app: 'user@example.com/my-app', // your Hoctail app identifier
}
// create a client instance
// use `console.log()` as a default logger function
const client = new Client(options, console.log)

// run an SQL query on server
client.query('select * from users').then(console.log)

// call a public stored procedure on server
client.call('public.whoami').then(console.log)

// run a function in a server context
client.wait(() => {
  return `Hello ${hoc.userName}`
}).then(console.log)

// run an async function in a server context
// that fetches from a remote API
client.wait(async () => {
  const fetch = require('node-fetch')
  const res = await fetch('https://reqres.in/api/users/2')
  return await res.json()
}).then(console.log)
```

See [the docs](https://hoctail.github.io/hoctail/) for a complete API documentation

## Author

👤 **Hoctail**

## 🤝 Contributing

Contributions, issues and feature requests are welcome!

Feel free to check [issues page](https://github.com/Hoctail/query/issues). 
