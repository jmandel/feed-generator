import { BskyAgent } from '@atproto/api'
import { Database } from './db'
import { DidResolver } from '@atproto/did-resolver'

export type AppContext = {
  db: Database
  didResolver: DidResolver
  cfg: Config,
  agent: BskyAgent
}

export type Config = {
  port: number
  listenhost: string
  hostname: string
  sqliteLocation: string
  subscriptionEndpoint: string
  serviceDid: string
  publisherDid: string
}
