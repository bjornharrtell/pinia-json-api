import { describe, expect, test, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { definePiniaDataStore, hasMany, model, Model } from '../src/pinia-data'

setActivePinia(createPinia())

@model('tag')
export class Tag extends Model {
  name?: string
}

@model('dataset')
export class Dataset extends Model {
  title?: string
  description?: string
  @hasMany(Tag) tags: Tag[] = []
}

const usePiniaDataStore = definePiniaDataStore('pinia-data', {
  endpoint: 'https://datakatalog.miljoeportal.dk/api',
  models: [Dataset]
})

describe('Pinia Data Store', () => {
  beforeEach(() => {
    const { unloadAll } = usePiniaDataStore()
    unloadAll()
  })

  test('get all datasets', async () => {
    const { findAll, findRelated } = usePiniaDataStore()
    const datasets = await findAll(Dataset, { fields: { dataset: ['title', 'tags'] }, page: { size: 1 }, include: ['tags'] })
    console.log(datasets)
    console.log(datasets[0].tags)
  })
})
