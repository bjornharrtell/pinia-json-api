import { describe, expect, test, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { definePiniaDataStore, Model } from '../src/pinia-data'

setActivePinia(createPinia())

const usePiniaDataStore = definePiniaDataStore('pinia-data', {
  endpoint: 'https://datakatalog.miljoeportal.dk/api'
})

const { model, hasMany, belongsTo } = usePiniaDataStore()

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

describe('Pinia Data Store', () => {
  beforeEach(() => {
    const { unloadAll } = usePiniaDataStore()
    unloadAll()
  })

  test('get all datasets', async () => {
    const { findAll, findRelated } = usePiniaDataStore()
    const datasets = await findAll(Dataset, { fields: { dataset: ['title'] } })
    await findRelated(datasets[0], 'tags')
    console.log(datasets[0])
    console.log(datasets[0].tags)
  })
})
