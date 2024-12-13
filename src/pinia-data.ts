import { defineStore } from 'pinia'
import { computed } from 'vue'
import ky from 'ky'

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
  endpoint: URL
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

class JsonApiFetcherImpl implements JsonApiFetcher {
  constructor(private endpoint: URL) {}
  async fetchAll(type: string): Promise<JsonApiResource[]> {
    const url = new URL(type, this.endpoint)
    const doc = await ky.get(url).json<JsonApiDocument>()
    const resources = doc.data as JsonApiResource[]
    return resources
  }
  async fetchOne(type: string, id: string): Promise<JsonApiResource> {
    const url = new URL(`${type}/${id}`, this.endpoint)
    const doc = await ky.get(url).json<JsonApiDocument>()
    const resource = doc.data as JsonApiResource
    return resource
  }
  async fetchRelated(type: string, id: string, name: string): Promise<JsonApiResource[]> {
    const segments = [type]
    if (id) segments.push(id)
    if (name) segments.push(name)
    const url = new URL(segments.join('/'), this.endpoint)
    const doc = await ky.get(url).json<JsonApiDocument>()
    const resource = doc.data as JsonApiResource[]
    return resource
  }
}

export interface ModelDefinition {
  type: string
  ctor: Constructor<Model>
  hasMany: Map<string, string>
  belongsTo: Map<string, string>
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

    async function getRelated<T extends Model>(type: string, id: string, name: string, relType: string): Promise<T[]> {
      const relatedResources = await fetcher!.fetchRelated(type, id, name)
      const newRecords = relatedResources.map((r) => internalCreateRecord<T>(relType, id, r.attributes as Partial<T>))
      return newRecords
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
        Object.defineProperty(record, name, {
          get() {
            return computed(() => getRelated<T>(type, id, name, relType))
          },
        })
      }

      const recordMap = records.get(type)
      if (!recordMap) throw new Error(`Model ${type} not defined`)
      recordMap.set(id, record)
      return record as T
    }

    async function findAll<T extends Model>(type: string): Promise<T[]> {
      const modelRecords = records.get(type)
      if (!modelRecords) throw new Error(`Model with name ${type} not defined`)
      if (modelRecords.size === 0) {
        const resources = await fetcher!.fetchAll(type)
        const newRecords = resources.map((r) => internalCreateRecord(type, r.id, r.attributes))
        for (const newRecord of newRecords) modelRecords.set(newRecord.id, newRecord)
      }
      return Array.from(modelRecords.values()) as T[]
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
