/** Choosing a home base city's photo from Wikipedia (docs/home-base.md).
 * Pure, so the app's tests cover it without the network. */

/** File names that are rarely a single photo of the place: collages, maps,
 * flags, coats of arms, locators, logos and old drawings. */
const NOT_A_PHOTO = /montage|collage|collection|mosaic|map|karte|flag|coat[_ ]of[_ ]arms|wappen|vaakuna|locator|location|logo|seal|emblem|banner|drawing|teckning|engraving|illustration|painting|diagram|chart|sketch|lithograph/i;

/** Satellite pictures, and a year before 1950 in the name ("Oulu1800.jpg"):
 * a historical picture, not how the city looks. */
const NOT_TODAY = /sat(ellite)?[_ ]?im(a)?g|satellite|landsat|(^|[^0-9])(1[0-8]\d\d|19[0-4]\d)([^0-9]|$)/i;

/** A file worth showing as a city photo: a JPEG, not one of the kinds above. */
export function isCityPhoto(fileName: string): boolean {
  const name = decodeURIComponent(fileName).replace(/^File:/i, '');
  return /\.(jpe?g)$/i.test(name) && !NOT_A_PHOTO.test(name) && !NOT_TODAY.test(name);
}

/** Commons categories that mark a drawing, painting, map or old picture. */
const NOT_A_PHOTO_CATEGORY = /drawings|paintings|engravings|lithographs|illustrations|maps of|historical images|old photographs|postcards/i;

/** The file itself, once Commons describes it: a landscape photo (the banner
 * is wide) whose categories don't say it's artwork or history. */
export function isUsablePhoto(width: number, height: number, categories: string | null | undefined): boolean {
  return width >= height * 1.15 && !NOT_A_PHOTO_CATEGORY.test(categories ?? '');
}

/** The first usable file: the page's own image, then the page's other images
 * in the order the article shows them. */
export function pickPhotoFile(pageImage: string | null, others: string[]): string | null {
  for (const name of [pageImage, ...others]) if (name && isCityPhoto(name)) return name;
  return null;
}

/** Licences that allow showing the photo with a credit. Anything else
 * (fair use, unknown) is skipped. */
export function isFreeLicence(shortName: string | null | undefined): boolean {
  return !!shortName && /^(CC BY(-SA)?( \d(\.\d)?)?|CC0|Public domain|PD.*)/i.test(shortName.trim());
}

/** Commons credits arrive as HTML, sometimes with a second username in
 * brackets or after a comma: keep the first readable name, short. */
export function creditName(artistHtml: string | null | undefined): string | null {
  const text = (artistHtml ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const first = text.split(/\s*[(,;]\s*|\s+and\s+|\s+from\s+/)[0]!.trim();
  return first.length > 40 ? `${first.slice(0, 39)}…` : first || null;
}

/** Wikipedia's page for a city is its bare name when that page is about the
 * right place; otherwise the article's search finds "City, Country". */
export function pageMatches(summary: { type?: string; description?: string; extract?: string }, countryName: string): boolean {
  if (summary.type !== 'standard') return false;
  const text = `${summary.description ?? ''} ${summary.extract ?? ''}`.toLowerCase();
  return text.includes(countryName.toLowerCase());
}

export const cityPhotoKey = (city: string, country: string) => `${country}:${city}`;
