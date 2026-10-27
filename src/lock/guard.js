// Skips the app lock around the app's own trips outside the app (Google
// sign-in, the update installer, the Android settings, the system's own
// fingerprint and screen-lock prompts): they send the app to the background,
// and returning from them must not ask for the code again. No React here.

const GRACE_MS = 1500 // the 'active' event may land just after the call settles
let running = 0
let graceUntil = 0

/** Runs `fn` (sync or async) with the lock suspended; returns its result. */
export async function withoutLock(fn) {
  running++
  try {
    return await fn()
  } finally {
    running--
    graceUntil = Date.now() + GRACE_MS
  }
}

export function lockSuspended() {
  return running > 0 || Date.now() < graceUntil
}
