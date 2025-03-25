import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test } from 'vitest'
import { Model, type ModelDefinition, RelationshipType, definePiniaJsonApiStore } from '../src/pinia-json-api'

setActivePinia(createPinia())

class Tag extends Model {
  name?: string
}

class WmsSource extends Model {
  url?: string
  layer?: string
}

class Dataset extends Model {
  title?: string
  description?: string
  tags: Tag[] = []
  wmsSource: WmsSource | null = null
  related: Dataset[] = []
}

const modelDefinitions: ModelDefinition[] = [
  {
    type: 'tags',
    ctor: Tag,
  },
  {
    type: 'wmsSources',
    ctor: WmsSource,
  },
  {
    type: 'datasets',
    ctor: Dataset,
    rels: {
      tags: { ctor: Tag, type: RelationshipType.HasMany },
      related: { ctor: Dataset, type: RelationshipType.HasMany },
      wmsSource: { ctor: WmsSource, type: RelationshipType.BelongsTo },
    },
  },
]

const usePiniaJsonApiStore = definePiniaJsonApiStore('datakatalog', {
  endpoint: 'https://datakatalog.miljoeportal.dk/api',
  modelDefinitions,
})

describe('PiniaJsonApiStore Datakatalog', () => {
  test('get all datasets', async () => {
    const { findAll, findRelated } = usePiniaJsonApiStore()
    const { records: datasets } = await findAll(Dataset, {
      fields: { datasets: ['title', 'tags', 'wmsSource', 'related'] },
      page: { size: 10 },
      include: ['tags', 'wmsSource', 'related'],
    })
    expect(datasets[8].related[3]).toBeDefined()
    //console.log(datasets[8])
    //console.log(datasets[0].tags)
  })
})
