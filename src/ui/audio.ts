/**
 * Rest-timer chime (SPEC 12): HTMLAudioElement — NOT Web Audio, which the iOS
 * ring/silent switch mutes. Must be primed inside a user gesture (the tap that
 * completes a set) or autoplay policy blocks the later non-gesture play().
 */
let el: HTMLAudioElement | null = null
let primed = false

function element(): HTMLAudioElement {
  if (!el) {
    el = new Audio(`${import.meta.env.BASE_URL}chime.wav`)
    el.preload = 'auto'
  }
  return el
}

/** Call synchronously inside a user-gesture handler. Safe to call repeatedly. */
export function primeAudio(): void {
  if (primed) return
  const a = element()
  a.muted = true
  void a
    .play()
    .then(() => {
      a.pause()
      a.currentTime = 0
      a.muted = false
      primed = true
    })
    .catch(() => {
      a.muted = false
    })
}

export function playChime(): void {
  const a = element()
  a.currentTime = 0
  void a.play().catch(() => undefined)
}
