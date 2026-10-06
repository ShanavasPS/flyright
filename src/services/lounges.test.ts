import { loungeAirports } from './lounges';

jest.mock('convex/react', () => ({ useQuery: jest.fn() }));

describe('loungeAirports', () => {
  it('sends distinct, valid codes only', () => {
    expect(loungeAirports(['hel', 'DOH', 'HEL', null, '', 'XX', undefined])).toEqual(['DOH', 'HEL']);
  });

  it('caps a question at eight airports', () => {
    expect(loungeAirports(['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH', 'III'])).toHaveLength(8);
  });
});
