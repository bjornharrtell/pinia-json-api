import ky, { HTTPError, type Options } from 'ky'
import type { ComputedRef } from 'vue'
import type { JsonApiDocument, JsonApiResource } from './json-api'

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
  filter?: string
}

export interface FetchParams {
  [key: string]: string
}

export interface JsonApiFetcher {
  fetchDocument(type: string, id?: string, options?: FetchOptions, params?: FetchParams): Promise<JsonApiDocument>
  fetchOne(type: string, id: string, options?: FetchOptions, params?: FetchParams): Promise<JsonApiResource>
  fetchAll(type: string, options?: FetchOptions, params?: FetchParams): Promise<JsonApiResource[]>
  fetchHasMany(
    type: string,
    id: string,
    name: string,
    options?: FetchOptions,
    params?: FetchParams,
  ): Promise<JsonApiDocument>
  fetchBelongsTo(
    type: string,
    id: string,
    name: string,
    options?: FetchOptions,
    params?: FetchParams,
  ): Promise<JsonApiDocument>
  post(data: JsonApiResource): Promise<JsonApiDocument>
}

async function req(url: string, options: Options, method = 'get') {
  const r = method === 'get' ? ky.get : ky.post
  try {
    const doc = await r(url, options).json<JsonApiDocument>()
    return doc
  } catch (e) {
    if (e instanceof HTTPError) {
      const doc = await e.response.json<JsonApiDocument>()
      return doc
    }
    throw e
  }
}

export class JsonApiFetcherImpl implements JsonApiFetcher {
  constructor(
    private endpoint: string,
    private state?: ComputedRef<{ token: string }>,
  ) {}
  createOptions(options: FetchOptions = {}, params: FetchParams = {}): Options {
    const searchParams = new URLSearchParams()
    const headers = new Headers()
    headers.append('Accept', 'application/vnd.api+json')
    if (this.state) headers.append('Authorization', `Bearer ${this.state.value.token}`)
    const requestOptions = { searchParams, headers }
    if (options.fields)
      for (const [key, value] of Object.entries(options.fields)) searchParams.append(`fields[${key}]`, value.join(','))
    if (options.page?.size) searchParams.append('page[size]', options.page.size.toString())
    if (options.page?.number) searchParams.append('page[number]', options.page.number.toString())
    if (options.include) searchParams.append('include', options.include.join(','))
    if (options.filter) searchParams.append('filter', options.filter)
    for (const [key, value] of Object.entries(params)) searchParams.append(key, value)
    return requestOptions
  }
  async fetchDocument(type: string, id?: string, options?: FetchOptions, params?: FetchParams) {
    const segments = [this.endpoint, type]
    if (id) segments.push(id)
    const url = resolvePath(...segments)
    const doc = await req(url, this.createOptions(options, params))
    return doc
  }
  async fetchAll(type: string, options?: FetchOptions, params?: FetchParams) {
    const url = resolvePath(this.endpoint, type)
    const doc = await req(url, this.createOptions(options, params))
    const resources = doc.data as JsonApiResource[]
    return resources
  }
  async fetchOne(type: string, id: string, options?: FetchOptions, params?: FetchParams) {
    const url = resolvePath(this.endpoint, type, id)
    const doc = await req(url, this.createOptions(options, params))
    const resource = doc.data as JsonApiResource
    return resource
  }
  async fetchHasMany(type: string, id: string, name: string, options?: FetchOptions, params?: FetchParams) {
    const url = resolvePath(this.endpoint, type, id, name)
    const doc = await req(url, this.createOptions(options, params))
    return doc
  }
  async fetchBelongsTo(type: string, id: string, name: string, options?: FetchOptions, params?: FetchParams) {
    const url = resolvePath(this.endpoint, type, id, name)
    const doc = await req(url, this.createOptions(options, params))
    return doc
  }
  async post(resource: JsonApiResource) {
    const url = resolvePath(this.endpoint, resource.type)
    const requestOptions = this.createOptions()
    const body: JsonApiDocument = {
      data: resource,
    }
    requestOptions.json = body
    const doc = await req(url, requestOptions, 'post')
    return doc
  }
}
