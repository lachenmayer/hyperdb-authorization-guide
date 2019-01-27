const fs = require('fs-extra')
const hyperdb = require('hyperdb')
const printDb = require('./lib/print-db-feeds')

const dataDir = __dirname + '/data'

main()

async function main() {
  await fs.emptyDir(dataDir)
  const db1 = await createDb1()
  const db2 = await createDb2(db1.key)
  await authorize(db1, db2)
  await replicate(db1, db2)
  await printDb(db1, '1')
  await printDb(db2, '2')
}

function createDb1() {
  return new Promise(resolve => {
    const db1 = hyperdb(dataDir + '/db1/')
    db1.ready(() => {
      db1.put('example/first', 'db1 was here', () => {
        db1.put('example/second', 'db1 was here', () => {
          resolve(db1)
        })
      })
    })
  })
}

function createDb2(key) {
  return new Promise(resolve => {
    const db2 = hyperdb(dataDir + '/db2/', key)
    db2.ready(() => {
      db2.put('example/third', 'db2 was here', () => {
        db2.put('example/fourth', 'db2 was here', () => {
          resolve(db2)
        })
      })
    })
  })
}

function authorize(db1, db2) {
  return new Promise((resolve, reject) => {
    // Note that we authorize db2.local.key, NOT db2.key!
    db1.authorize(db2.local.key, err => {
      if (err) return reject(err)
      resolve()
    })
  })
}

// In a real app, you would replicate this over a network or some other stream,
// perhaps using https://github.com/hyperswarm/network to find peers.
// Here we just directly pipe the dbs together.
// Note that the replication protocol goes both ways! ("duplex")
// A common mistake is forgetting to pipe the second stream back into the first.
// Nothing will replicate in that case.
function replicate(db1, db2) {
  return new Promise((resolve, reject) => {
    const stream = db1.replicate()
    stream.pipe(db2.replicate()).pipe(stream)
    stream.on('error', reject)
    stream.on('end', resolve)
  })
}
