import { AppContext } from './config';
import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'

import { cborToLexRecord, readCar } from '@atproto/repo'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {

   if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)

    // This logs the text of every post off the firehose.
    // Just for fun :)
    // Delete before actually using
    for (const post of ops.posts.creates) {
      // console.log("post", JSON.stringify(post, null, 2))
    }

    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      // .filter((create) => {
        // only alf-related posts
        // return create.record.text.toLowerCase().includes('alf')
      // })
      .map((create) => {
        // map alf-related posts to a db row
        return {
          text: create.record.text.toLowerCase(),
          uri: create.uri,
          cid: create.cid,
          replyParent: create.record?.reply?.parent.uri ?? null,
          replyRoot: create.record?.reply?.root.uri ?? null,
          indexedAt: new Date().toISOString(),
        }
      })

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
    if (postsToCreate.length > 0) {
    // try {
    //   const cbor = (await readCar(evt.blocks as Uint8Array)).blocks.get(evt?.ops?.[0]?.cid as any) as Uint8Array;
    //   const js = cborToLexRecord(cbor);
    //   const jstext = JSON.stringify(js).toLowerCase();
    // } catch {}
    const usersKws = await this.db.selectFrom("gptfeed_user").select("uri").select("keywords").where("gptfeed_user.keywords", "is not", null).execute();
    for (const post of postsToCreate) {
      for (const ukw of usersKws) {
        let kw = ukw.keywords!.split("\n");
        if (kw.some(f => f.split(/\s+/).every(s => post.text.includes(s.toLocaleLowerCase())))) {
          console.log("Match for user", ukw);

          await this.db
            .insertInto('gptfeed_post')
            .values([{cid: post.cid, feedUser: ukw.uri, indexedAt: post.indexedAt, uri: post.uri}])
            .execute()

          // let p = await agent.getProfile({actor: evt.repo as string});
          // console.log("Details", p.data.description)
        } 
      }


    }
      // await this.db
      //   .insertInto('post')
      //   .values(postsToCreate)
      //   .onConflict((oc) => oc.doNothing())
      //   .execute()
    }
  }
}
