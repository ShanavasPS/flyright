import { searchKey } from '../../convex/circleShared';

/** The one comparison "add someone" is built on: what a profile stores
 * (users.writeProfile) and what a search types (circle.findPeople) must
 * normalize identically, or people become unfindable. */
describe('searchKey', () => {
  it('normalizes case, padding and inner whitespace', () => {
    expect(searchKey('Salma')).toBe('salma');
    expect(searchKey('  Eve  ')).toBe('eve');
    expect(searchKey('Mary  Jane')).toBe('mary jane');
    expect(searchKey('Sam+Clerk_Test@Example.com')).toBe('sam+clerk_test@example.com');
  });

  it('treats empty and missing values as no key at all', () => {
    expect(searchKey('')).toBeNull();
    expect(searchKey('   ')).toBeNull();
    expect(searchKey(null)).toBeNull();
    expect(searchKey(undefined)).toBeNull();
  });

  it('matches a whole name only — a prefix is a different key', () => {
    expect(searchKey('sal')).not.toBe(searchKey('salma'));
  });
});
