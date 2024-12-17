import { defineStore } from 'pinia'
import { ComputedRef, shallowReactive } from 'vue'
import ky from 'ky'
import { pluralize } from 'inflection'

export interface Model {
  new (id: string): Model
  id: string
  [key: string]: any
}
export class Model {
  constructor(id: string) {
    this.id = id
  }
}

export interface Constructor<T> {
  new (...args: any[]): T
}

type InstanceOfConstructor = InstanceType<Constructor<Model>>
type InferInstanceType<T> = T extends Constructor<infer U> ? U : never

export interface PiniaDataStoreConfig {
  endpoint: string
  modelDefinitions: ModelDefinition[]
  state?: ComputedRef<{ token: string }>
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
  fetchAll(type: string, options?: FetchOptions): Promise<JsonApiResource[]>
  fetchRelated(type: string, id: string, name: string, options?: FetchOptions): Promise<JsonApiResource[]>
}

export interface ModelDefinition {
  type: string
  ctor: Constructor<Model>
  hasMany?: Map<string, string>
  belongsTo?: Map<string, string>
}

function resolvePath(...segments: string[]): string {
  return new URL(segments.join('/')).href
}

export interface FindOptions extends FetchOptions {}

export interface FetchOptions {
  fields?: Record<string, string[]>
}

class JsonApiFetcherImpl implements JsonApiFetcher {
  constructor(
    private endpoint: string,
    private state?: ComputedRef<{ token: string }>,
  ) {}
  createOptions(options: FetchOptions = {}) {
    const searchParams = new URLSearchParams()
    const headers = new Headers()
    headers.append('Accept', 'application/vnd.api+json')
    if (this.state) headers.append('Authorization', `Bearer ${this.state.value.token}`)
    const requestOptions = {
      searchParams,
      headers,
    }
    if (options.fields)
      for (const [key, value] of Object.entries(options.fields))
        searchParams.append(`fields[${pluralize(key)}]`, value.join(','))
    return requestOptions
  }
  async fetchAll(type: string, options: FetchOptions = {}): Promise<JsonApiResource[]> {
    const url = resolvePath(this.endpoint, pluralize(type))
    const requestOptions = this.createOptions(options)
    requestOptions.searchParams.append('page[size]', '10')
    const doc = await ky.get(url, requestOptions).json<JsonApiDocument>()
    const resources = doc.data as JsonApiResource[]
    return resources
  }
  async fetchOne(type: string, id: string, options: FetchOptions = {}): Promise<JsonApiResource> {
    const url = resolvePath(this.endpoint, pluralize(type), id)
    const doc = await ky.get(url, this.createOptions(options)).json<JsonApiDocument>()
    const resource = doc.data as JsonApiResource
    return resource
  }
  async fetchRelated(type: string, id: string, name: string, options: FetchOptions = {}): Promise<JsonApiResource[]> {
    const url = resolvePath(this.endpoint, pluralize(type), id, name)
    const doc = await ky.get(url, this.createOptions(options)).json<JsonApiDocument>()
    const resource = doc.data as JsonApiResource[]
    return resource
  }
}

export function definePiniaDataStore(name: string, config: PiniaDataStoreConfig, fetcher?: JsonApiFetcher) {
  if (!fetcher) fetcher = new JsonApiFetcherImpl(config.endpoint, config.state)

  const modelDefinitionsByType = shallowReactive(new Map<string, ModelDefinition>())
  const modelDefinitionsByCtor = shallowReactive(new Map<Constructor<Model>, ModelDefinition>())
  const recordsByType = shallowReactive(new Map<string, Map<string, InstanceOfConstructor>>())
  for (const modelDefinition of config.modelDefinitions) {
    if (!modelDefinition.hasMany) modelDefinition.hasMany = new Map()
    if (!modelDefinition.belongsTo) modelDefinition.belongsTo = new Map()
    modelDefinitionsByType.set(modelDefinition.type, modelDefinition)
    modelDefinitionsByCtor.set(modelDefinition.ctor, modelDefinition)
    recordsByType.set(modelDefinition.type, new Map<string, Model>())
  }

  return defineStore(name, () => {
    function generateId(): string {
      return Math.random().toString(36).substr(2, 9)
    }

    function createRecord<T extends Model>(type: string, properties: Partial<T> & { id?: string }): T {
      const modelConstructor = modelDefinitionsByType.get(type)
      if (!modelConstructor) throw new Error(`Model ${type} not defined`)
      const id = properties.id || generateId()
      return internalCreateRecord(type, id, properties) as T
    }

    function internalCreateRecord<T extends Model>(type: string, id: string, properties?: Partial<T>) {
      const modelDefinition = modelDefinitionsByType.get(type)
      if (!modelDefinition) throw new Error(`Model ${type} not defined`)
      const recordMap = recordsByType.get(type)
      if (!recordMap) throw new Error(`Model ${type} not defined`)
      let record = recordMap.get(id)
      if (!record) record = shallowReactive<T>(new modelDefinition.ctor(id) as T)
      if (properties)
        for (const [key, value] of Object.entries(properties)) if (value !== undefined) record[key] = value
      recordMap.set(id, record)
      return record as T
    }

    async function findAll<T extends Constructor<Model>>(
      ctor: T,
      options?: FindOptions,
    ): Promise<InferInstanceType<T>[]> {
      const modelDefinition = modelDefinitionsByCtor.get(ctor)
      if (!modelDefinition) throw new Error(`Model ${ctor.name} not defined`)
      const type = modelDefinition.type
      const related = await fetcher!.fetchAll(type, options)
      const records = related.map((r) => internalCreateRecord(type, r.id, r.attributes))
      return records as InferInstanceType<T>[]
    }

    async function findRecord<T extends Constructor<Model>>(
      ctor: Constructor<Model>,
      id: string,
    ): Promise<InferInstanceType<T>> {
      const modelDefinition = modelDefinitionsByCtor.get(ctor)
      if (!modelDefinition) throw new Error(`Model ${ctor.name} not defined`)
      const type = modelDefinition.type
      const records = recordsByType.get(type)
      if (!records) throw new Error(`Model with name ${type} not defined`)
      if (!records.has(id)) {
        const resource = await fetcher!.fetchOne(type, id)
        const newRecord = internalCreateRecord(type, id, resource.attributes)
        records.set(id, newRecord)
      }
      const record = records.get(id)
      if (!record) throw new Error(`Record with id ${id} not found`)
      return record as InferInstanceType<T>
    }

    async function findRelated(record: Model, name: string) {
      const modelDefinition = modelDefinitionsByCtor.get(record.constructor as Constructor<Model>)
      if (!modelDefinition) throw new Error(`Model ${record.constructor.name} not defined`)
      const type = modelDefinition.type
      const relType = modelDefinition.hasMany?.get(name)
      if (!relType) return
      const related = await fetcher!.fetchRelated(type, record.id, name)
      const relatedRecords = related.map((r) => internalCreateRecord(relType, r.id, r.attributes))
      record[name] = relatedRecords
    }

    function unloadAll() {
      for (const records of recordsByType.values()) records.clear()
    }

    return {
      modelDefinitionsByType,
      modelDefinitionsByCtor,
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
