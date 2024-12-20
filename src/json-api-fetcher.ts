import type { ComputedRef } from 'vue'
import type { JsonApiDocument, JsonApiResource } from './json-api'
import { pluralize } from 'inflection'
import ky from 'ky'

function resolvePath(...segments: string[]): string {
  return new URL(segments.join('/')).href
}

export interface PageOption {
  size?: number
  number?: number
}

export interface FetchOptions {
  fields?: Record<string, string[]>
  page?: PageOption
  include?: string[]
}

export interface JsonApiFetcher {
  fetchDocument(type: string, id?: string, options?: FetchOptions): Promise<JsonApiDocument>
  fetchOne(type: string, id: string): Promise<JsonApiResource>
  fetchAll(type: string, options?: FetchOptions): Promise<JsonApiResource[]>
  fetchHasMany(type: string, id: string, name: string, options?: FetchOptions): Promise<JsonApiDocument>
  fetchBelongsTo(type: string, id: string, name: string, options?: FetchOptions): Promise<JsonApiDocument>
}

export class JsonApiFetcherImpl implements JsonApiFetcher {
  constructor(
    private endpoint: string,
    private state?: ComputedRef<{ token: string }>,
  ) {}
  createOptions(options: FetchOptions = {}) {
    const searchParams = new URLSearchParams()
    const headers = new Headers()
    headers.append('Accept', 'application/vnd.api+json')
    if (this.state) headers.append('Authorization', `Bearer ${this.state.value.token}`)
    const requestOptions = { searchParams, headers }
    if (options.fields)
      for (const [key, value] of Object.entries(options.fields))
        searchParams.append(`fields[${pluralize(key)}]`, value.join(','))
    if (options.page?.size) searchParams.append('page[size]', options.page.size.toString())
    if (options.page?.number) searchParams.append('page[number]', options.page.number.toString())
    if (options.include) searchParams.append('include', options.include.join(','))
    return requestOptions
  }
  async fetchDocument(type: string, id?: string, options: FetchOptions = {}) {
    const segments = [this.endpoint, pluralize(type)]
    if (id) segments.push(id)
    const url = resolvePath(...segments)
    const doc = await ky.get(url, this.createOptions(options)).json<JsonApiDocument>()
    return doc
  }
  async fetchAll(type: string, options: FetchOptions = {}) {
    const url = resolvePath(this.endpoint, pluralize(type))
    const doc = await ky.get(url, this.createOptions(options)).json<JsonApiDocument>()
    const resources = doc.data as JsonApiResource[]
    return resources
  }
  async fetchOne(type: string, id: string, options: FetchOptions = {}) {
    const url = resolvePath(this.endpoint, pluralize(type), id)
    const doc = await ky.get(url, this.createOptions(options)).json<JsonApiDocument>()
    const resource = doc.data as JsonApiResource
    return resource
  }
  async fetchHasMany(type: string, id: string, name: string, options: FetchOptions = {}) {
    const url = resolvePath(this.endpoint, pluralize(type), id, name)
    const doc = await ky.get(url, this.createOptions(options)).json<JsonApiDocument>()
    return doc
  }
  async fetchBelongsTo(type: string, id: string, name: string, options: FetchOptions = {}) {
    const url = resolvePath(this.endpoint, pluralize(type), id, name)
    const doc = await ky.get(url, this.createOptions(options)).json<JsonApiDocument>()
    return doc
  }
}
