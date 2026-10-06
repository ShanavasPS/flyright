import { loungeOptions, type Lounge } from './lounge-access';
import {
  fixLine,
  leaveBy,
  leaveByLabel,
  loungeDeparture,
  loungeLine,
  membershipFromPass,
  onBooking,
  passLoyalty,
  statusEvidence,
  verdictLabel,
  wayLine,
  type LoungeTrip,
} from './lounge-trip';
import { type MembershipLike } from './loyalty-programmes';

// IATA Resolution 792's example pass, moved to AY5 HEL→JFK on day 282
// (9 Oct 2026), carrying Finnair Plus number 600123454821 and fast track.
const pass = (flyer: string) =>
  `M1DESMARAIS/LUC       EABC123 HELJFKAY 0005 282J002A0025 14D>6180WW6225BAC 00141234560032A0141234567890 1AY AY ${flyer.padEnd(16)} 20KY`;

const trip = (over: Partial<LoungeTrip> = {}): LoungeTrip => ({
  number: 'AY5',
  fromCode: 'HEL',
  toCode: 'JFK',
  scheduledDeparture: '2026-10-09T15:40:00',
  cabin: 'economy',
  terminal: null,
  passCode: null,
  ...over,
});

const finnair = (over: Partial<MembershipLike> = {}): MembershipLike => ({
  id: 'ay',
  programme: 'ay',
  customAirline: null,
  customProgramme: null,
  number: '600 123 454 821',
  tier: 'Platinum',
  balance: null,
  qualifying: null,
  qualifyingTarget: null,
  tierUntil: null,
  expiringAmount: null,
  expiringOn: null,
  ...over,
});

const lounge = (over: Partial<Lounge>): Lounge => ({
  loungeId: 'hel-x',
  airport: 'HEL',
  name: 'Lounge',
  terminal: null,
  location: null,
  afterPassportControl: true,
  hours: null,
  access: { status: { alliance: 'oneworld', levels: ['emerald'] } },
  checkedOn: '2026-10-06',
  source: 'https://example.com',
  ...over,
});

describe('loungeDeparture', () => {
  it('reads the trip as the engine wants it', () => {
    expect(loungeDeparture(trip({ cabin: 'business', terminal: ' 2 ' }), 'Europe/Helsinki')).toEqual({
      airport: 'HEL',
      carrier: 'AY',
      cabin: 'business',
      terminal: '2',
      crossesBorder: true,
      international: true,
      departsLocal: '15:40',
    });
  });

  it('knows a Schengen flight skips passport control', () => {
    expect(loungeDeparture(trip({ toCode: 'CDG' }), null)).toMatchObject({ crossesBorder: false, international: true });
  });

  it('reads a zoned departure on the airport clock', () => {
    expect(loungeDeparture(trip({ scheduledDeparture: '2026-10-09T12:40:00Z' }), 'Europe/Helsinki')?.departsLocal).toBe('15:40');
  });
});

describe('onBooking', () => {
  it('is true when the pass carries the saved number', () => {
    expect(onBooking(trip({ passCode: pass('600123454821') }), finnair())).toBe(true);
  });

  it('is false when the pass carries another number for the same airline', () => {
    expect(onBooking(trip({ passCode: pass('699999999999') }), finnair())).toBe(false);
  });

  it('is unknown without a pass, with blank fields, or for another programme', () => {
    expect(onBooking(trip(), finnair())).toBeNull();
    expect(onBooking(trip({ passCode: pass('').replace('AY AY ', 'AY    ') }), finnair())).toBeNull();
    expect(onBooking(trip({ passCode: pass('699999999999') }), finnair({ programme: 'qr' }))).toBeNull();
  });
});

describe('loungeLine', () => {
  const emerald = lounge({ name: 'Finnair Platinum Wing' });
  const business = lounge({
    name: 'Finnair Business Lounge',
    access: { status: { alliance: 'oneworld', levels: ['sapphire', 'emerald'] } },
  });

  it('counts what can be used and names the best', () => {
    const t = trip({ passCode: pass('600123454821') });
    const options = loungeOptions([emerald, business], loungeDeparture(t, null)!, statusEvidence(t, [finnair()]), [], '2026-10');
    expect(loungeLine(options, true)).toEqual({ title: '2 lounges you can use', detail: 'Finnair Platinum Wing included' });
  });

  it('says likely until the boarding pass shows the number', () => {
    const options = loungeOptions([emerald], loungeDeparture(trip(), null)!, statusEvidence(trip(), [finnair()]), [], '2026-10');
    expect(loungeLine(options, true)).toEqual({ title: '1 lounge you can use', detail: 'Finnair Platinum Wing likely' });
  });

  it('asks for a membership when there is none', () => {
    const options = loungeOptions([emerald, business], loungeDeparture(trip(), null)!, [], [], '2026-10');
    expect(loungeLine(options, false)).toEqual({ title: '2 lounges at HEL', detail: 'Add a membership to see which you can use' });
  });

  it('says nothing when memberships open no lounge, or there is no data', () => {
    const options = loungeOptions([emerald], loungeDeparture(trip(), null)!, statusEvidence(trip(), [finnair({ tier: 'Gold' })]), [], '2026-10');
    expect(loungeLine(options, true)).toBeNull();
    expect(loungeLine([], false)).toBeNull();
  });
});

describe('travel-day wording', () => {
  const t = trip();
  const emerald = lounge({ name: 'Finnair Platinum Wing' });

  it('leaves 15 minutes before boarding, else 45 before departure, delays included', () => {
    const boarding = { terminal: null, boardingTime: '2026-10-09T12:05:00Z', estimatedDeparture: null };
    expect(new Date(leaveBy(t, 'Europe/Helsinki', boarding)!).toISOString()).toBe('2026-10-09T11:50:00.000Z');
    expect(new Date(leaveBy(t, 'Europe/Helsinki')!).toISOString()).toBe('2026-10-09T11:55:00.000Z');
    const delayed = { terminal: null, boardingTime: null, estimatedDeparture: '2026-10-09T13:40:00Z' };
    expect(new Date(leaveBy(t, 'Europe/Helsinki', delayed)!).toISOString()).toBe('2026-10-09T12:55:00.000Z');
    expect(leaveByLabel(Date.parse('2026-10-09T11:55:00Z'), 'Europe/Helsinki')).toMatch(/14:55|2:55/);
  });

  it('a delay moves the departure the verdicts use', () => {
    const delayed = { terminal: '2', boardingTime: null, estimatedDeparture: '2026-10-09T23:10:00+03:00' };
    expect(loungeDeparture(t, 'Europe/Helsinki', delayed)).toMatchObject({ departsLocal: '23:10', terminal: '2' });
  });

  it('says how the traveller gets in and what to fix', () => {
    const [option] = loungeOptions([emerald], loungeDeparture(t, null)!, statusEvidence(t, [finnair()]), [], '2026-10');
    expect(verdictLabel(option)).toEqual({ text: 'Likely', tone: 'warning' });
    expect(wayLine(option, [finnair()], 'AY5')).toBe('Finnair Plus Platinum · oneworld Emerald');
    expect(fixLine(option, [finnair()], false)).toMatch(/Save your boarding pass/);
    expect(fixLine(option, [finnair()], true)).toMatch(/doesn't show it/);
  });

  it('names a cabin entry and an ended status', () => {
    const business = lounge({ access: { cabin: { cabins: ['business'], alliance: 'oneworld' } } });
    const [cabin] = loungeOptions([business], loungeDeparture(trip({ cabin: 'business' }), null)!, [], [], '2026-10');
    expect(verdictLabel(cabin)).toEqual({ text: 'Included', tone: 'success' });
    expect(wayLine(cabin, [], 'AY5')).toBe('Business on AY5');
    const old = finnair({ tierUntil: '2026-03' });
    const [ended] = loungeOptions([emerald], loungeDeparture(t, null)!, statusEvidence(t, [old]), [], '2026-10');
    expect(verdictLabel(ended).text).toBe('Check status');
    expect(fixLine(ended, [old], false)).toMatch(/Platinum until Mar 2026/);
  });

  it('prices a pay-at-the-desk lounge', () => {
    const paid = lounge({ access: { door: { amount: 4500, currency: 'EUR' } } });
    const [option] = loungeOptions([paid], loungeDeparture(t, null)!, [], [], '2026-10');
    expect(verdictLabel(option)).toEqual({ text: '€45', tone: 'neutral' });
    expect(wayLine(option, [], 'AY5')).toBe('Pay at the desk');
  });
});

describe('passLoyalty', () => {
  const withPass = trip({ passCode: pass('600123454821') });

  it('names the membership on the booking and matches the saved one', () => {
    expect(passLoyalty(withPass, [finnair()])).toEqual({
      airline: 'AY',
      last4: '4821',
      programme: { id: 'ay', name: 'Finnair Plus' },
      matchId: 'ay',
      otherNumberSaved: false,
      fastTrack: true,
    });
  });

  it('offers to add a membership the traveller never saved', () => {
    expect(passLoyalty(withPass, [])).toMatchObject({ matchId: null, otherNumberSaved: false });
    expect(membershipFromPass(withPass)).toEqual({ programme: 'ay', number: '600123454821' });
  });

  it('notices another number saved for the same programme', () => {
    expect(passLoyalty(trip({ passCode: pass('699999999999') }), [finnair()])).toMatchObject({
      matchId: null,
      otherNumberSaved: true,
    });
  });

  it('is null without a pass or with blank fields', () => {
    expect(passLoyalty(trip(), [finnair()])).toBeNull();
    expect(passLoyalty(trip({ passCode: pass('').replace('AY AY ', 'AY    ') }), [finnair()])).toBeNull();
    expect(membershipFromPass(trip())).toBeNull();
  });
});
