import { definePiniaDataStore, Model, hasMany, model } from '../pinia-data'

@model('tag')
class Tag extends Model {
  name?: string
}

@model('dataset')
class Dataset extends Model {
  title?: string
  description?: string
  @hasMany(Tag)
  tags: Tag[] = []
}

const models = [Dataset, Tag]

export const useDatakatStore = definePiniaDataStore('pinia-data', {
  endpoint: 'https://datakatalog.miljoeportal.dk/api',
  models,
})

export { Dataset, Tag }
