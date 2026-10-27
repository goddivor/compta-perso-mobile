// App lock hashing: PBKDF2-HMAC-SHA256 in pure JS (expo-crypto has no PBKDF2;
// it only supplies the random salt). The HMAC inner and outer states are
// computed once per key, so each iteration costs two SHA-256 compressions.
// Inputs and outputs are byte arrays; nothing here logs or stores anything.

const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])
const IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]

const W = new Int32Array(64)

// One SHA-256 compression of the 16 words `m` into the 8-word state `h` (in place)
function compress(h, m) {
  for (let i = 0; i < 16; i++) W[i] = m[i]
  for (let i = 16; i < 64; i++) {
    const a = W[i - 15], b = W[i - 2]
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10)
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0
  }
  let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7]
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
    const t1 = (k + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
    const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0
    k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
  }
  h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0
  h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + k) | 0
}

// SHA-256 of `bytes` continued from state `h` after `prefixLen` already-hashed bytes
function finish(h, prefixLen, bytes) {
  const total = prefixLen + bytes.length
  const padded = ((bytes.length + 9 + 63) >> 6) << 6
  const buf = new Uint8Array(padded)
  buf.set(bytes)
  buf[bytes.length] = 0x80
  const bits = total * 8
  const view = new DataView(buf.buffer)
  view.setUint32(padded - 8, Math.floor(bits / 0x100000000))
  view.setUint32(padded - 4, bits >>> 0)
  const m = new Int32Array(16)
  for (let off = 0; off < padded; off += 64) {
    for (let i = 0; i < 16; i++) m[i] = view.getInt32(off + i * 4)
    compress(h, m)
  }
  return h
}

function sha256(bytes) {
  return finish(Int32Array.from(IV), 0, bytes)
}

function wordsToBytes(words) {
  const out = new Uint8Array(words.length * 4)
  const view = new DataView(out.buffer)
  for (let i = 0; i < words.length; i++) view.setInt32(i * 4, words[i])
  return out
}

// UTF-8 bytes of a short ASCII-or-not string
export function utf8(str) {
  return new Uint8Array(unescape(encodeURIComponent(String(str))).split('').map((c) => c.charCodeAt(0)))
}

/** PBKDF2-HMAC-SHA256, 32-byte output (a single block). */
export function pbkdf2(password, salt, iterations) {
  let key = password
  if (key.length > 64) key = wordsToBytes(sha256(key))
  const ipad = new Uint8Array(64).fill(0x36)
  const opad = new Uint8Array(64).fill(0x5c)
  for (let i = 0; i < key.length; i++) { ipad[i] ^= key[i]; opad[i] ^= key[i] }
  const toWords = (b) => { const v = new DataView(b.buffer); return Int32Array.from({ length: 16 }, (_, i) => v.getInt32(i * 4)) }
  const inner0 = Int32Array.from(IV); compress(inner0, toWords(ipad))
  const outer0 = Int32Array.from(IV); compress(outer0, toWords(opad))

  // U1 = HMAC(salt || INT(1))
  const first = new Uint8Array(salt.length + 4)
  first.set(salt)
  first[salt.length + 3] = 1
  const hmac = (msg) => {
    const inner = finish(Int32Array.from(inner0), 64, msg)
    return finish(Int32Array.from(outer0), 64, wordsToBytes(inner))
  }
  const u = hmac(first)
  const acc = Int32Array.from(u)

  // Next iterations on a 32-byte message: one pre-padded block for each hash
  const m = new Int32Array(16)
  m[8] = 0x80000000 | 0
  m[15] = (64 + 32) * 8
  const h = new Int32Array(8)
  for (let n = 1; n < iterations; n++) {
    for (let i = 0; i < 8; i++) { m[i] = u[i]; h[i] = inner0[i] }
    compress(h, m)
    for (let i = 0; i < 8; i++) { m[i] = h[i]; h[i] = outer0[i] }
    compress(h, m)
    for (let i = 0; i < 8; i++) { u[i] = h[i]; acc[i] ^= h[i] }
  }
  return wordsToBytes(acc)
}

export function toHex(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0')
  return s
}

export function fromHex(hex) {
  const out = new Uint8Array(hex.length >> 1)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

/** Constant-time comparison of two byte arrays (length leaks only). */
export function equalBytes(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}
