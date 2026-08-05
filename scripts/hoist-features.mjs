// Second half of the layout migration: src/components/features/* -> src/features/*
// so feature folders sit beside components/, hooks/ and lib/ rather than inside
// the shared-component folder.
//
// The files are moved with `git mv` first; this script then repairs every
// relative import by resolving it against the file's OLD directory and
// re-deriving it from the new one, failing loudly on anything it can't resolve.
// Kept as the record of how the layout was derived, not to be run again.
import fs from 'fs'
import path from 'path'

const OLD_ROOT = 'src/components/features'
const NEW_ROOT = 'src/features'

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : /\.jsx?$/.test(p) ? [p] : []
  })

// newPath -> the directory the file's imports were written against
const oldDirOf = new Map(
  walk(NEW_ROOT).map((p) => [p, path.dirname(p.replace(NEW_ROOT, OLD_ROOT))]),
)

let touched = 0
const unresolved = []
for (const file of walk('src')) {
  const before = fs.readFileSync(file, 'utf8')
  const dir = path.dirname(file)
  const baseDir = oldDirOf.get(file) || dir
  const after = before.replace(
    /((?:from\s+|import\(\s*)['"])(\.[^'"]+)(['"])/g,
    (whole, pre, spec, post) => {
      // Where the specifier used to point, in the pre-move tree.
      let target = path.normalize(path.join(baseDir, spec))
      // Anything that lived under the old features root now lives under the new
      // one; everything else (lib/, hooks/, components/ui, components/shell)
      // keeps its path and only the relative depth changes.
      if (target.startsWith(OLD_ROOT)) target = target.replace(OLD_ROOT, NEW_ROOT)
      const onDisk = ['', '.jsx', '.js', '/index.js'].some((ext) => fs.existsSync(target + ext))
      if (!onDisk) unresolved.push(`${file}: ${spec}`)
      let out = path.relative(dir, target)
      if (!out.startsWith('.')) out = './' + out
      return pre + out + post
    },
  )
  if (after !== before) {
    fs.writeFileSync(file, after)
    touched++
  }
}

if (unresolved.length) {
  console.error('Unresolved imports:\n  ' + unresolved.join('\n  '))
  process.exit(1)
}
console.log(`Repaired imports in ${touched} files.`)
