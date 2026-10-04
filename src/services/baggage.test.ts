import {
  baggageChips,
  baggageFromAllowance,
  baggageFromText,
  baggageLine,
  mergeBaggage,
  parseBaggage,
  serializeBaggage,
} from './baggage';

describe('baggage', () => {
  it('stores only what is known', () => {
    expect(serializeBaggage({})).toBeNull();
    expect(serializeBaggage({ checked: 2, checkedKg: 23 })).toBe('{"checked":2,"checkedKg":23}');
    expect(parseBaggage('{"checked":-1,"carryOn":"yes"}')).toBeNull();
    expect(parseBaggage('not json')).toBeNull();
  });

  it('shows the chips in the design order, with what is not included', () => {
    expect(baggageChips({ personal: true, carryOn: true, carryOnKg: 8, checked: 0 })).toEqual([
      { key: 'personal', label: 'Personal item', included: true },
      { key: 'carryOn', label: 'Carry-on 8 kg', included: true },
      { key: 'checked', label: 'No checked bag', included: false },
    ]);
    expect(baggageLine({ checked: 2, checkedKg: 23 })).toBe('2 × 23 kg checked');
    expect(baggageLine({ checked: 1 })).toBe('1 checked bag');
    expect(baggageLine({ checkedKg: 30 })).toBe('30 kg checked');
    expect(baggageLine(null)).toBeNull();
  });

  it('reads a boarding pass allowance', () => {
    expect(baggageFromAllowance('2PC')).toEqual({ checked: 2 });
    expect(baggageFromAllowance('20K')).toEqual({ checkedKg: 20 });
    expect(baggageFromAllowance('0PC')).toEqual({ checked: 0 });
    expect(baggageFromAllowance('   ')).toBeNull();
  });

  it('reads what a booking page prints for a leg', () => {
    expect(baggageFromText('Class: BCLASSIC, R Cabin: Business Baggage (4): 2PC')).toEqual({ checked: 2 });
    expect(baggageFromText('28Nov 11:30  13:25  Ok  28Nov  28Nov   0PC')).toEqual({ checked: 0 });
    expect(baggageFromText('Includes 30 kg checked baggage and cabin baggage 7 kg')).toEqual({
      checkedKg: 30,
      carryOn: true,
      carryOnKg: 7,
    });
    expect(baggageFromText('COKDOH: MAX 2PC Free of Charge CARRY7KG 15LB')).toEqual({ checked: 2, carryOn: true, carryOnKg: 7 });
    // A policy line's single-bag size is not the allowance.
    expect(baggageFromText('1st Checked Bag: Free of Charge 1 PC 32KG MAX')).toBeNull();
    // Two legs' allowances in one window: not pinned to either.
    expect(baggageFromText('SEADOH: MAX 1PC  DOHCOK: MAX 2PC')).toBeNull();
    expect(baggageFromText('Seat 14A')).toBeNull();
  });

  it('adds to what the traveller typed, never over it', () => {
    expect(mergeBaggage({ checked: 1 }, { checked: 2, carryOn: true })).toEqual({ checked: 1, carryOn: true });
    expect(mergeBaggage(null, { checked: 2 })).toEqual({ checked: 2 });
  });
});
