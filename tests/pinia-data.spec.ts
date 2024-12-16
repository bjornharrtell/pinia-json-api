import { describe, expect, test, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { setActivePinia, createPinia } from 'pinia'
import {
  definePiniaDataStore,
  JsonApiDocument,
  JsonApiFetcher,
  JsonApiResource,
  JsonApiResourceIdentifier,
  Model,
  ModelDefinition,
  AsyncMany,
  AsyncSingle,
} from '../src/pinia-data'

setActivePinia(createPinia())

class JsonApiFetcherMock implements JsonApiFetcher {
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

class Article extends Model {
  title!: string
  author!: AsyncSingle<Person>
  comments!: AsyncMany<Comment>
}
class Person extends Model {
  firstName!: string
  lastName!: string
  twitter!: string
}
class Comment extends Model {
  body!: string
}

const modelDefinitions: ModelDefinition[] = [
  {
    type: 'article',
    ctor: Article,
    hasMany: new Map([['comments', 'comment']]),
    belongsTo: new Map([['author', 'person']]),
  },
  {
    type: 'person',
    ctor: Person,
    hasMany: new Map(),
    belongsTo: new Map(),
  },
  {
    type: 'comment',
    ctor: Comment,
    hasMany: new Map(),
    belongsTo: new Map(),
  },
]

const usePiniaDataStore = definePiniaDataStore(
  'pinia-data',
  { endpoint: 'http://localhost:3000', modelDefinitions },
  new JsonApiFetcherMock(),
)

describe('Pinia Data Store', () => {
  beforeEach(() => {
    const { unloadAll } = usePiniaDataStore()
    unloadAll()
  })

  test('roundtrip record', async () => {
    const { createRecord, findRecord } = usePiniaDataStore()
    const person = createRecord<Person>('person', { firstName: 'test' })
    const foundPerson = await findRecord<Person>('person', person.id)
    expect(foundPerson.id).toBe(person.id)
    expect(foundPerson.firstName).toBe(person.firstName)
  })

  test('single record fetch', async () => {
    const { findRecord } = usePiniaDataStore()
    const article = await findRecord<Article>('article', '1')
    expect(article.id).toBe('1')
    expect(article.title).toBe('JSON:API paints my bikeshed!')
    const comments = await article.comments.load()
    expect(comments.value.length).toBe(2)
    expect(comments.value[0].body).toBe('First!')
    expect(comments.value[1].body).toBe('I like XML better')
  })

  test('all records fetch', async () => {
    const { findAll } = usePiniaDataStore()
    const articles = findAll<Article>('article')
    await articles.load()
    expect(articles.data.value.length).toBe(1)
    const article = articles.data.value[0]
    expect(article.id).toBe('1')
    expect(article.title).toBe('JSON:API paints my bikeshed!')
    await article.comments.load()
    expect(article.comments.data.value.length).toBe(2)
    expect(article.comments.data.value[0].body).toBe('First!')
    expect(article.comments.data.value[1].body).toBe('I like XML better')
  })
})
