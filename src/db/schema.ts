export type DatabaseSchema = {
  post: Post
  sub_state: SubState,
  gptfeed_user: GptFeedUser,
  gptfeed_post: GptFeedPost
}

export type Post = {
  uri: string
  cid: string
  replyParent: string | null
  replyRoot: string | null
  indexedAt: string
}

export type SubState = {
  service: string
  cursor: number
}

export type GptFeedUser = {
  uri: string,
  description: string,
  descriptionIndexed: string | null,
  keywords: string | null
}
export type GptFeedPost = {
  uri: string,
  cid: string,
  feedUser: string,
  indexedAt: string,
}