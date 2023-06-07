import { InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../lexicon'
import { AppContext } from '../config'
import algos from '../algos'
import { validateAuth } from '../auth'
import { AtUri } from '@atproto/uri'

async function registerUser(agent: AppContext["agent"], db: AppContext["db"], uri: string) {
    let p = await agent.getProfile({ actor: uri})
  console.log("Register", uri, p.data.description)
    await db
      .insertInto('gptfeed_user')
      .values([{ description: p.data.description!, uri: uri }])
      .onConflict(conflict => conflict.column("uri").doUpdateSet({description: p.data.description}))
      .execute()
}

export default function (server: Server, ctx: AppContext) {
  server.app.bsky.feed.getFeedSkeleton(async ({ params, req }) => {

    const feedUri = new AtUri(params.feed)
    const algo = algos[feedUri.rkey]
    if (
      feedUri.hostname !== ctx.cfg.publisherDid ||
      feedUri.collection !== 'app.bsky.feed.generator' ||
      !algo
    ) {
      throw new InvalidRequestError(
        'Unsupported algorithm',
        'UnsupportedAlgorithm',
      )
    }
    /**
     * Example of how to check auth if giving user-specific results:
     *
     * const requesterDid = await validateAuth(
     *   req,
     *   ctx.cfg.serviceDid,
     *   ctx.didResolver,
     * )
     */
    console.log("Feed for", feedUri)
    registerUser(ctx.agent, ctx.db, feedUri.hostname)
    const body = await algo(ctx, params, feedUri.hostname)
    return {
      encoding: 'application/json',
      body: body,
    }
  })
}
