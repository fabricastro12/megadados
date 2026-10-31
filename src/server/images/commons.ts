import type { BankImage } from '@/questions/images';
import { ImageUrlSchema } from '@/questions/schema';

const API = 'https://commons.wikimedia.org/w/api.php';
const plain = (value: string) => value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

interface CommonsPage {
  title: string;
  imageinfo?: {
    url: string;
    thumburl?: string;
    descriptionurl: string;
    mime: string;
    extmetadata?: Record<string, { value: string }>;
  }[];
}

/** Human searches only; Next caches each query for a day across server instances. */
export async function searchCommons(query: string, fetcher: typeof fetch = fetch): Promise<BankImage[]> {
  const url = new URL(API);
  url.search = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '12',
    gsrsearch: `${query} filetype:bitmap`, prop: 'imageinfo', iiprop: 'url|mime|extmetadata',
    iiurlwidth: '960', iiextmetadatafilter: 'Artist|LicenseShortName',
  }).toString();
  const response = await fetcher(url, {
    headers: { 'User-Agent': 'Megadados/1.0 (trivia image search)' },
    next: { revalidate: 86400 }, signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('Image bank unavailable');
  const data = await response.json() as { error?: unknown; query?: { pages?: Record<string, CommonsPage> } };
  if (data.error) throw new Error('Image bank unavailable');
  return Object.values(data.query?.pages ?? {}).flatMap((page) => {
    const info = page.imageinfo?.[0];
    if (!info || !['image/jpeg', 'image/png', 'image/webp'].includes(info.mime)) return [];
    const image = ImageUrlSchema.safeParse(info.thumburl ?? info.url);
    const source = new URL(info.descriptionurl);
    const license = plain(info.extmetadata?.LicenseShortName?.value ?? '');
    if (!image.success || source.protocol !== 'https:' || source.hostname !== 'commons.wikimedia.org' || !/^(CC0|CC BY|Public domain)/i.test(license)) return [];
    const artist = plain(info.extmetadata?.Artist?.value ?? 'Wikimedia Commons');
    return [{ title: page.title.replace(/^File:/, ''), url: image.data, source: source.href, credit: `${artist.slice(0, 230)} · ${license}`.slice(0, 300), license }];
  });
}
