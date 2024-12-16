import { defineStore } from 'pinia'
import { ShallowRef, shallowRef } from 'vue'
import ky from 'ky'
import { pluralize } from 'inflection'

export interface Model {
  new (...args: any[]): Model
  id: string
}
export class Model {}

export interface Constructor<T> {
  new (...args: any[]): T
}

type InstanceOfConstructor = InstanceType<Constructor<Model>>

export interface PiniaDataStoreConfig {
  endpoint: string
  modelDefinitions: ModelDefinition[]
}

export interface JsonApiResourceIdentifier {
  id: string
  type: string
}

export interface JsonApiRelationship {
  data: null | [] | JsonApiResourceIdentifier | JsonApiResourceIdentifier[]
}

export interface JsonApiResource {
  id: string
  type: string
  attributes: Record<string, any>
  relationships: Record<string, JsonApiRelationship>
}

export interface JsonApiDocument {
  data: JsonApiResource | JsonApiResource[]
  included?: JsonApiResource[]
  meta?: object
}

export interface JsonApiFetcher {
  fetchOne(type: string, id: string): Promise<JsonApiResource>
  fetchAll(type: string): Promise<JsonApiResource[]>
  fetchRelated(type: string, id: string, name: string): Promise<JsonApiResource[]>
}

export interface ModelDefinition {
  type: string
  ctor: Constructor<Model>
  hasMany: Map<string, string>
  belongsTo: Map<string, string>
}

export interface AsyncMany<T> {
  load: () => Promise<ShallowRef<T[]>>
  data: ShallowRef<T[]>
}

export interface AsyncSingle<T> {
  load: () => Promise<ShallowRef<T>>
  data: ShallowRef<T>
}

function resolvePath(...segments: string[]): string {
  return new URL(segments.join('/')).href;
}

class JsonApiFetcherImpl implements JsonApiFetcher {
  options = {
    headers: {
      'accept': 'application/vnd.api+json'
    }
  }
  constructor(private endpoint: string) {}
  async fetchAll(type: string): Promise<JsonApiResource[]> {
    const url = resolvePath(this.endpoint, pluralize(type))
    const doc = await ky.get(url, this.options).json<JsonApiDocument>()
    const resources = doc.data as JsonApiResource[]
    return resources
  }
  async fetchOne(type: string, id: string): Promise<JsonApiResource> {
    const url = resolvePath(this.endpoint, pluralize(type), id)
    const doc = await ky.get(url, this.options).json<JsonApiDocument>()
    const resource = doc.data as JsonApiResource
    return resource
  }
  async fetchRelated(type: string, id: string, name: string): Promise<JsonApiResource[]> {
    const url = resolvePath(this.endpoint, pluralize(type), id, name)
    const doc = await ky.get(url, this.options).json<JsonApiDocument>()
    const resource = doc.data as JsonApiResource[]
    return resource
  }
}

export function definePiniaDataStore(config: PiniaDataStoreConfig, fetcher?: JsonApiFetcher) {
  if (!fetcher) fetcher = new JsonApiFetcherImpl(config.endpoint)

  const modelDefinitions = new Map<string, ModelDefinition>()
  const records = new Map<string, Map<string, InstanceOfConstructor>>()
  for (const modelDefinition of config.modelDefinitions) {
    if (!modelDefinition.hasMany) modelDefinition.hasMany = new Map()
    if (!modelDefinition.belongsTo) modelDefinition.belongsTo = new Map()
    modelDefinitions.set(modelDefinition.type, modelDefinition)
    records.set(modelDefinition.type, new Map<string, Model>())
  }

  return defineStore('pinia-data', () => {
    function generateId(): string {
      return Math.random().toString(36).substr(2, 9)
    }

    function useFetchRelated<T extends Model>(type: string, id: string, name: string, relType: string): AsyncMany<T> {
      let data = shallowRef<T[]>([])
      async function load() {
        const related = await fetcher!.fetchRelated(type, id, name)
        const records = related.map((r) => internalCreateRecord<T>(relType, id, r.attributes as Partial<T>))
        data.value = records
        return data
      }
      return {
        load,
        data
      } 
    }

    function useFetchMany<T extends Model>(type: string): AsyncMany<T> {
      let data = shallowRef<T[]>([])
      async function load() {
        const related = await fetcher!.fetchAll(type)
        const records = related.map((r) => internalCreateRecord<T>(type, r.id, r.attributes as Partial<T>))
        data.value = records
        return data
      }
      return {
        load,
        data
      } 
    }

    function createRecord<T extends Model>(type: string, properties: Partial<T> & { id?: string }): T {
      const modelConstructor = modelDefinitions.get(type)
      if (!modelConstructor) throw new Error(`Model ${type} not defined`)
      const id = properties.id || generateId()
      return internalCreateRecord(type, id, properties) as T
    }

    function internalCreateRecord<T extends Model>(type: string, id: string, properties: Partial<T>) {
      const modelDefinition = modelDefinitions.get(type)
      if (!modelDefinition) throw new Error(`Model ${type} not defined`)

      const record = new modelDefinition.ctor()
      Object.assign(record, properties, { id })

      for (const [name, relType] of modelDefinition.hasMany.entries()) {
        var relation = useFetchRelated(type, id, name, relType)
        Object.defineProperty(record, name, {
          get() {
            return relation
          }
        })
      }

      const recordMap = records.get(type)
      if (!recordMap) throw new Error(`Model ${type} not defined`)
      recordMap.set(id, record)
      return record as T
    }

    function findAll<T extends Model>(type: string): AsyncMany<T> {
      return useFetchMany<T>(type)
    }

    async function findRecord<T extends Model>(type: string, id: string): Promise<T> {
      const modelRecords = records.get(type)
      if (!modelRecords) throw new Error(`Model with name ${type} not defined`)
      if (!modelRecords.has(id)) {
        const resource = await fetcher!.fetchOne(type, id)
        const newRecord = internalCreateRecord(type, id, resource.attributes)
        modelRecords.set(id, newRecord)
      }
      const record = modelRecords.get(id)
      if (!record) throw new Error(`Record with id ${id} not found`)
      return record as T
    }

    function unloadAll() {
      for (const modelRecords of records.values()) modelRecords.clear()
    }

    return {
      createRecord,
      findAll,
      findRecord,
      unloadAll,
    }
  })
}
