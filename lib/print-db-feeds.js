const colors = require('kleur')
const messages = require('hyperdb/lib/messages')
const trie = require('hyperdb/lib/trie-encoding')
const util = require('util')

module.exports = async function printDbFeeds(db, name) {
  const source = db.source
  const local = db.local
  console.log(colors.bold(`===== db ${name} =====`))
  console.log('feeds:', db.feeds.length)
  const decodeMap = []
  for (let i = 0; i < db.feeds.length; i++) {
    const feed = db.feeds[i]
    const key = feed.key.toString('hex')
    decodeMap.push(key)

    const feedLabel = colors.bold(`feed ${i}`)
    const sourceLabel = feed.key === source.key ? colors.blue(' (source)') : ''
    const localLabel = feed.key === local.key ? colors.green(' (local)') : ''
    const label = `${feedLabel} ${key}${sourceLabel}${localLabel}\n`

    console.log()
    console.log(label)
    await printFeed(feed, decodeMap)
    console.log()
    console.log()
  }
}

function printFeed(feed, decodeMap) {
  return new Promise((resolve, reject) => {
    feed.ready(() => {
      // The first feed entry is always a header, so we don't print that.
      if (feed.length > 1) {
        feed.getBatch(1, feed.length, (err, entries) => {
          if (err) return reject(err)
          entries
            .map(buf => messages.InflatedEntry.decode(buf))
            .forEach((entry, i) => {
              if (entry.key === '' && entry.value === null) {
                console.log(i + 1, 'inflate entry')
              } else {
                console.log(i + 1)
              }
              console.log('  key: ' + entry.key)
              console.log('  value: ' + entry.value)
              console.log('  deleted: ' + entry.deleted)
              console.log(
                '  trie: ',
                util.inspect(trie.decode(entry.trie, decodeMap), {
                  depth: Infinity,
                })
              )
              console.log('  clock:', entry.clock)
              if (entry.inflate) console.log('  inflate:', entry.inflate)
              if (entry.feeds) {
                console.log('  feeds:')
                entry.feeds.forEach((feed, i) => {
                  console.log(`    - ${i}: ${feed.key.toString('hex')}`)
                })
              }
              if (entry.contentFeed) console.log(' contentFeed:', contentFeed)
              console.log()
            })
          resolve()
        })
      } else {
        resolve()
      }
    })
  })
}
