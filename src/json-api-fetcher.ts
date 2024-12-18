import type { ComputedRef } from 'vue'
import type { JsonApiDocument, JsonApiResource } from './json-api'
import { pluralize } from 'inflection'
import ky from 'ky'

function resolvePath(...segments: string[]): string {
  return new URL(segments.join('/')).href
}

export interface FetchOptions {
  fields?: Record<string, string[]>
}

export interface JsonApiFetcher {
  fetchOne(type: string, id: string): Promise<JsonApiResource>
  fetchAll(type: string, options?: FetchOptions): Promise<JsonApiResource[]>
  fetchHasMany(type: string, id: string, name: string, options?: FetchOptions): Promise<JsonApiResource[]>
  fetchBelongsTo(type: string, id: string, name: string, options?: FetchOptions): Promise<JsonApiResource>
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
  async fetchHasMany(type: string, id: string, name: string, options: FetchOptions = {}): Promise<JsonApiResource[]> {
    const url = resolvePath(this.endpoint, pluralize(type), id, name)
    const doc = await ky.get(url, this.createOptions(options)).json<JsonApiDocument>()
    const resource = doc.data as JsonApiResource[]
    return resource
  }
  async fetchBelongsTo(type: string, id: string, name: string, options: FetchOptions = {}): Promise<JsonApiResource> {
    const url = resolvePath(this.endpoint, pluralize(type), id, name)
    const doc = await ky.get(url, this.createOptions(options)).json<JsonApiDocument>()
    const resource = doc.data as JsonApiResource
    return resource
  }
}
