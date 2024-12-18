import { defineStore } from 'pinia'
import { type ComputedRef, shallowReactive } from 'vue'
import { JsonApiFetcherImpl, type FetchOptions, type JsonApiFetcher } from './json-api-fetcher'

export class Model {
  constructor(public id: string) {
    this.id = id
  }
  [key: string]: any
}

export interface PiniaDataStoreConfig {
  endpoint: string
  state?: ComputedRef<{ token: string }>
}

export interface FindOptions extends FetchOptions {}

export function definePiniaDataStore(name: string, config: PiniaDataStoreConfig, fetcher?: JsonApiFetcher) {
  if (!fetcher) fetcher = new JsonApiFetcherImpl(config.endpoint, config.state)

  const recordsByType = shallowReactive(new Map<string, Map<string, Model>>())
  const modelRegistry = shallowReactive(new Map<typeof Model, string>())
  const hasManyRegistry = shallowReactive(new Map<typeof Model, Map<string, typeof Model>>())
  const belongsToRegistry = shallowReactive(new Map<typeof Model, Map<string, typeof Model>>())

  function model(type: string) {
    return function (value: typeof Model) {
      modelRegistry.set(value, type)
      recordsByType.set(type, new Map<string, Model>())
    }
  }

  function hasMany(ctor: typeof Model) {
    return function (_target: undefined, context: ClassFieldDecoratorContext) {
      let isRegistred = false
      return function (this: any): any {
        if (isRegistred) return
        hasManyRegistry.set(this.constructor as typeof Model, new Map([[context.name as string, ctor]]))
        isRegistred = true
      }
    }
  }

  function belongsTo(ctor: typeof Model) {
    return function (_target: undefined, context: ClassFieldDecoratorContext) {
      let isRegistred = false
      return function (this: any): any {
        if (isRegistred) return
        belongsToRegistry.set(this.constructor as typeof Model, new Map([[context.name as string, ctor]]))
        isRegistred = true
      }
    }
  }

  function generateId(): string {
    return Math.random().toString(36).substr(2, 9)
  }

  function createRecord<T extends typeof Model>(ctor: T, properties: Partial<InstanceType<T>> & { id?: string }) {
    const type = modelRegistry.get(ctor)
    if (!type) throw new Error(`Model ${type} not defined`)
    const id = properties.id || generateId()
    return internalCreateRecord(ctor, id, properties) as InstanceType<T>
  }

  function internalCreateRecord<T extends typeof Model>(ctor: T, id: string, properties?: Partial<InstanceType<T>>) {
    const type = modelRegistry.get(ctor)
    if (!type) throw new Error(`Model ${type} not defined`)
    const recordMap = recordsByType.get(type)
    if (!recordMap) throw new Error(`Model ${type} not defined`)
    let record = recordMap.get(id)
    if (!record) record = shallowReactive<InstanceType<T>>(new ctor(id) as InstanceType<T>)
    if (properties) for (const [key, value] of Object.entries(properties)) if (value !== undefined) record[key] = value
    recordMap.set(id, record)
    return record as InstanceType<T>
  }

  async function findAll<T extends typeof Model>(ctor: T, options?: FindOptions) {
    const type = modelRegistry.get(ctor)
    if (!type) throw new Error(`Model ${ctor.name} not defined`)
    const related = await fetcher!.fetchAll(type, options)
    const records = related.map((r) => internalCreateRecord<T>(ctor, r.id, r.attributes as Partial<InstanceType<T>>))
    return records as InstanceType<T>[]
  }

  async function findRecord<T extends typeof Model>(ctor: T, id: string) {
    const type = modelRegistry.get(ctor)
    if (!type) throw new Error(`Model ${ctor.name} not defined`)
    const records = recordsByType.get(type)
    if (!records) throw new Error(`Model with name ${type} not defined`)
    if (!records.has(id)) {
      const resource = await fetcher!.fetchOne(type, id)
      const newRecord = internalCreateRecord<T>(ctor, id, resource.attributes as Partial<InstanceType<T>>)
      records.set(id, newRecord)
    }
    const record = records.get(id)
    if (!record) throw new Error(`Record with id ${id} not found`)
    return record as InstanceType<T>
  }

  async function findRelated(record: Model, name: string) {
    const ctor = record.constructor as typeof Model
    const type = modelRegistry.get(ctor)
    if (!type) throw new Error(`Model ${record.constructor.name} not defined`)
    if (hasManyRegistry.has(ctor) && hasManyRegistry.get(ctor)!.has(name)) {
      const relCtor = hasManyRegistry.get(ctor)!.get(name)!
      const related = await fetcher!.fetchHasMany(type, record.id, name)
      const relatedRecords = related.map((r) => internalCreateRecord(relCtor, r.id, r.attributes))
      record[name] = relatedRecords
    } else if (belongsToRegistry.has(ctor) && belongsToRegistry.get(ctor)!.has(name)) {
      const relCtor = belongsToRegistry.get(ctor)!.get(name)!
      const related = await fetcher!.fetchBelongsTo(type, record.id, name)
      const relatedRecord = internalCreateRecord(relCtor, related.id, related.attributes)
      record[name] = relatedRecord
    } else {
      throw new Error(`Model ${record.constructor.name} has no relations`)
    }
  }

  function unloadAll() {
    for (const records of recordsByType.values()) records.clear()
  }

  return defineStore(name, () => {
    return {
      recordsByType,
      modelRegistry,
      hasManyRegistry,
      belongsToRegistry,
      model,
      hasMany,
      belongsTo,
      createRecord,
      findAll,
      findRecord,
      findRelated,
      unloadAll,
    }
  })
}

export type PiniaApiStoreDefinition = ReturnType<typeof definePiniaDataStore>
