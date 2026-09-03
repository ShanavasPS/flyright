import { CARRIERS } from '@/constants/carriers';

/**
 * Where each airline actually takes an EU261/UK261 claim — the last mile the
 * regulation leaves to the passenger. Nearly every carrier only accepts claims
 * through its own web form and several explicitly bin emailed ones, so the
 * form is the primary channel and `email` appears only where the airline
 * itself publishes an address for compensation claims.
 *
 * Hand-curated from each airline's own site (never from claims agencies or
 * memory) — a wrong address here loses the user's claim silently while they
 * think the 6-week clock is running. `verifiedAt` is when we last checked.
 */
export interface ClaimChannel {
  /** Official online claim / customer-relations form. */
  formUrl?: string;
  /** Dedicated address the airline publishes for compensation claims. */
  email?: string;
  /** The airline says emailed claims are not processed — never offer the composer. */
  emailRefused?: boolean;
  /** What the passenger needs to know before the form opens. */
  notes?: string;
  /** ISO date we last confirmed this against the airline's site. */
  verifiedAt: string;
}

export const CLAIM_CHANNELS: Record<string, ClaimChannel> = {
  // Finnair
  AY: {
    formUrl: 'https://www.finnair.com/gb-en/customer-care-and-contact-information/contact-and-request-forms/feedback-and-compensation',
    emailRefused: true,
    notes: 'Pick “Apply for compensation for flight disruptions”; Finnair asks for claims within two months of the flight.',
    verifiedAt: '2026-09-03',
  },
  // Lufthansa
  LH: {
    formUrl: 'https://www.lufthansa.com/xx/en/fast-compensation',
    notes: 'Enter your booking code and name — no login needed.',
    verifiedAt: '2026-09-03',
  },
  // British Airways // page is bot-walled; URL taken from the airline's own help pages
  BA: {
    formUrl: 'https://www.britishairways.com/travel/feedbackclaims/public',
    notes: 'Claim for everyone on the booking at once; BA-operated flights only.',
    verifiedAt: '2026-09-03',
  },
  // Air France
  AF: {
    formUrl: 'https://wwws.airfrance.fr/en/claim',
    notes: 'Enter your 6-character booking reference and name; take the cash option over the voucher.',
    verifiedAt: '2026-09-03',
  },
  // KLM
  KL: {
    formUrl: 'https://www.klm.com/en/claim',
    notes: 'Enter your 6-character booking code and name; take the cash option over the voucher.',
    verifiedAt: '2026-09-03',
  },
  // Ryanair // page is bot-walled; URL taken from the airline's own help pages
  FR: {
    formUrl: 'https://eu261claims.ryanair.com/',
    notes: 'Needs a myRyanair login and only covers flights in the last 6 months — each passenger claims from their own account.',
    verifiedAt: '2026-09-03',
  },
  // easyJet
  U2: {
    formUrl: 'https://www.easyjet.com/claim/en/eu261',
    emailRefused: true,
    notes: 'Needs your booking reference and the flight number digits; emailed claims are not processed.',
    verifiedAt: '2026-09-03',
  },
  // SAS
  SK: {
    formUrl: 'https://www.flysas.com/en/support-information/claims',
    notes: 'Choose the “EU261 compensation” claim type.',
    verifiedAt: '2026-09-03',
  },
  // Swiss
  LX: {
    formUrl: 'https://www.swiss.com/ch/en/customer-support/contact-us/application-for-compensation-in-the-event-of-flight-irregularities',
    notes: 'Covers up to four extra passengers on the same claim.',
    verifiedAt: '2026-09-03',
  },
  // Iberia
  IB: {
    formUrl: 'https://www.iberia.com/gb/claims/delayed-flight/',
    notes: 'Needs your booking code and ticket number; Iberia aims to reply within 7 business days.',
    verifiedAt: '2026-09-03',
  },
  // TAP Air Portugal
  TP: {
    formUrl: 'https://www.flytap.com/en-us/help/requests-complaints/complaints',
    notes: 'No login needed; the form also lets you check a complaint\'s status later.',
    verifiedAt: '2026-09-03',
  },
  // Wizz Air
  W6: {
    formUrl: 'https://www.wizzair.com/en-gb/information-and-services/compliments-and-complaints',
    notes: 'Wizz answers within 30 days; claim directly first — assigned claims via agencies carry a €50 fee.',
    verifiedAt: '2026-09-03',
  },
  // Norwegian // page is bot-walled; URL taken from the airline's own help pages
  DY: {
    formUrl: 'https://www.norwegian.com/en/help-contact/claims/',
    notes: 'Allow 28 days for a reply before involving anyone else.',
    verifiedAt: '2026-09-03',
  },
  // Eurowings // page is bot-walled; URL taken from the airline's own help pages
  EW: {
    formUrl: 'https://www.eurowings.com/en/faq/flight-disruptions/claims-and-compensation.html',
    notes: 'The tool asks for the flight number, date, your name, email and six-digit booking code, then your IBAN.',
    verifiedAt: '2026-09-03',
  },
  // Austrian Airlines // page is bot-walled; URL taken from the airline's own help pages
  OS: {
    formUrl: 'https://www.austrian.com/at/en/fast-compensation',
    notes: 'Austrian may offer a prepaid card — you can insist on a bank transfer.',
    verifiedAt: '2026-09-03',
  },
  // Brussels Airlines // page is bot-walled; URL taken from the airline's own help pages
  SN: {
    formUrl: 'https://www.brusselsairlines.com/xx/en/contact/feedback/general/delays-and-cancellation',
    verifiedAt: '2026-09-03',
  },
  // Aer Lingus
  EI: {
    formUrl: 'https://www.aerlingus.com/app/support/forms/flight-disruption-compensation-form',
    notes: 'Needs your booking reference and bank details.',
    verifiedAt: '2026-09-03',
  },
  // Vueling // page is bot-walled; URL taken from the airline's own help pages
  VY: {
    formUrl: 'https://www.vueling.com/en/customer-services/assistants/compensation',
    verifiedAt: '2026-09-03',
  },
  // ITA Airways // page is bot-walled; URL taken from the airline's own help pages
  AZ: {
    formUrl: 'https://www.complaint.ita-airways.com/s/complaint?language=en_US&market=EN&prm=true',
    notes: 'No reply within two months → complain to the enforcement body of the country where the disruption happened.',
    verifiedAt: '2026-09-03',
  },
  // LOT Polish Airlines // page is bot-walled; URL taken from the airline's own help pages
  LO: {
    formUrl: 'https://www.lot.com/us/en/help-center/contact/forms/form-claim-after-departure',
    notes: 'Choose “Compensation” as the claim type; LOT pays within 45 days of a written request.',
    verifiedAt: '2026-09-03',
  },
  // Aegean Airlines
  A3: {
    formUrl: 'https://en.aegeanair.com/contact/Form',
    notes: 'Pick the “Passenger rights (EC) 261/2004” category.',
    verifiedAt: '2026-09-03',
  },
  // Turkish Airlines // page is bot-walled; URL taken from the airline's own help pages
  TK: {
    formUrl: 'https://www.turkishairlines.com/en-int/any-questions/customer-relations/feedback/',
    notes: 'Turkish Airlines only takes claims through this feedback form (or its app).',
    verifiedAt: '2026-09-03',
  },
  // Icelandair
  FI: {
    formUrl: 'https://icelandair.com/support/contact-us2',
    notes: 'Needs your booking reference.',
    verifiedAt: '2026-09-03',
  },
  // Emirates
  EK: {
    formUrl: 'https://www.emirates.com/uk/english/help/forms/complaint/',
    email: 'customer.affairs@emirates.com',
    verifiedAt: '2026-09-03',
  },
  // Qatar Airways
  QR: {
    formUrl: 'https://www.qatarairways.com/en/help.html#feedback',
    notes: 'Choose “Concerns” in the Feedback & Concerns box and enter your booking details.',
    verifiedAt: '2026-09-03',
  },
  // Virgin Atlantic // page is bot-walled; URL taken from the airline's own help pages
  VS: {
    formUrl: 'https://help.virginatlantic.com/gb/en/contact-forms/eu-care.html',
    notes: 'Virgin\'s EC261 Compensation Application form; claims can\'t be handled at the airport.',
    verifiedAt: '2026-09-03',
  },
  // Delta Air Lines
  DL: {
    formUrl: 'https://www.delta.com/us/en/change-cancel/exit-eu-compensation',
    notes: 'Press “Submit Feedback” on Delta\'s EU compensation page to reach the form.',
    verifiedAt: '2026-09-03',
  },
  // United Airlines // page is bot-walled; URL taken from the airline's own help pages
  UA: {
    formUrl: 'https://www.united.com/en/us/customercare',
    notes: 'Choose “Complaint”, then the international passenger-rights topic.',
    verifiedAt: '2026-09-03',
  },
  // American Airlines
  AA: {
    formUrl: 'https://www.aa.com/contact/forms?topic=#/',
    notes: 'Customer Relations form; cite Regulation (EC) 261/2004.',
    verifiedAt: '2026-09-03',
  },
  // Air Canada
  AC: {
    formUrl: 'https://accc-prod.microsoftcrmportals.com/en-CA/air-canada-contact-us/',
    notes: 'Pick the “Flight Delay or Cancellation Claim” tile; you can claim under EU261 or Canada\'s APPR, not both.',
    verifiedAt: '2026-09-03',
  },
  // Pegasus Airlines // page is bot-walled; URL taken from the airline's own help pages
  PC: {
    formUrl: 'https://www.flypgs.com/en/help-center',
    notes: 'No dedicated EU261 form — use “Write to us”, pick “Complaint”, and cite Regulation (EC) 261/2004 explicitly.',
    verifiedAt: '2026-09-03',
  },
  // Transavia // page is bot-walled; URL taken from the airline's own help pages
  HV: {
    formUrl: 'https://www.transavia.com/help/en-eu/contact-complaints/contact/submit-claim',
    notes: 'Choose the “Flight disruptions” category; Transavia answers within 3–6 weeks.',
    verifiedAt: '2026-09-03',
  },
  // TUI fly
  X3: {
    formUrl: 'https://claims.tuifly.com/tuifly/v1/claims/start',
    notes: 'German-language form; pick “Ich bin Fluggast” first.',
    verifiedAt: '2026-09-03',
  },
  // TUI Airways // page is bot-walled; URL taken from the airline's own help pages
  BY: {
    formUrl: 'https://www.tui.co.uk/destinations/contact-us/flight-delays',
    notes: 'TUI Airways UK form; replies within 56 days.',
    verifiedAt: '2026-09-03',
  },
  // Condor
  DE: {
    formUrl: 'https://www.condor.com/us/help-contact/contact/complaint-form-eu261.jsp',
    notes: 'Enter passenger names exactly as on the booking.',
    verifiedAt: '2026-09-03',
  },
  // airBaltic
  BT: {
    formUrl: 'https://www.airbaltic.com/en/submit-a-claim',
    notes: 'Pick the flight-irregularity / EU261 category.',
    verifiedAt: '2026-09-03',
  },
  // Air Europa // page is bot-walled; URL taken from the airline's own help pages
  UX: {
    formUrl: 'https://customerservice.aireuropa.com/complaints/ES/en/complaints-compliments',
    notes: 'You\'ll get a reference number by email to track the claim.',
    verifiedAt: '2026-09-03',
  },
  // Croatia Airlines
  OU: {
    formUrl: 'https://www.croatiaairlines.com/en/customer/request-type',
    notes: 'Pick “Claim” as the subject; have your ticket number, PNR and bank details ready.',
    verifiedAt: '2026-09-03',
  },
  // Volotea
  V7: {
    formUrl: 'https://www.volotea.com/en/contact/claims/',
    emailRefused: true,
    notes: 'One form per passenger — Volotea says claims sent any other way may not be processed.',
    verifiedAt: '2026-09-03',
  },
  // Luxair
  LG: {
    formUrl: 'https://www.luxair.lu/en/contact/',
    notes: 'No dedicated form — pick the complaint topic and cite Regulation (EC) 261/2004.',
    verifiedAt: '2026-09-03',
  },
  // Etihad Airways // page is bot-walled; URL taken from the airline's own help pages
  EY: {
    formUrl: 'https://www.etihad.com/en/help/share-feedback',
    notes: 'Choose the flight-disruption topic and cite Regulation (EC) 261/2004; Etihad replies within 30 days.',
    verifiedAt: '2026-09-03',
  },
};

/** Carriers with several IATA codes (subsidiaries, regional arms) share the
 * parent's claims channel. */
const ALIASES: Record<string, string> = {
  RK: 'FR', // Ryanair UK
  RR: 'FR', // Buzz
  AL: 'FR', // Malta Air
  OE: 'FR', // Lauda Europe
  EC: 'U2', // easyJet Europe
  DS: 'U2', // easyJet Switzerland
  CL: 'LH', // Lufthansa CityLine
  '4Y': 'LH', // Discover Airlines
};

/** Resolve the claim channel from a flight number's IATA prefix, or from the
 * carrier's display name for number-less journal entries. */
export function claimChannelFor(flightNumber: string, carrierName?: string): ClaimChannel | null {
  const prefix = flightNumber.slice(0, 2).toUpperCase();
  const code =
    ALIASES[prefix] ??
    (CLAIM_CHANNELS[prefix] ? prefix : undefined) ??
    Object.keys(CARRIERS).find((iata) => CARRIERS[iata].name === carrierName);
  return code ? (CLAIM_CHANNELS[code] ?? null) : null;
}
