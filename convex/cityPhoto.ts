import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import { action, internalMutation, query } from './_generated/server';
import { HOUR, limit } from './abuse';
import { cityPhotoKey, creditName, isCityPhoto, isFreeLicence, isUsablePhoto, pageMatches } from './cityPhotoShared';

/** One photo per home base city, looked up on Wikipedia once and shared by
 * every traveller who lives there (docs/home-base.md). Public data: no
 * account needed, a global budget guards the lookups. */

const DAY = 24 * HOUR;
const UA = 'FlyRight/1.0 (https://getflyright.com; hello@getflyright.com)';
const place = { city: v.string(), country: v.string() };

function checkPlace(city: string, country: string) {
  if (!city.trim() || city.length > 80 || !/^[A-Z]{2}$/.test(country)) throw new ConvexError('Invalid city.');
}

export const get = query({
  args: place,
  handler: async (ctx, { city, country }) => {
    checkPlace(city, country);
    const row = await ctx.db.query('cityPhotos').withIndex('by_key', (q) => q.eq('key', cityPhotoKey(city, country))).unique();
    if (!row || row.status === 'pending') return null;
    return { status: row.status, url: row.url, width: row.width, height: row.height, credit: row.credit, licence: row.licence, page: row.page };
  },
});

/** Whether this call should do the lookup: not when a fresh answer is
 * stored or another call is already fetching it. */
export const claim = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db.query('cityPhotos').withIndex('by_key', (q) => q.eq('key', key)).unique();
    const now = Date.now();
    if (row) {
      const age = now - row.fetchedAt;
      if (row.status === 'ok' && age < 60 * DAY) return false;
      if (row.status === 'none' && age < 7 * DAY) return false;
      if (row.status === 'pending' && age < 2 * 60_000) return false;
    }
    await limit(ctx, 'city-photo', 600, HOUR);
    if (row) await ctx.db.patch(row._id, { status: row.status === 'ok' ? 'ok' : 'pending', fetchedAt: now });
    else await ctx.db.insert('cityPhotos', { key, status: 'pending', url: null, width: null, height: null, credit: null, licence: null, page: null, fetchedAt: now });
    return true;
  },
});

const found = v.object({ url: v.string(), width: v.number(), height: v.number(), credit: v.union(v.string(), v.null()), licence: v.string(), page: v.string() });

export const store = internalMutation({
  args: { key: v.string(), photo: v.union(found, v.null()) },
  handler: async (ctx, { key, photo }) => {
    const row = await ctx.db.query('cityPhotos').withIndex('by_key', (q) => q.eq('key', key)).unique();
    const values = photo
      ? { status: 'ok' as const, ...photo, fetchedAt: Date.now() }
      : { status: 'none' as const, url: null, width: null, height: null, credit: null, licence: null, page: null, fetchedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, values);
    else await ctx.db.insert('cityPhotos', { key, ...values });
  },
});

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!response.ok) return null;
  return response.json();
}

type Summary = { type?: string; title?: string; description?: string; extract?: string; originalimage?: { source: string }; content_urls?: { mobile?: { page?: string } } };

const summary = (title: string): Promise<Summary | null> =>
  getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`);

/** "…/commons/6/67/London.jpeg" or "…/commons/thumb/5/59/Oulu.jpg/3840px-Oulu.jpg" → the file name. */
function fileOf(source: string): string | null {
  const parts = new URL(source).pathname.split('/');
  const name = parts.includes('thumb') ? parts[parts.indexOf('thumb') + 3] : parts[parts.length - 1];
  return name ? decodeURIComponent(name) : null;
}

async function findPage(city: string, countryName: string): Promise<Summary | null> {
  // The airport table names some towns after two places ("Oulu / Oulunsalo")
  // or with a note in brackets: Wikipedia knows the first name.
  const name = city.split(/\s+\/\s+/)[0]!.replace(/\s*\(.*\)\s*$/, '').trim() || city;
  const direct = await summary(name);
  if (direct && pageMatches(direct, countryName)) return direct;
  const search = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=${encodeURIComponent(`${name} ${countryName}`)}`);
  const title: string | undefined = search?.query?.search?.[0]?.title;
  const page = title ? await summary(title) : null;
  return page?.type === 'standard' ? page : null;
}

async function commonsPhoto(file: string) {
  const info = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=960&titles=${encodeURIComponent(`File:${file}`)}`);
  const page: any = info && Object.values(info.query?.pages ?? {})[0];
  const image = page?.imageinfo?.[0];
  const licence: string | undefined = image?.extmetadata?.LicenseShortName?.value;
  if (!image?.thumburl || !isFreeLicence(licence)) return null;
  const width = Number(image.thumbwidth) || 0;
  const height = Number(image.thumbheight) || 0;
  if (!isUsablePhoto(width, height, image.extmetadata?.Categories?.value)) return null;
  return { url: image.thumburl as string, width, height, credit: creditName(image.extmetadata?.Artist?.value), licence: licence!.trim() };
}

/** Looks the photo up if nobody has yet. The app then reads it with `get`. */
export const ensure = action({
  args: { ...place, countryName: v.string() },
  handler: async (ctx, { city, country, countryName }) => {
    checkPlace(city, country);
    if (countryName.length > 80) throw new ConvexError('Invalid country.');
    const key = cityPhotoKey(city, country);
    if (!(await ctx.runMutation(internal.cityPhoto.claim, { key }))) return;
    let photo = null;
    try {
      const page = await findPage(city, countryName);
      if (page?.title) {
        const files: string[] = [];
        const own = page.originalimage ? fileOf(page.originalimage.source) : null;
        if (own) files.push(own);
        const media = await getJson(`https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(page.title.replace(/ /g, '_'))}`);
        for (const item of media?.items ?? []) {
          if (item.type === 'image' && typeof item.title === 'string') files.push(item.title.replace(/^File:/, ''));
        }
        const candidates = [...new Set(files)].filter(isCityPhoto).slice(0, 8);
        for (const file of candidates) {
          const found = await commonsPhoto(file);
          if (found) {
            photo = { ...found, page: page.content_urls?.mobile?.page ?? `https://en.m.wikipedia.org/wiki/${encodeURIComponent(page.title)}` };
            break;
          }
        }
      }
    } catch (error) {
      console.warn('city photo lookup failed', key, error);
    }
    await ctx.runMutation(internal.cityPhoto.store, { key, photo });
  },
});

/** Drop a city's stored answer so the next visit looks it up again — for a
 * photo someone reports as wrong: `npx convex run cityPhoto:forget '{"key":"FI:Oulu"}'`. */
export const forget = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db.query('cityPhotos').withIndex('by_key', (q) => q.eq('key', key)).unique();
    if (row) await ctx.db.delete(row._id);
  },
});
