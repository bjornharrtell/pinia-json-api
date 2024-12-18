import { describe, expect, test, beforeEach } from 'vitest'
import { useArticlesStore, Article, Person } from '../src/articles'
import { createPinia, setActivePinia } from 'pinia'

setActivePinia(createPinia())

describe('Pinia Data Store', () => {
  beforeEach(() => {
    const { unloadAll } = useArticlesStore()
    unloadAll()
  })

  test('roundtrip record', async () => {
    const { createRecord, findRecord } = useArticlesStore()
    const person = createRecord(Person, { firstName: 'test' })
    const foundPerson = await findRecord(Person, person.id)
    expect(foundPerson.id).toBe(person.id)
    expect(foundPerson.firstName).toBe(person.firstName)
  })

  test('single record fetch', async () => {
    const { findRecord, findRelated } = useArticlesStore()
    const article = await findRecord(Article, '1')
    expect(article.id).toBe('1')
    expect(article.title).toBe('JSON:API paints my bikeshed!')
    //await findRelated(article, 'comments')
    expect(article.comments.length).toBe(2)
    expect(article.comments[0].body).toBe('First!')
    expect(article.comments[1].body).toBe('I like XML better')
  })

  test('all records fetch', async () => {
    const { findAll, findRelated } = useArticlesStore()
    const articles = await findAll(Article)
    expect(articles.length).toBe(1)
    const article = articles[0]
    expect(article.id).toBe('1')
    expect(article.title).toBe('JSON:API paints my bikeshed!')
    //await findRelated(article, 'comments')
    expect(article.comments.length).toBe(2)
    expect(article.comments[0].body).toBe('First!')
    expect(article.comments[1].body).toBe('I like XML better')
    //await findRelated(article, 'author')
    expect(article.author?.firstName).toBe('Dan')
  })
})
