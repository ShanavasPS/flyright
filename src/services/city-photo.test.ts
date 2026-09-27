import { creditName, isCityPhoto, isFreeLicence, isUsablePhoto, pageMatches, pickPhotoFile } from '../../convex/cityPhotoShared';

describe('city photo choice (convex/cityPhotoShared)', () => {
  it('takes a plain JPEG of the city', () => {
    expect(isCityPhoto('London_Skyline_(125508655).jpeg')).toBe(true);
    expect(isCityPhoto('File:Oulu_city_centre_20250902_05.jpg')).toBe(true);
    expect(isCityPhoto('Portland_Oregon_Aerial,_June_2025.jpg')).toBe(true);
  });

  it('skips collages, flags, arms, maps and vector art', () => {
    expect(isCityPhoto('Montage_Pokkinen_Oulu.jpg')).toBe(false);
    expect(isCityPhoto('Oulu.lippu.svg')).toBe(false);
    expect(isCityPhoto('Oulu.vaakuna.svg')).toBe(false);
    expect(isCityPhoto('Map_of_Oulu_in_1886.jpg')).toBe(false);
    expect(isCityPhoto('Coat_of_arms_of_Helsinki.jpg')).toBe(false);
  });

  it('skips historical and satellite pictures', () => {
    expect(isCityPhoto('Oulu1800.jpg')).toBe(false);
    expect(isCityPhoto('Uleåborg - Jacob Boström - Finland framställdt i teckningar - 112.jpg')).toBe(false);
    expect(isCityPhoto('Oulu_sat_img.jpg')).toBe(false);
    // A modern year is fine.
    expect(isCityPhoto('Frankfurt_am_Main,_Central_business_district_(2024).jpg')).toBe(true);
  });

  it('picks the page image first, then the article order', () => {
    expect(pickPhotoFile('Montage_Pokkinen_Oulu.jpg', ['Oulu.lippu.svg', 'Oulu1800.jpg', 'Oulu_city_centre_20250902_05.jpg']))
      .toBe('Oulu_city_centre_20250902_05.jpg');
    expect(pickPhotoFile(null, ['Oulu.vaakuna.svg'])).toBeNull();
  });

  it('wants a landscape photo that is not filed as artwork', () => {
    expect(isUsablePhoto(960, 540, 'Skylines of London|Tower Bridge')).toBe(true);
    expect(isUsablePhoto(960, 1280, '')).toBe(false);
    expect(isUsablePhoto(960, 600, 'Drawings of Oulu|Finland framställdt i teckningar')).toBe(false);
  });

  it('only shows freely licensed photos', () => {
    for (const ok of ['CC BY-SA 3.0', 'CC BY 2.0', 'CC0', 'Public domain', 'CC BY-SA 4.0']) expect(isFreeLicence(ok)).toBe(true);
    for (const no of ['Fair use', '', null, 'All rights reserved']) expect(isFreeLicence(no)).toBe(false);
  });

  it('keeps one short, readable credit', () => {
    expect(creditName('<a href="//commons.wikimedia.org/wiki/User:Ilya">Ilya Grigorik</a>')).toBe('Ilya Grigorik');
    expect(creditName('Michal Pise, Michal.Pise')).toBe('Michal Pise');
    expect(creditName('Yann Caradec from Paris, France')).toBe('Yann Caradec');
    expect(creditName('Estormiz (incl. all the photographs montage is made of)')).toBe('Estormiz');
    expect(creditName('')).toBeNull();
  });

  it('accepts a page only when it is about a place in that country', () => {
    expect(pageMatches({ type: 'standard', description: 'Capital city of England and the United Kingdom' }, 'United Kingdom')).toBe(true);
    expect(pageMatches({ type: 'disambiguation', description: 'Topics referred to by the same term' }, 'United States')).toBe(false);
    expect(pageMatches({ type: 'standard', description: 'City in Maine, United States' }, 'Finland')).toBe(false);
  });
});
