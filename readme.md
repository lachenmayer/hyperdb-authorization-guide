# Authorization in hyperdb: a deep dive

The goal of this guide is to uncover how [hyperdb](https://npm.im/hyperdb) authorization works in detail. HyperDB creates a key-value store from several [hypercore](https://npm.im/hypercore) feeds (append-only logs), and allows multiple writers to write to a single database. Here, I'll only be focusing on the built-in authorization mechanism - if you want to find out more about how the data structure itself works, check out the [hyperdb architecture document](https://github.com/mafintosh/hyperdb/blob/master/ARCHITECTURE.md) for details (it's very cool).

This guide might be useful to you if you want to know more about the inner workings of the forthcoming "multiwriter" features in the Dat ecosystem. If you don't know what hyperdb or Dat is, I recommend checking out the [Dat website](https://datproject.org/) and exploring the various projects featured on [dat.land](https://dat.land/). That said, this guide does not assume any knowledge of Dat or hyperdb, so you should be able to follow this if you have never used Dat or hyperdb before. This guide does go deep into the code, so if that's not your thing, this is probably not for you.

If anything is confusing or unclear, please open an issue! Also, if you notice any mistakes like typos or broken links, feel free to open a pull request or open an issue.

The [hyperdb architecture document](https://github.com/mafintosh/hyperdb/blob/master/ARCHITECTURE.md) tells us this:

> The set of hypercores are _authorized_ in that the original author of the first hypercore in a hyperdb must explicitly denote in their append-only log that the public key of a new hypercore is permitted to edit the database. Any authorized member may authorize more members. There is no revocation or other author management elements currently.

In this guide, we'll dig a bit deeper than that, and find out how exactly authors denote these permissions, and some of the implications of this. We'll start by defining exactly what hyperdb does, play around with these concepts in an interactive example, and then thoroughly walk through the bits of code which make all this magic happen.

_I will link to specific lines in the hyperdb GitHub repo throughout. These will link to the current release [`v3.5.0`](https://github.com/mafintosh/hyperdb/commit/19d01e52376a862674c7576539db0d0cbb4a23f5). I am not linking to master, because otherwise the line numbers will get messed up when the code gets updated. By the time you read this, a lot of this might very well be out of date - things move fast in Dat land. 🐝_

## hyperbasics - _hypercore_ & _hyperdb_

HyperDB is made up of several [hypercore](https://npm.im/hypercore) _feeds_. Every one of these feeds is an append-only log containing the writes made by a single person/device. We'll get into what exactly goes into these feeds below.

Hypercore feeds have a very simple API (slightly simplified):

- `get(seq)`: Returns the data at sequence number `seq`.
- `append(data)`: Add new data to the end of the feed. Returns the `seq` number at which this data is stored in the feed.

All of the data that is added to the feed is cryptographically signed using a _secret key_. The person holding the _secret key_ is referred to as the _owner_ of the feed.

Feeds are identified by their corresponding _public key_ (usually just called _key_), which allows the receiver to verify the data sent to them by untrusted peers.

The fact that anyone with access to the public key can verify that the data is legitimate (ie. comes from the person who owns the corresponding secret key) no matter where it came from is what makes hypercore a _peer-to-peer_ data structure. Hypercore feeds are also very efficient to replicate across a network.

From these feeds, hyperdb builds a _multi-writer_ _key-value_ database (db) which allows for the following operations:

- `get(key)`: Returns the `value` stored at the given `key` if it exists.
- `put(key, value)`: Store the given `value` in the db at the given `key`.
- `delete(key)`: Mark the value at the given `key` as deleted.
- `authorize(key)`: Allow the writer with the given `key` to publish their writes to the db. (Note that `key` here specifically refers to a _public key_, unlike the `key` argument in the `get`/`put` operations.)

How exactly `get`/`put`/`delete` work is out of the scope of this guide, but if you're interested, read the [hyperdb architecture document](https://github.com/mafintosh/hyperdb/blob/master/ARCHITECTURE.md) (I'll be referring to this document throughout).

## _Source_ & _local_ feeds

There are 2 special feeds in every archive:

- _source_: the feed belonging to the owner of the db. The source feed's public key is the _db key_, which identifies the db. (This feed is stored in `/source` inside the db folder.)
- _local_: the writable feed which contains all of your own writes. (Stored in `/local` inside the db folder.)

If you own the source feed, ie. if you are the _owner_ of the db, your local feed is just the source feed, and no separate local feed directory will be created. ([source](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L584))

Feeds that belong to other writers (ie. everyone else) are read-only, since they represent other people's writes. (They are stored in `/peers/<discovery key>`.)

## How to authorize a writer to a hyperdb

To authorize a second writer to your database, you use the [`db.authorize(key, [callback])`](https://github.com/mafintosh/hyperdb/#dbauthorizekey-callback) method, like so:

```js
const hyperdb = require('hyperdb')

const db1 = hyperdb('db1-data')
db1.ready(() => {
  const db2 = hyperdb('db2-data', db1.key)
  // IMPORTANT: You need to authorize db2.local.key, NOT db2.key!
  db1.authorize(db2.local.key, err => {
    if (err) console.log(err)
    // db2 is authorized by db1 to write! :)
    // don't forget to replicate changes.
  })
})
```

**Warning:** This method unfortunately has some very subtle behavior - if you accidentally pass `db2.key` instead of `db2.local.key` to the `authorize` method, it will silently fail, and **`db2` will not be authorized**. `db2.local.key` refers to the local feed's public key, ie. the key of the feed containing the second writer's changes.

Another very common reason why writes from a different peer might not show up is that you may have forgotten to replicate the writes between the two dbs. Check out the example below for working code that shows how to do this.

## Example: authorizing a writer to a hyperdb

The [`example.js`](./example.js) file in this repo contains code that demonstrates the authorization flow in hyperdb. This code:
- creates a new hyperdb `db1`, and writes some data to it,
- creates another hyperdb `db2`, writes some data to that,
- authorizes `db2` in `db1`,
- replicates the changes from `db1` to `db2` and vice versa,
- prints the contents of all feeds in the two dbs.

To try it out yourself, download this repo and run:

```bash
npm install # if you haven't already
node example.js
```


_If you haven't got node at hand and/or are too lazy to run it yourself, just expand the **Example output** block below._

<details>
<summary>Example output</summary>

_Note that the keys won't be the same if you run this, as they are generated every time you run the script._

_You're also missing the fancy colors of the real output, just saying..._

```
===== db 1 =====
feeds: 2

feed 0 8a9a8586d53c4836862b5c853a0cec7226af17c682a083ea4447d9342bce9f28 (source) (local)

1
  key: example/first
  value: db1 was here
  deleted: false
  trie:  []
  clock: [ 2 ]
  inflate: 1
  feeds:
    - 0: 8a9a8586d53c4836862b5c853a0cec7226af17c682a083ea4447d9342bce9f28

2
  key: example/second
  value: db1 was here
  deleted: false
  trie:  [ <32 empty items>,
  [ <1 empty item>,
    [ { feed:
         '8a9a8586d53c4836862b5c853a0cec7226af17c682a083ea4447d9342bce9f28',
        seq: 1 } ] ] ]
  clock: [ 3 ]
  inflate: 1
  feeds:

3 'inflate entry'
  key: 
  value: null
  deleted: false
  trie:  [ [ <3 empty items>,
    [ { feed:
         '8a9a8586d53c4836862b5c853a0cec7226af17c682a083ea4447d9342bce9f28',
        seq: 2 } ] ] ]
  clock: [ 4, 0 ]
  inflate: 3
  feeds:
    - 0: 8a9a8586d53c4836862b5c853a0cec7226af17c682a083ea4447d9342bce9f28
    - 1: f7a57223ebf39f9dbc0afb5e505b70041d92b58ca8f85aa85fa7644677f88dff




feed 1 f7a57223ebf39f9dbc0afb5e505b70041d92b58ca8f85aa85fa7644677f88dff

1
  key: example/third
  value: db2 was here
  deleted: false
  trie:  []
  clock: [ 0, 2 ]
  inflate: 1
  feeds:
    - 0: 8a9a8586d53c4836862b5c853a0cec7226af17c682a083ea4447d9342bce9f28
    - 1: f7a57223ebf39f9dbc0afb5e505b70041d92b58ca8f85aa85fa7644677f88dff

2
  key: example/second
  value: db2 was here
  deleted: false
  trie:  [ <32 empty items>,
  [ <2 empty items>,
    [ { feed:
         'f7a57223ebf39f9dbc0afb5e505b70041d92b58ca8f85aa85fa7644677f88dff',
        seq: 1 } ] ] ]
  clock: [ 0, 3 ]
  inflate: 1
  feeds:



===== db 2 =====
feeds: 2

feed 0 8a9a8586d53c4836862b5c853a0cec7226af17c682a083ea4447d9342bce9f28 (source)

1
  key: example/first
  value: db1 was here
  deleted: false
  trie:  []
  clock: [ 2 ]
  inflate: 1
  feeds:
    - 0: 8a9a8586d53c4836862b5c853a0cec7226af17c682a083ea4447d9342bce9f28

2
  key: example/second
  value: db1 was here
  deleted: false
  trie:  [ <32 empty items>,
  [ <1 empty item>,
    [ { feed:
         '8a9a8586d53c4836862b5c853a0cec7226af17c682a083ea4447d9342bce9f28',
        seq: 1 } ] ] ]
  clock: [ 3 ]
  inflate: 1
  feeds:

3 'inflate entry'
  key: 
  value: null
  deleted: false
  trie:  [ [ <3 empty items>,
    [ { feed:
         '8a9a8586d53c4836862b5c853a0cec7226af17c682a083ea4447d9342bce9f28',
        seq: 2 } ] ] ]
  clock: [ 4, 0 ]
  inflate: 3
  feeds:
    - 0: 8a9a8586d53c4836862b5c853a0cec7226af17c682a083ea4447d9342bce9f28
    - 1: f7a57223ebf39f9dbc0afb5e505b70041d92b58ca8f85aa85fa7644677f88dff




feed 1 f7a57223ebf39f9dbc0afb5e505b70041d92b58ca8f85aa85fa7644677f88dff (local)

1
  key: example/third
  value: db2 was here
  deleted: false
  trie:  []
  clock: [ 0, 2 ]
  inflate: 1
  feeds:
    - 0: 8a9a8586d53c4836862b5c853a0cec7226af17c682a083ea4447d9342bce9f28
    - 1: f7a57223ebf39f9dbc0afb5e505b70041d92b58ca8f85aa85fa7644677f88dff

2
  key: example/second
  value: db2 was here
  deleted: false
  trie:  [ <32 empty items>,
  [ <2 empty items>,
    [ { feed:
         'f7a57223ebf39f9dbc0afb5e505b70041d92b58ca8f85aa85fa7644677f88dff',
        seq: 1 } ] ] ]
  clock: [ 0, 3 ]
  inflate: 1
  feeds:



```

</details>

The output might seem a bit overwhelming at first, but it should hopefully make sense with a bit of explanation.

For both dbs, _db 1_ and _db 2_, we iterate through their feeds. For every feed, we print the _key_, and whether it's a _source_ or _local_ feed (or neither).

For every entry in the feed, we print all of its contents.

From this data, hyperdb computes a key-value store that contains three keys:

| key | value(s) |
|-|-|
| `example/first` | `db1 was here` |
| `example/second` | `db1 was here`, `db2 was here` (a conflicting value!) |
| `example/third` | `db2 was here` |

If you ran the example app yourself, you can try out a little tool I wrote called [hyperdb-explorer](https://npm.im/hyperdb-explorer) to convince yourself that your dbs actually contains these values. Just run:

```bash
npx hyperdb-explorer data/db1/
```

This tool will list all of the keys in the db, and let you explore the contents of the nodes further. (Try it with `data/db2/` too!)

These are both just a nicer representation of the raw data that is written to the `data/` directory when you run the script. You should have two directories, `data/db1` and `data/db2`, containing several more directories, as described above. If you're comfortable with looking at binary files, check out what's in these directories.

Try playing around with the code in `example.js`. Some interesting things to look out for are:

- What happens if you create a third db, and...
  - authorize with the second db / authorize with the first db / don't authorize at all
  - replicate with the second db / replicate with the first db / don't replicate at all
- If you `put` more values into any of the dbs, what happens to the `inflate` value in the newly written nodes?
- How do the `clock` & `trie` values change when you do any of these?
  - The [architecture document](https://github.com/mafintosh/hyperdb/blob/master/ARCHITECTURE.md) has a nice description of this - this doesn't really have much to do with authorization, but this is probably the most interesting part of the data structure itself, so check it out!

Once you have a good intuition of what these values (might) mean and how they change when you play around with them, read on to get a deeper understanding of how this all works under the hood. (Or just read on anyway, nobody's gonna stop you...)

## What _actually_ happens when you authorize writers

This section goes into the nitty gritty details, down to the exact lines of code that make authorization happen. If you don't care about the details, skip to the TL;DR section below.

### Authorizing a new writer - [`HyperDB#authorize`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L288)

To authorize a feed with a given key, the user calls [`HyperDB#authorize`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L288), which does the following:
- get all the latest feed _heads_ (ie. the latest entries) using [`HyperDB#heads`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L220)
- create a new feed (stored in `peers/<discovery key>`) using [`HyperDB#_addWriter`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L470)
- [`put` an empty value](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L292) (key: `''`, value: `null`) to the db.

### Writing the update to the db - [`put`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/lib/put.js#L5)

The `put` method is quite complex (see [`lib/put.js`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/lib/put.js#L5)), because it calculates the `trie` value which maps keys to positions in the feeds. See [the architecture document](https://github.com/mafintosh/hyperdb/blob/master/ARCHITECTURE.md) if you're interested in the details.

For our purposes, all we care about is that a `put` causes some value to be [appended to the local feed](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/lib/put.js#L52). This calls [`Writer#append`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L724), which deals with encoding the messages that will be written to the feed.

### What gets written to the db - [`Writer`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L679), [`Entry`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/schema.proto#L1) & [`InflatedEntry`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/schema.proto#L10)

The [`Writer`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L679) class contains the logic related to writing messages to a single feed. There are two different types of messages: `Entry` and `InflatedEntry`. These are defined in [`schema.proto`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/schema.proto#L1), which is a [Protocol Buffer](https://developers.google.com/protocol-buffers/) schema file. Protocol Buffer (aka. "protobuf" or just "proto") is an efficient binary encoding protocol designed to be compact and easy to parse in any programming language.

The [`Entry`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/schema.proto#L1) message represents writes to the db (ie. `put`/`delete` operations), and contains all the required information, such as the `key` and `value` (see [architecture doc](https://github.com/mafintosh/hyperdb/blob/master/ARCHITECTURE.md) for details). 

Most interestingly for us, an `Entry` message also contains a field called `inflate`, which is a positive number (`uint64`). This value is a _sequence number_ in the feed: it refers to the latest `InflatedEntry` that has been written to the feed. (You can verify that this is the case by running the example above.)

The [`InflatedEntry`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/schema.proto#L10) message contains all of the same fields as an `Entry` message, but additionally contains a repeated field called `fields`. This is an array containing all the keys that are authorized to write to this db. It also contains a `contentFeed` field, which is not relevant for authorization. This refers to a separate feed containing the content for when you want to keep the content and the metadata separate. This could be useful when you are storing large values, for example when using hyperdb as a file system, eg. as a storage backend for [Dat](https://datproject.org/). (In the example app, the inflated entries are marked with `'inflated entry'`.)

The `InflatedEntry` message is used to represent a change in the set of authorized writers. Any time an entry is to be appended to the local feed, the [`Writer#append`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L724) method checks whether the entry [needs to be inflated](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L746). An entry needs to be inflated when [the number of known feeds in the database is different to the number of feeds in the latest inflated entry message](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L769) (referred to as `_feedsMessage`). Once a new entry is inflated, it will contain the latest known list of feeds. (Again, you can verify this with the example app.)

This is what happens when you call [`HyperDB#authorize`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L288): when the [empty value is `put`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L292), the fact that a new [feed was created](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L470) will cause the entry to be inflated. The inflated entry will contain the list of feeds including the new writer.

## How writers are discovered

### Starting discovery - [`HyperDB#replicate`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L297) & [`HyperDB#ready`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L565)

When you want to read data from a remote db, you need to replicate all of the feeds in the db from a peer. This happens in [`HyperDB#replicate`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L297), which calls [`hypercore#replicate`](https://github.com/mafintosh/hypercore#var-stream--feedreplicateoptions) for every feed in the list of authorized writers. The stream that is returned from [`HyperDB#replicate`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L297) implements the [hypercore protocol](https://github.com/mafintosh/hypercore-protocol), which you can pipe to another peer over any reliable stream, for example a TCP connection or a WebSocket.

When you first replicate a db, the only writer you know is the owner of the db. You know about this writer because the db key is the key of the owner's feed, the _source_ feed.

In [`HyperDB#ready`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L565), the source and local writers are set up. For both of these writers (or just the source writer, if you are the owner of the db), [`HyperDB#_writer`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L402) is called.

### Initialising writers & finding more writers - [`HyperDB#_writer`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L402)

Every writer is initialised in [`HyperDB#_writer`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L402). This method creates a hypercore feed and a `Writer` instance corresponding to that feed. A listener for each feed's ['sync' event](https://github.com/mafintosh/hypercore#feedonsync) is added, which calls the [`Writer#head`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L834) method once the feed has been completely downloaded.

[`Writer#head`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L834) retrieves the latest message from the feed using [`Writer#get`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L815). Once the head is retrieved, it is decoded in [`Writer#_decode`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L785). This calls [`Writer#_loadFeeds`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L851).

[`Writer#_loadFeeds`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L851) checks the head's `inflate` value - remember that the `inflate` number refers to the sequence number in the feed which contains the latest `InflatedEntry`, which contains a list of feeds.

If the `inflate` value is the same as the head's sequence number, then the head contains the most recent list of feeds (since it's the most recent message). If not, [`Writer#_loadFeeds`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L851) retrieves the entry in the feed at sequence number `inflate`.

Once the latest inflated entry is found, [`Writer#_addWriters`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L873) is called, which calls [`HyperDB#_addWriter`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L470) for every feed in the list of feeds.

[`HyperDB#_addWriter`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L470) creates a new hypercore feed using [`HyperDB#_writer`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L472), stores it in `peers/<discovery key>`, and pushes this to the list of known writers. We already came across [`HyperDB#_writer`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L472) above: the cycle is repeated for the newly found writers - for every feed, we find the latest inflated message, look at the list of feeds in it, and add the new feeds as writers.

Once all that is [done](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L886), [`Writer#_updateFeeds`](https://github.com/mafintosh/hyperdb/blob/19d01e52376a862674c7576539db0d0cbb4a23f5/index.js#L937) is called, which just sets up a bunch of state.

## TL;DR

- A HyperDB db is made of several hypercore feeds, each containing the changes from a single writer.
- These feeds contain _entries_, which represent writes to the database, and _inflated entries_, which represent changes to the list of writers (feeds) in the db.
- Every entry in the feed contains a pointer to the latest inflated entry, so that all of the writers in the db can be efficiently discovered.
- When initialising the db or replicating changes, additional writers are discovered by looking up the list of feeds in the latest inflated entry in every known feed.

## Discussion

If you've made it this far, you now know exactly how authorization currently works in hyperdb. HyperDB is a fantastic data structure which will most likely form the backbone of the [forthcoming collaborative features in Dat](https://github.com/datproject/planning).

One thing you may have noticed is that there is currently no way to revoke authorization, or to enforce any kind of access control on the values in the database, for example marking certain keys as read-only. Various solutions for this are currently being discussed in the community, and I hope that this guide can help spread some understanding of what currently exists, and how things could be improved.

Efforts are currently also under way to port the Dat ecosystem to different languages, for example [Rust](https://github.com/datrs). There is still a lot of foundational work to be done before [a Rust port of hyperdb](https://github.com/datrs/hyperdb) can be tackled, but understanding the current logic should hopefully make the porting task much simpler.

Writing this guide massively improved my understanding of how hyperdb works - I hope that reading it improves yours!