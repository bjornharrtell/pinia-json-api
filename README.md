# pinia-data

Pinia Data extends Pinia Store with capabilities to fetch typed data models via an JSON:API endpoint into record instances.

A Pinia Data Store is defined with an endpoint and model definitions and the store instance API provides methods `findAll`, `findRecord` to fetch record(s). Pinia Store will automatically resolve included relationships. If relationships for a record are not included they can be fetched later using `findRelated`.

## Example usage

A service returning the canonical example JSON:API document at https://jsonapi.org/ can be consumed by a store defined in this way:

```ts
import { definePiniaDataStore, Model, model, belongsTo, hasMany } from 'pinia-data'

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

export const useArticlesStore = definePiniaDataStore('articles', {
  endpoint: 'http://localhost/api',
  models: [Person, Comment, Article]
})
```

The above store can then be used as follows:

```ts
import { useArticlesStore } from './stores/articles'
const { findAll } = useArticlesStore()
const articles = await findAll(Article, { include: ['comments', 'author'] })
expect(articles.length).toBe(1)
const article = articles[0]
expect(article.id).toBe('1')
expect(article.title).toBe('JSON:API paints my bikeshed!')
expect(article.comments.length).toBe(2)
expect(article.comments[0].body).toBe('First!')
expect(article.comments[1].body).toBe('I like XML better')
expect(article.author?.firstName).toBe('Dan')
```