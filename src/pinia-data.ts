import { defineStore } from 'pinia'
import { type ComputedRef, shallowReactive } from 'vue'
import { JsonApiFetcherImpl, type FetchOptions, type JsonApiFetcher } from './json-api-fetcher'

const classRegistry = new Map<Constructor<Model>, string>()
const hasManyRegistry = new Map<Constructor<Model>, Map<string, Constructor<Model>>>()

export function model(name: string) {
  return function (value: Constructor<Model>) {
    classRegistry.set(value, name)
  }
}

export function hasMany(ctor: Constructor<Model>) {
  return function (_target: undefined, context: ClassFieldDecoratorContext) {
    let isRegistred = false
    return function (this: any): any {
      if (isRegistred) return
      hasManyRegistry.set(this.constructor as Constructor<Model>, new Map([[context.name as string, ctor]]))
      isRegistred = true
    }
  }
}

export class Model {
  id: string
  constructor(id: string) {
    this.id = id
  }
  [key: string]: any
}

export interface Constructor<T> {
  new (...args: any[]): T
}

type InstanceOfConstructor = InstanceType<Constructor<Model>>
type InferInstanceType<T> = T extends Constructor<infer U> ? U : never

export interface PiniaDataStoreConfig {
  endpoint: string
  models: Constructor<Model>[]
  state?: ComputedRef<{ token: string }>
}

export interface FindOptions extends FetchOptions {}

export function definePiniaDataStore(name: string, config: PiniaDataStoreConfig, fetcher?: JsonApiFetcher) {
  if (!fetcher) fetcher = new JsonApiFetcherImpl(config.endpoint, config.state)
  const recordsByType = shallowReactive(new Map<string, Map<string, InstanceOfConstructor>>())
  for (const model of config.models) {
    const type = classRegistry.get(model)
    if (!type) throw new Error(`Model ${type} not defined`)
    recordsByType.set(type, new Map<string, Model>())
  }

  return defineStore(name, () => {
    function generateId(): string {
      return Math.random().toString(36).substr(2, 9)
    }

    function createRecord<T extends Constructor<Model>>(
      ctor: T,
      properties: Partial<InferInstanceType<T>> & { id?: string },
    ): InferInstanceType<T> {
      const type = classRegistry.get(ctor)
      if (!type) throw new Error(`Model ${type} not defined`)
      const id = properties.id || generateId()
      return internalCreateRecord(ctor, id, properties) as InferInstanceType<T>
    }

    function internalCreateRecord<T extends Constructor<Model>>(
      ctor: T,
      id: string,
      properties?: Partial<InferInstanceType<T>>,
    ): InferInstanceType<T> {
      const type = classRegistry.get(ctor)
      if (!type) throw new Error(`Model ${type} not defined`)
      const recordMap = recordsByType.get(type)
      if (!recordMap) throw new Error(`Model ${type} not defined`)
      let record = recordMap.get(id)
      if (!record) record = shallowReactive<InferInstanceType<T>>(new ctor(id) as InferInstanceType<T>)
      if (properties)
        for (const [key, value] of Object.entries(properties)) if (value !== undefined) record[key] = value
      recordMap.set(id, record)
      return record as InferInstanceType<T>
    }

    async function findAll<T extends Constructor<Model>>(
      ctor: T,
      options?: FindOptions,
    ): Promise<InferInstanceType<T>[]> {
      const type = classRegistry.get(ctor)
      if (!type) throw new Error(`Model ${ctor.name} not defined`)
      const related = await fetcher!.fetchAll(type, options)
      const records = related.map((r) =>
        internalCreateRecord<T>(ctor, r.id, r.attributes as Partial<InferInstanceType<T>>),
      )
      return records as InferInstanceType<T>[]
    }

    async function findRecord<T extends Constructor<Model>>(ctor: T, id: string): Promise<InferInstanceType<T>> {
      const type = classRegistry.get(ctor)
      if (!type) throw new Error(`Model ${ctor.name} not defined`)
      const records = recordsByType.get(type)
      if (!records) throw new Error(`Model with name ${type} not defined`)
      if (!records.has(id)) {
        const resource = await fetcher!.fetchOne(type, id)
        const newRecord = internalCreateRecord<T>(ctor, id, resource.attributes as Partial<InferInstanceType<T>>)
        records.set(id, newRecord)
      }
      const record = records.get(id)
      if (!record) throw new Error(`Record with id ${id} not found`)
      return record as InferInstanceType<T>
    }

    async function findRelated(record: Model, name: string) {
      const ctor = record.constructor as Constructor<Model>
      const type = classRegistry.get(ctor)
      if (!type) throw new Error(`Model ${record.constructor.name} not defined`)
      const relCtor = hasManyRegistry.get(ctor)?.get(name)
      if (!relCtor) throw new Error(`hasMany relation ${name} not defined`)
      const relType = classRegistry.get(relCtor)
      if (!relType) throw new Error(`hasMany relation ${name} not defined`)
      const related = await fetcher!.fetchRelated(type, record.id, name)
      const relatedRecords = related.map((r) => internalCreateRecord(relCtor, r.id, r.attributes))
      record[name] = relatedRecords
    }

    function unloadAll() {
      for (const records of recordsByType.values()) records.clear()
    }

    return {
      recordsByType,
      createRecord,
      findAll,
      findRecord,
      findRelated,
      unloadAll,
    }
  })
}

export type PiniaApiStoreDefinition = ReturnType<typeof definePiniaDataStore>
