const BIGINT_EXT_TYPE = 0

function bigIntCodec (extensionCodec, encode, decode) {
  extensionCodec.register({
    type: BIGINT_EXT_TYPE,
    encode: (input) => {
      if (typeof input === 'bigint') {
        return encode(input.toString())
      } else {
        return null
      }
    },
    decode: (data) => {
      return BigInt(decode(data))
    },
  })
}

module.exports = {
  bigIntCodec,
}
