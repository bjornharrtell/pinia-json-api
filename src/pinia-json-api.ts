import { defineStore } from 'pinia'
import { type ComputedRef, type ShallowReactive, shallowReactive } from 'vue'
import type { JsonApiDocument, JsonApiResource, JsonApiResourceIdentifier } from './json-api'
import { type FetchOptions, type FetchParams, type JsonApiFetcher, JsonApiFetcherImpl } from './json-api-fetcher'

export class Model {
  constructor(public id: string) {
    this.id = id
  }
  [key: string]: unknown
}

export interface ModelDefinition {
  type: string
  ctor: typeof Model
  hasMany?: Map<string, typeof Model>
  belongsTo?: Map<string, typeof Model>
}

export interface PiniaJsonApiStoreConfig {
  endpoint: string
  modelDefinitions: ModelDefinition[]
  state?: ComputedRef<{ token: string }>
}

export interface PiniaJsonApiStore {
  /**
   * Models registered with this store
   */
  modelRegistry: ShallowReactive<Map<typeof Model, string>>
  /**
   * Has many relationships registered with this store
   */
  hasManyRegistry: ShallowReactive<Map<typeof Model, Map<string, typeof Model>>>
  /**
   * Belongs to relationships registered with this store
   */
  belongsToRegistry: ShallowReactive<Map<typeof Model, Map<string, typeof Model>>>
  /**
   * Records previously fetched by this store
   */
  recordsByType: ShallowReactive<Map<string, Map<string, Model>>>
  /**
   * @internal
   */
  createRecord<T extends typeof Model>(ctor: T, properties: Partial<InstanceType<T>> & { id?: string }): InstanceType<T>
  /**
   * Find all records of a given type
   * @returns the JSON API document that was fetched and the records that were found
   */
  findAll<T extends typeof Model>(
    ctor: T,
    options?: FetchOptions,
    params?: FetchParams,
  ): Promise<{ doc: JsonApiDocument; records: InstanceType<T>[] }>
  /**
   * Find a single record by id
   * @returns the record that was found
   */
  findRecord<T extends typeof Model>(
    ctor: T,
    id: string,
    options?: FetchOptions,
    params?: FetchParams,
  ): Promise<InstanceType<T>>
  /**
   * Find related records for a given record and relationship name
   * @returns the JSON API document that was fetched
   */
  findRelated(record: Model, name: string, options?: FetchOptions, params?: FetchParams): Promise<JsonApiDocument>
  unloadAll(): void
}

export type PiniaJsonApiStoreUseFunction = () => PiniaJsonApiStore

export function definePiniaJsonApiStore(name: string, config: PiniaJsonApiStoreConfig, fetcher?: JsonApiFetcher) {
  const _fetcher = fetcher ?? new JsonApiFetcherImpl(config.endpoint, config.state)

  const modelRegistry = shallowReactive(new Map<typeof Model, string>())
  const modelsByType = shallowReactive(new Map<string, typeof Model>())
  const hasManyRegistry = shallowReactive(new Map<typeof Model, Map<string, typeof Model>>())
  const belongsToRegistry = shallowReactive(new Map<typeof Model, Map<string, typeof Model>>())

  const recordsByType = shallowReactive(new Map<string, Map<string, Model>>())

  for (const modelDef of config.modelDefinitions) {
    const ctor = modelDef.ctor
    modelRegistry.set(ctor, modelDef.type)
    modelsByType.set(modelDef.type, ctor)
    if (modelDef.hasMany) hasManyRegistry.set(ctor, modelDef.hasMany)
    if (modelDef.belongsTo) belongsToRegistry.set(ctor, modelDef.belongsTo)
    recordsByType.set(modelDef.type, new Map<string, Model>())
  }

  function generateId(): string {
    return Math.random().toString(36).substr(2, 9)
  }

  function createRecord<T extends typeof Model>(ctor: T, properties: Partial<InstanceType<T>> & { id?: string }) {
    const type = getModelType(ctor)
    const id = properties.id || generateId()
    return internalCreateRecord(ctor, id, properties) as InstanceType<T>
  }

  function internalCreateRecord<T extends typeof Model>(ctor: T, id: string, properties?: Partial<InstanceType<T>>) {
    const type = getModelType(ctor)
    const recordMap = getRecords(type)
    let record = recordMap.get(id)
    if (!record) record = shallowReactive<InstanceType<T>>(new ctor(id) as InstanceType<T>)
    if (properties) for (const [key, value] of Object.entries(properties)) if (value !== undefined) record[key] = value
    recordMap.set(id, record)
    return record as InstanceType<T>
  }

  function getModelType(ctor: typeof Model) {
    const type = modelRegistry.get(ctor)
    if (!type) throw new Error(`Model ${ctor.name} not defined`)
    return type
  }

  function getModel(type: string) {
    const ctor = modelsByType.get(type)
    if (!ctor) throw new Error(`Model with name ${type} not defined`)
    return ctor
  }

  function getRecords(type: string) {
    const records = recordsByType.get(type)
    if (!records) throw new Error(`Model with name ${type} not defined`)
    return records
  }

  function getRecord(records: Map<string, Model>, id: string) {
    const record = records.get(id)
    if (!record) throw new Error(`Record with id ${id} not found`)
    return record
  }

  function resourcesToRecords<T extends typeof Model>(
    ctor: T,
    resources: JsonApiResource[],
    included?: JsonApiResource[],
  ) {
    function createRecord<T extends typeof Model>(resource: JsonApiResource) {
      return internalCreateRecord<T>(
        getModel(resource.type) as T,
        resource.id,
        resource.attributes as Partial<InstanceType<T>>,
      )
    }
    // create records for included resources
    if (included) for (const resource of included) createRecord(resource)
    // create records for main resources
    resources.map((r) => internalCreateRecord<T>(ctor, r.id, r.attributes as Partial<InstanceType<T>>))
    // populate relationships
    const type = getModelType(ctor)
    const recordsMap = getRecords(type)
    function populateRelationships(resource: JsonApiResource) {
      const record = getRecord(recordsMap, resource.id)
      if (!included || !resource.relationships) return record
      for (const [name, rel] of Object.entries(resource.relationships)) {
        if (hasManyRegistry.get(ctor)?.has(name)) {
          const relCtor = hasManyRegistry.get(ctor)?.get(name)
          if (!relCtor) throw new Error(`Has many relationship ${name} not defined`)
          const relType = getModelType(relCtor)
          const relTypeRecords = getRecords(relType)
          const relRecords = (rel.data as JsonApiResourceIdentifier[]).map((d) => getRecord(relTypeRecords, d.id))
          record[name] = relRecords
        } else if (belongsToRegistry.get(ctor)?.has(name)) {
          const relCtor = belongsToRegistry.get(ctor)?.get(name)
          if (!relCtor) throw new Error(`Belongs to relationship ${name} not defined`)
          const relType = getModelType(relCtor)
          const relTypeRecords = getRecords(relType)
          const relRecord = relTypeRecords?.get((rel.data as JsonApiResourceIdentifier).id)
          record[name] = relRecord
        }
        // NOTE: if relationship is not defined but exists in data, it is ignored
      }
      return record
    }
    const records = resources.map(populateRelationships)
    return records as InstanceType<T>[]
  }

  async function findAll<T extends typeof Model>(ctor: T, options?: FetchOptions, params?: FetchParams) {
    const type = getModelType(ctor)
    const doc = await _fetcher.fetchDocument(type, undefined, options, params)
    const resources = doc.data as JsonApiResource[]
    const records = resourcesToRecords(ctor, resources, doc.included)
    return { doc, records }
  }

  async function findRecord<T extends typeof Model>(ctor: T, id: string, options?: FetchOptions, params?: FetchParams) {
    const type = getModelType(ctor)
    const recordsMap = getRecords(type)
    if (!recordsMap.has(id)) {
      const doc = await _fetcher.fetchDocument(type, id, options, params)
      const resource = doc.data as JsonApiResource
      const records = resourcesToRecords(ctor, [resource], doc.included)
      const record = records[0]
      recordsMap.set(id, record)
    }
    const record = recordsMap.get(id)
    if (!record) throw new Error(`Record with id ${id} not found`)
    return record as InstanceType<T>
  }

  async function findRelated(record: Model, name: string, options?: FetchOptions, params?: FetchParams) {
    const ctor = record.constructor as typeof Model
    const type = getModelType(ctor)
    const hasManyRel = hasManyRegistry.get(ctor)
    if (hasManyRel?.has(name)) {
      const relCtor = hasManyRel.get(name)
      if (!relCtor) throw new Error(`Has many relationship ${name} not defined`)
      const doc = await _fetcher.fetchHasMany(type, record.id, name, options, params)
      const related = doc.data as JsonApiResource[]
      const relatedRecords = related.map((r) => internalCreateRecord(relCtor, r.id, r.attributes))
      record[name] = relatedRecords
      return doc
    }
    const belongsToRel = belongsToRegistry.get(ctor)
    if (belongsToRel?.has(name)) {
      const relCtor = belongsToRel.get(name)
      if (!relCtor) throw new Error(`Belongs to relationship ${name} not defined`)
      const doc = await _fetcher.fetchBelongsTo(type, record.id, name, options, params)
      const related = doc.data as JsonApiResource
      const relatedRecord = internalCreateRecord(relCtor, related.id, related.attributes)
      record[name] = relatedRecord
      return doc
    }
    throw new Error(`Model ${record.constructor.name} has no relations`)
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
      createRecord,
      findAll,
      findRecord,
      findRelated,
      unloadAll,
    }
  }) as unknown as PiniaJsonApiStoreUseFunction
}
