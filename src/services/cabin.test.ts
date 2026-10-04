import { cabinFromCompartment, cabinFromText, cabinLabel } from './cabin';

describe('cabin class', () => {
  it('reads a boarding pass letter only when it means one cabin', () => {
    expect(cabinFromCompartment('Y')).toBe('economy');
    expect(cabinFromCompartment('j')).toBe('business');
    expect(cabinFromCompartment('F')).toBe('first');
    expect(cabinFromCompartment('W')).toBe('premium');
    expect(cabinFromCompartment('P')).toBeNull();
    expect(cabinFromCompartment(null)).toBeNull();
  });

  it('reads the cabin a booking page names', () => {
    expect(cabinFromText('Class: Economy  Seat 14A')).toBe('economy');
    expect(cabinFromText('Cabin BUSINESS  Baggage 2PC')).toBe('business');
    expect(cabinFromText('Premium Economy Class (W)')).toBe('premium');
    expect(cabinFromText('First class lounge access')).toBe('first');
  });

  it('does not take ordinary words or a table of several cabins for a cabin', () => {
    expect(cabinFromText('Your first bag is free. Refunds take 5 business days.')).toBeNull();
    expect(cabinFromText('HEL-DOH Economy  DOH-SIN Business class')).toBeNull();
    expect(cabinFromText('Seat 14A')).toBeNull();
  });

  it('labels a stored key', () => {
    expect(cabinLabel('premium')).toBe('Premium economy');
    expect(cabinLabel('Y')).toBeNull();
    expect(cabinLabel(null)).toBeNull();
  });
});
