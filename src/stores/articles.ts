import { definePiniaDataStore } from '../pinia-data'
import { JsonApiFetcherArticles, Article, Comment, Person } from '../../tests/articles'

const models = [Person, Comment, Article]

export const useArticlesStore = definePiniaDataStore(
  'articles',
  { endpoint: 'http://localhost:3000', models },
  new JsonApiFetcherArticles(),
)

export { Person, Comment, Article }