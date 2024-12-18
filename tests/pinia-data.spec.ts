import { describe, expect, test, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { definePiniaDataStore } from '../src/pinia-data'
import { Article, Comment, Person, JsonApiFetcherArticles } from './articles'

setActivePinia(createPinia())

const models = [Person, Comment, Article]

const usePiniaDataStore = definePiniaDataStore(
  'pinia-data',
  { endpoint: 'http://localhost:3000', models },
  new JsonApiFetcherArticles(),
)

describe('Pinia Data Store', () => {
  beforeEach(() => {
    const { unloadAll } = usePiniaDataStore()
    unloadAll()
  })

  test('roundtrip record', async () => {
    const { createRecord, findRecord } = usePiniaDataStore()
    const person = createRecord(Person, { firstName: 'test' })
    const foundPerson = await findRecord(Person, person.id)
    expect(foundPerson.id).toBe(person.id)
    expect(foundPerson.firstName).toBe(person.firstName)
  })

  test('single record fetch', async () => {
    const { findRecord, findRelated } = usePiniaDataStore()
    const article = await findRecord(Article, '1')
    expect(article.id).toBe('1')
    expect(article.title).toBe('JSON:API paints my bikeshed!')
    await findRelated(article, 'comments')
    expect(article.comments.length).toBe(2)
    expect(article.comments[0].body).toBe('First!')
    expect(article.comments[1].body).toBe('I like XML better')
  })

  test('all records fetch', async () => {
    const { findAll, findRelated } = usePiniaDataStore()
    const articles = await findAll(Article)
    expect(articles.length).toBe(1)
    const article = articles[0]
    expect(article.id).toBe('1')
    expect(article.title).toBe('JSON:API paints my bikeshed!')
    await findRelated(article, 'comments')
    expect(article.comments.length).toBe(2)
    expect(article.comments[0].body).toBe('First!')
    expect(article.comments[1].body).toBe('I like XML better')
  })
})
