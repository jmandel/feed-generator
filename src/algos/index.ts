import { AppContext } from '../config'
import {
  QueryParams,
  OutputSchema as AlgoOutput,
} from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import * as gptFeed from './gptfeed'

type AlgoHandler = (ctx: AppContext, params: QueryParams, userUri: string) => Promise<AlgoOutput>

const algos: Record<string, AlgoHandler> = {
  [gptFeed.shortname]: gptFeed.handler,
}

export default algos
