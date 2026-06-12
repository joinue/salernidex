// Deterministic monogram avatars: every person gets a stable color from their
// name, so the same face always looks the same — instant visual recognition
// across the app, no photos required.

// Curated, slightly-desaturated gradient pairs tuned to feel premium in both
// light and dark. Index is chosen by hashing the name, so it never changes.
const GRADIENTS = [
  ['#FF7A5C', '#FF4D6D'], // coral → rose
  ['#FFB14E', '#FF7A5C'], // amber → coral
  ['#5AC8FA', '#0A84FF'], // sky → blue
  ['#34C7B5', '#0A84FF'], // teal → blue
  ['#30D158', '#34C7B5'], // green → teal
  ['#BF5AF2', '#7A5CFF'], // orchid → violet
  ['#FF6FD8', '#BF5AF2'], // pink → orchid
  ['#7A5CFF', '#0A84FF'], // violet → blue
  ['#FFD60A', '#FF9F0A'], // yellow → orange
  ['#64D2FF', '#5E5CE6'], // cyan → indigo
  ['#FF8FA3', '#C9457A'], // blush → magenta
  ['#A0E060', '#30D158'], // lime → green
]

function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

// Up to two initials: first letter of the first and last meaningful words.
export function initials(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0][0].toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export function avatarGradient(name = '') {
  const [from, to] = GRADIENTS[hash(name) % GRADIENTS.length]
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`
}
