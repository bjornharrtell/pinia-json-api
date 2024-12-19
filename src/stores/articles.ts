import { belongsTo, definePiniaJsonApiStore, hasMany, model, Model } from '../pinia-json-api'
import type { JsonApiDocument, JsonApiResource, JsonApiResourceIdentifier } from '../json-api'
import type { JsonApiFetcher } from '../json-api-fetcher'
import doc from './articles.json'

export class JsonApiFetcherArticles implements JsonApiFetcher {
  doc: JsonApiDocument
  articles: JsonApiResource[]
  included: JsonApiResource[]
  constructor() {
    this.doc = doc as JsonApiDocument
    this.articles = this.doc.data as JsonApiResource[]
    this.included = this.doc.included as JsonApiResource[]
  }
  async fetchDocument(_type: string, id?: string): Promise<JsonApiDocument> {
    if (id)
      return {
        data: this.articles.find((a) => a.id === id)!,
        included: this.included,
      }
    return this.doc
  }
  async fetchAll(_type: string): Promise<JsonApiResource[]> {
    return this.articles
  }
  async fetchOne(_type: string, id: string): Promise<JsonApiResource> {
    const article = this.articles.find((a) => a.id === id)
    if (!article) throw new Error(`Article ${id} not found`) 
    return article
  }
  async fetchHasMany(_type: string, id: string, name: string) {
    const article = this.articles.find((a) => a.id === id)
    if (!article) throw new Error(`Article ${id} not found`)
    const relationship = article.relationships[name]
    const findIncluded = (rid: JsonApiResourceIdentifier) => {
      const resource = this.included.find((i) => i.id === rid.id)
      if (!resource) throw new Error(`Resource ${id} not found`)
      return resource
    }
    const rids = relationship.data as JsonApiResourceIdentifier[]
    const related = rids.map(findIncluded)
    return { data: related } as JsonApiDocument
  }
  async fetchBelongsTo(type: string, id: string, name: string) {
    if (type !== 'article') throw new Error(`Type ${type} not supported`)
    const article = this.articles.find((a) => a.id === id)
    if (!article) throw new Error(`Article ${id} not found`)
    const relationship = article.relationships[name]
    const findIncluded = (rid: JsonApiResourceIdentifier) => {
      const resource = this.included.find((i) => i.id === rid.id)
      if (!resource) throw new Error(`Resource ${id} not found`)
      return resource
    }
    const rid = relationship.data as JsonApiResourceIdentifier
    const related = findIncluded(rid)
    return { data: related } as JsonApiDocument
  }
}

@model('person')
export class Person extends Model {
  firstName?: string
  lastName?: string
  twitter?: string
}

@model('comment')
export class Comment extends Model {
  body?: string
}

@model('article')
export class Article extends Model {
  title?: string
  @belongsTo(Person) author: Person | null = null
  @hasMany(Comment) comments: Comment[] = []
}

export const useArticlesStore = definePiniaJsonApiStore(
  'articles',
  { endpoint: 'http://localhost:3000', models: [Person, Comment, Article] },
  new JsonApiFetcherArticles(),
)