import { defineStore } from 'pinia'
import { type ComputedRef, type ShallowReactive, shallowReactive } from 'vue'
import type { JsonApiDocument, JsonApiResource, JsonApiResourceIdentifier } from './json-api'
import { type FetchOptions, type FetchParams, type JsonApiFetcher, JsonApiFetcherImpl } from './json-api-fetcher'

/**
 * Base class for models
 */
export class Model {
  constructor(public id: string) {
    this.id = id
  }
  [key: string]: unknown
}

export interface ModelDefinition {
  /**
   * The JSON:API type for the model
   */
  type: string
  /**
   * The model constructor
   */
  ctor: typeof Model
  /**
   * Relationships for the model
   */
  rels?: Record<string, Relationship>
}

export interface PiniaJsonApiStoreConfig {
  /**
   * The URL for the JSON:API endpoint
   */
  endpoint: string
  /**
   * Model definitions for the store
   */
  modelDefinitions: ModelDefinition[]
  /**
   * Whether to convert kebab-case names from JSON:API (older convention) to camelCase
   */
  kebabCase?: boolean
  /**
   * Optional state for the fetcher (e.g. for authentication)
   */
  state?: ComputedRef<{ token: string }>
}

export enum RelationshipType {
  HasMany = 0,
  BelongsTo = 1,
}

/**
 * Relationship definition
 */
export interface Relationship {
  ctor: typeof Model
  type: RelationshipType
}

export interface PiniaJsonApiStore {
  /**
   * Models registered with this store
   */
  modelRegistry: ShallowReactive<Map<typeof Model, string>>
  /**
   * Relationships registered with this store
   */
  relRegistry: ShallowReactive<Map<typeof Model, Record<string, Relationship>>>
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
  const relsRegistry = shallowReactive(new Map<typeof Model, Record<string, Relationship>>())

  const recordsByType = shallowReactive(new Map<string, Map<string, Model>>())

  for (const modelDef of config.modelDefinitions) {
    const ctor = modelDef.ctor
    modelRegistry.set(ctor, modelDef.type)
    modelsByType.set(modelDef.type, ctor)
    if (modelDef.rels) relsRegistry.set(ctor, modelDef.rels)
    recordsByType.set(modelDef.type, new Map<string, Model>())
  }

  function generateId(): string {
    return Math.random().toString(36).substr(2, 9)
  }

  function createRecord<T extends typeof Model>(ctor: T, properties: Partial<InstanceType<T>> & { id?: string }) {
    const id = properties.id || generateId()
    return internalCreateRecord(ctor, id, properties) as InstanceType<T>
  }

  function camel(str: string) {
    if (config.kebabCase) return str.replace(/[-][a-z\u00E0-\u00F6\u00F8-\u00FE]/g, match => match.slice(1).toUpperCase())
    return str
  }

  function internalCreateRecord<T extends typeof Model>(ctor: T, id: string, properties?: Partial<InstanceType<T>>) {
    const type = getModelType(ctor)
    const recordMap = getRecords(type)
    let record = recordMap.get(id)
    if (!record) record = shallowReactive<InstanceType<T>>(new ctor(id) as InstanceType<T>)
    if (properties)
      for (const [key, value] of Object.entries(properties)) if (value !== undefined) record[camel(key)] = value
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

  function getResourceRecord(resource: JsonApiResource) {
    const recordsMap = getRecords(resource.type)
    const record = getRecord(recordsMap, resource.id)
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
    const records = resources.map((r) => internalCreateRecord<T>(ctor, r.id, r.attributes as Partial<InstanceType<T>>))
    // populate relationships
    function populateRelationships(resource: JsonApiResource) {
      const record = getResourceRecord(resource)
      const recordCtor = getModel(resource.type)
      if (!resource.relationships) return
      for (const [name, reldoc] of Object.entries(resource.relationships)) {
        const rels = relsRegistry.get(recordCtor)
        // NOTE: if relationship is not defined but exists in data, it is ignored
        if (!rels) continue
        const normalizedName = camel(name)
        const rel = rels[normalizedName]
        if (!rel) throw new Error(`Relationship ${normalizedName} not defined`)
        const relType = getModelType(rel.ctor)
        const relTypeRecords = recordsByType.get(relType)
        if (!relTypeRecords) continue
        const rids =
          rel.type === RelationshipType.HasMany
            ? (reldoc.data as JsonApiResourceIdentifier[])
            : [reldoc.data as JsonApiResourceIdentifier]
        const relRecords = rids.filter((d) => relTypeRecords.has(d.id)).map((d) => getRecord(relTypeRecords, d.id))
        record[normalizedName] = rel.type === RelationshipType.HasMany ? relRecords : relRecords[0]
      }
    }
    if (included) {
      resources.map(populateRelationships)
      included.map(populateRelationships)
    }
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
    const rels = relsRegistry.get(ctor)
    if (!rels) throw new Error(`Model ${ctor.name} has no relationships`)
    const rel = rels[name]
    if (!rel) throw new Error(`Has many relationship ${name} not defined`)
    if (rel.type === RelationshipType.BelongsTo) {
      const doc = await _fetcher.fetchBelongsTo(type, record.id, name, options, params)
      const related = doc.data as JsonApiResource
      const relatedRecord = internalCreateRecord(rel.ctor, related.id, related.attributes)
      record[name] = relatedRecord
      return doc
    }
    const doc = await _fetcher.fetchHasMany(type, record.id, name, options, params)
    const related =
      rel.type === RelationshipType.HasMany ? (doc.data as JsonApiResource[]) : [doc.data as JsonApiResource]
    const relatedRecords = related.map((r) => internalCreateRecord(rel.ctor, r.id, r.attributes))
    record[name] = rel.type === RelationshipType.HasMany ? relatedRecords : relatedRecords[0]
    return doc
  }

  function unloadAll() {
    for (const records of recordsByType.values()) records.clear()
  }

  return defineStore(name, () => {
    return {
      recordsByType,
      modelRegistry,
      relsRegistry,
      createRecord,
      findAll,
      findRecord,
      findRelated,
      unloadAll,
    }
  }) as unknown as PiniaJsonApiStoreUseFunction
}
