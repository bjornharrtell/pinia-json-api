import { readFileSync } from 'fs'
import {
  Model,
  hasMany,
  model
} from '../src/pinia-data'
import { JsonApiDocument, JsonApiResource, JsonApiResourceIdentifier } from '../src/json-api'
import { JsonApiFetcher } from '../src/json-api-fetcher'

export class JsonApiFetcherArticles implements JsonApiFetcher {
  doc: JsonApiDocument
  articles: JsonApiResource[]
  included: JsonApiResource[]
  constructor() {
    this.doc = JSON.parse(readFileSync('tests/articles.json', 'utf-8')) as JsonApiDocument
    this.articles = this.doc.data as JsonApiResource[]
    this.included = this.doc.included as JsonApiResource[]
  }
  async fetchAll(type: string): Promise<JsonApiResource[]> {
    if (type !== 'article') throw new Error(`Type ${type} not supported`)
    return this.articles
  }
  async fetchOne(type: string, id: string): Promise<JsonApiResource> {
    if (type !== 'article') throw new Error(`Type ${type} not supported`)
    const article = this.articles.find((a) => a.id === id)
    if (!article) throw new Error(`Article ${id} not found`)
    return article
  }
  async fetchRelated(type: string, id: string, name: string): Promise<JsonApiResource[]> {
    if (type !== 'article') throw new Error(`Type ${type} not supported`)
    const article = this.articles.find((a) => a.id === id)
    if (!article) throw new Error(`Article ${id} not found`)
    const relationship = article.relationships[name]
    if (!relationship) throw new Error(`Relationship ${name} not found`)
    if (!relationship.data) throw new Error(`Relationship data unexpectedly null`)
    const findIncluded = (rid: JsonApiResourceIdentifier) => {
      const resource = this.included.find((i) => i.id === rid.id)
      if (!resource) throw new Error(`Resource ${id} not found`)
      return resource
    }
    const rids = relationship.data as JsonApiResourceIdentifier[]
    const related = rids.map(findIncluded)
    return related
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
  author: Person | null = null
  @hasMany(Comment)
  comments: Comment[] = []
}
