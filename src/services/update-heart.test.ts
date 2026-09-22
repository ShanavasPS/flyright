import { flipHeart } from './update-heart';

const post = (updateId: string, reacted: boolean, reactions: number) => ({
  updateId,
  text: 'Hi',
  reacted,
  reactions,
});

describe('flipHeart', () => {
  it('hearts an update and counts it', () => {
    expect(flipHeart([post('a', false, 2)], 'a')).toEqual([post('a', true, 3)]);
  });

  it('takes a heart back', () => {
    expect(flipHeart([post('a', true, 3)], 'a')).toEqual([post('a', false, 2)]);
  });

  it('never counts below zero', () => {
    expect(flipHeart(post('a', true, 0), 'a')).toEqual(post('a', false, 0));
  });

  it('finds the update however deep the query holds it', () => {
    const entries = [{ ownerId: 'o', update: { latest: post('a', false, 0), count: 1 } }];
    expect(flipHeart(entries, 'a')[0]!.update.latest).toEqual(post('a', true, 1));
    const page = { gone: false, updates: [post('b', false, 0), post('a', false, 1)] };
    expect(flipHeart(page, 'a').updates).toEqual([post('b', false, 0), post('a', true, 2)]);
  });

  it('keeps everything else as it was, down to identity', () => {
    const other = post('b', false, 0);
    const value = { updates: [other, post('a', false, 0)], meta: { n: 1 } };
    const next = flipHeart(value, 'a');
    expect(next.updates[0]).toBe(other);
    expect(next.meta).toBe(value.meta);
    const none = { updates: [other] };
    expect(flipHeart(none, 'a')).toBe(none);
  });

  it('leaves null and loading values alone', () => {
    expect(flipHeart(null, 'a')).toBeNull();
    expect(flipHeart(undefined, 'a')).toBeUndefined();
  });
});
