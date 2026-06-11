import { describe, it, expect } from 'vitest'
import { jsonWithETag } from '@/lib/http-cache'

function reqWith(etag?: string): Request {
  return new Request('http://localhost/api/test', {
    headers: etag ? { 'If-None-Match': etag } : {},
  })
}

describe('jsonWithETag', () => {
  it('returns 200 with the JSON body and an ETag header', async () => {
    const data = [{ id: 1, name: 'milk' }]
    const res = jsonWithETag(reqWith(), data)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('ETag')).toMatch(/^".+"$/)
    expect(await res.json()).toEqual(data)
  })

  it('returns an empty 304 when If-None-Match matches the current ETag', async () => {
    const data = { a: 1, b: 'two' }
    const first = jsonWithETag(reqWith(), data)
    const etag = first.headers.get('ETag')!

    const second = jsonWithETag(reqWith(etag), data)
    expect(second.status).toBe(304)
    expect(second.headers.get('ETag')).toBe(etag)
    expect(await second.text()).toBe('')
  })

  it('returns 200 with a new ETag when the data changes', async () => {
    const first = jsonWithETag(reqWith(), { v: 1 })
    const etag = first.headers.get('ETag')!

    const second = jsonWithETag(reqWith(etag), { v: 2 })
    expect(second.status).toBe(200)
    expect(second.headers.get('ETag')).not.toBe(etag)
    expect(await second.json()).toEqual({ v: 2 })
  })

  it('matches when If-None-Match contains multiple tags', () => {
    const first = jsonWithETag(reqWith(), { x: true })
    const etag = first.headers.get('ETag')!

    const res = jsonWithETag(reqWith(`"stale-tag", ${etag}`), { x: true })
    expect(res.status).toBe(304)
  })
})
