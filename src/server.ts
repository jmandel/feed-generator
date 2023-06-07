import http from 'http'
import events from 'events'
import express from 'express'
import { DidResolver, MemoryCache } from '@atproto/did-resolver'
import { createServer } from './lexicon'
import feedGeneration from './methods/feed-generation'
import describeGenerator from './methods/describe-generator'
import { createDb, Database, migrateToLatest } from './db'
import { FirehoseSubscription } from './subscription'
import { AppContext, Config } from './config'
import wellKnown from './well-known'

import {
  type FormData as FormDataType,
  type Headers as HeadersType,
  type Request as RequestType,
  type Response as ResponseType,
  type RequestInit as RequestInitType,
  type RequestInfo as RequestInfoType,
} from 'undici'
import { BskyAgent } from '@atproto/api'

declare global {
  export const { fetch }: typeof import('undici')
  type FormData = FormDataType
  type Headers = HeadersType
  type Request = RequestType
  type Response = ResponseType
  type RequestInit = RequestInitType
  type RequestInfo = RequestInfoType
}

class RateLimiter {
  private tokens: number
  private last: number
  private readonly capacity: number
  private readonly refillTime: number

  constructor(capacity: number, perSecond: number) {
    this.tokens = capacity
    this.capacity = capacity
    this.refillTime = 1000 / perSecond
    this.last = Date.now()
  }

  augment() {
    const now = Date.now()
    const deltaTime = now - this.last
    this.last = now

    const tokensToAdd = deltaTime / this.refillTime
    this.tokens = Math.min(this.tokens + tokensToAdd, this.capacity)
  }

  async consume(): Promise<void> {
    this.augment()
    if (this.tokens < 1) {
      await new Promise((resolve) => setTimeout(resolve, this.refillTime))
      return this.consume()
    }

    this.tokens -= 1
  }
}

const rateLimitedFetch = <I extends unknown[], O>(
  fn: (...I) => Promise<O>,
  {
    maxSimultaneous,
    maxPerSecond,
  }: { maxSimultaneous: number; maxPerSecond: number },
) => {
  const limiter = new RateLimiter(1, maxPerSecond)
  const pendingFetches = new Set<Promise<any>>()

  return async (...input: I): Promise<O> => {
    while (pendingFetches.size >= maxSimultaneous) {
      const firstResolved = await Promise.race(pendingFetches)
      pendingFetches.delete(firstResolved)
    }

    await limiter.consume()

    const fetchPromise = fn(...input)
    pendingFetches.add(fetchPromise)

    const response = await fetchPromise
    pendingFetches.delete(fetchPromise)

    return response
  }
}

const oapiFetch = rateLimitedFetch(fetch, {
  maxSimultaneous: 3,
  maxPerSecond: 10,
})

async function generateKeywords(description: string): Promise<string[]> {
  let r = await oapiFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + process.env["OPENAI_API_KEY"]!,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'system',
          content:
            'You are an assistant that helps understand user preferences.',
        },
        {
          role: 'user',
          content:
            "## Task\n\nAct as the intelligence inside of a custom feed algorithm for social media. You will receive a user's profile and an example post, and you'll output a bullet list of words and phrases that can be used with exact string matching (.match//i)  to identify messages relevant to this user's interest. Do not output phrases that are unlikely to occur in real posts, we are only interested in identifying real posts. Do not output very common words that would fail to be good selectors.",
        },
        {
          role: 'user',
          content:
            'User: CEO of Bluesky, steward of AT Protocol. Let’s build a federated republic, starting with this server. Nature, knowledge, technology. I like to think of a cybernetic forest. 🌱 🪴 🌳 ',
        },
        {
          role: 'assistant',
          content:
            'Bluesky\nAT Protocol\nFederated republic\nCybernetic\nDigital stewardship\nServer management\nFederated system\nTechnology trend\nKnowledge sharing\nCybernetics\nFuture of tech\nSustainable tech\nGreen tech\nInnovation\nDecentralized network\nDigital governance\nDigital ecosystems\nTech leadership',
        },
        {
          role: 'user',
          content: 'User: ' + description,
        },
      ],
      temperature: 0,
      max_tokens: 256,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      model: 'gpt-3.5-turbo',
    }),
  })

  console.log(r)
  let rj: any = await r.json()
  console.log(rj)
  // return []
  return rj.choices[0].message.content.toLocaleLowerCase().split('\n').filter(l => l.length > 2)
}

export class FeedGenerator {
  public app: express.Application
  public server?: http.Server
  public db: Database
  public firehose: FirehoseSubscription
  public cfg: Config

  constructor(
    app: express.Application,
    db: Database,
    public agent: BskyAgent,
    firehose: FirehoseSubscription,
    cfg: Config,
  ) {
    this.app = app
    this.db = db
    this.firehose = firehose
    this.cfg = cfg
  }

  static create(cfg: Config) {
    const app = express()
    const db = createDb(cfg.sqliteLocation)

    const didCache = new MemoryCache()
    const didResolver = new DidResolver(
      { plcUrl: 'https://plc.directory' },
      didCache,
    )

    const server = createServer({
      validateResponse: true,
      payload: {
        jsonLimit: 100 * 1024, // 100kb
        textLimit: 100 * 1024, // 100kb
        blobLimit: 5 * 1024 * 1024, // 5mb
      },
    })
    const agent = new BskyAgent({ service: 'https://bsky.social' });
    const ctx: AppContext = {
      db,
      didResolver,
      cfg,
      agent 
    }

    const firehose = new FirehoseSubscription(db, cfg.subscriptionEndpoint, ctx)
    feedGeneration(server, ctx)
    describeGenerator(server, ctx)
    app.use(server.xrpc.router)
    app.use(wellKnown(ctx))

    return new FeedGenerator(app, db, agent, firehose, cfg)
  }

  async start(): Promise<http.Server> {
    await migrateToLatest(this.db)
    await this.agent.login({identifier: process.env["BSKY_USERNAME"]!, password: process.env["BSKY_PASSWORD"]!})
    this.firehose.run()
    this.server = this.app.listen(this.cfg.port, this.cfg.listenhost)
    await events.once(this.server, 'listening')

    let db = this.db;
    (async function () {
      while (true) {
        const q = await db
          .selectFrom('gptfeed_user')
          .selectAll()
          .whereRef('description', 'is not', 'descriptionIndexed')
          .execute()
        for await (const u of q) {
          console.log('mismatch', u, u.description, u.uri)
          const kws = await generateKeywords(u.description)
          await db
            .updateTable('gptfeed_user')
            .set({ descriptionIndexed: u.description, keywords: kws.join("\n") })
            .where('uri', '=', u.uri)
            .execute()
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    })()

    return this.server
  }
}

export default FeedGenerator
