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

function base64UrlToBase64(base64Url: string): string {
  return base64Url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - base64Url.length % 4) % 4);
}

function decodeJwt(token: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('The token is invalid');
  }

  const payload = parts[1];
  const base64 = base64UrlToBase64(payload);
  const json = atob(base64);

  return JSON.parse(json);
}

export default function (server: Server, ctx: AppContext) {
  server.app.bsky.feed.getFeedSkeleton(async ({ params, req }) => {

    const token =  req.headers.authorization?.split(" ")[1]!;
    const decoded = decodeJwt(token);
    const userUri = decoded.iss as string;

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
    console.log("Feed for", userUri)
    registerUser(ctx.agent, ctx.db, userUri)
    const body = await algo(ctx, params, userUri)
    return {
      encoding: 'application/json',
      body: body,
    }
  })
}
