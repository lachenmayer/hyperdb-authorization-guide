# hyperdb-auth-experiments

The goal of this repo is to discover how hyperdb authorization works.

The [hyperdb architecture document](https://github.com/mafintosh/hyperdb/blob/master/ARCHITECTURE.md) states the following:

> The set of hypercores are _authorized_ in that the original author of the first hypercore in a hyperdb must explicitly denote in their append-only log that the public key of a new hypercore is permitted to edit the database. Any authorized member may authorize more members. There is no revocation or other author management elements currently.

I want to answer the following questions:

1. How are authorization messages stored?
2. How are new feeds belonging to other writers discovered?
3. How could revocation potentially work?
