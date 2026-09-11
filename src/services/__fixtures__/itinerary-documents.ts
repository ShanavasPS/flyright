/** Text and barcodes as the native readers produce them for real
 * documents — PDFKit (iOS) walks the content stream, PDFBox (Android) sorts
 * by position — with passenger names, record locators and ticket numbers
 * replaced. Regenerate against a new document with:
 *
 *   iOS order:      swift pdfprobe.swift <file.pdf>   (PDFKit page.string + Vision)
 *   Android order:  java -jar pdfbox-app.jar ExtractText -sort -console <file.pdf>
 */

import type { DocumentPage } from '@/services/itinerary';

// The two BCBP stripes an Amadeus receipt prints: one per Qatar-operated leg.
const QR517_BCBP =
  'M1DOE/JANE ELIZABETH  E7K2ABC COKDOHQR 0517 206R03K 0000 043>218   0000I                251572100000000                        ';
const QR516_BCBP =
  'M1DOE/JANE ELIZABETH  E7K2ABC DOHCOKQR 0516 214R02K 0000 043>218   0000I                251572100000000                        ';

/** Amadeus e-ticket receipt (Qatar Airways): 6 legs, PDF417 BCBP stripes on
 * 2 of them — iOS text order (Vision decodes the header stripe twice). */
export const QATAR_RECEIPT_PDFKIT: DocumentPage[] = [
  {
    text: `_
Passenger: Doe Jane Elizabeth Mr (ADT)
Booking ref:
1A/7K2ABC
AS/QWERTY
QR/7K2ABC
Ticket number: 157 2100000000 - 04
Itinerary Printing Office:
QATAR AIRWAYS MOBILE, DIGITAL OFFICE,
BOMBAY
Telephone: TBA
Date: 11Jun2026
ELECTRONIC TICKET RECEIPT
Qatar Airways may request additional payment verification for itineraries paid for with credit cards
_
From
To Departure Arrival Last check-in
Flight
KOCHI COCHIN INTL
(KOCHI)
Terminal: 3
DOHA HAMAD
INTERNATIONAL
QR517 04:15
25Jul2026
06:05
25Jul2026
Class: BCLASSIC, R Cabin: Business Baggage (4): 2PC
Fare basis: RJINP9RE Seat: 03K
Special Service Request Operated by: QATAR AIRWAYS
Marketed by: QATAR AIRWAYS
Booking status (1): OK
Frequent flyer number: 500000000
NVA (3): 25Jan2027
Duration: 04:20
DOCS - PASSENGER/CREW PRIMARY TRAVEL DOCUMENT INFO - CONFIRMED
DOHA HAMAD
_
INTERNATIONAL
SEATTLE SEATTLE
TACOMA INTL
QR719 07:50
25Jul2026
12:25
25Jul2026
Class: BCLASSIC, R Cabin: Business Baggage (4): 2PC
Fare basis: RJINP9RE Seat: 06J
Special Service Request Operated by: QATAR AIRWAYS
Marketed by: QATAR AIRWAYS
Booking status (1): OK
Frequent flyer number: 500000000
NVA (3): 25Jan2027
Duration: 14:35
DOCS - PASSENGER/CREW PRIMARY TRAVEL DOCUMENT INFO - CONFIRMED
SEATTLE SEATTLE TACOMA
PORTLAND PORTLAND
QR3387 15:55
_
INTL
INTL
25Jul2026
16:55
25Jul2026
Class: BCLASSIC, B Cabin: Economy Baggage (4): 2PC
Fare basis: RJINP9RE Seat:
Special Service Request Operated by: ALASKA
Marketed by: QATAR AIRWAYS
Booking status (1): OK
Frequent flyer number: 500000000
NVA (3): 25Jan2027
Duration: 01:00
DOCS - PASSENGER/CREW PRIMARY TRAVEL DOCUMENT INFO - CONFIRMED
PORTLAND PORTLAND INTL SEATTLE SEATTLE
_
TACOMA INTL
QR2175 13:48
01Aug2026
14:43
01Aug2026`,
    barcodes: [QR517_BCBP, QR517_BCBP],
  },
  {
    text: `Class: BCLASSIC, B Baggage (4): 2PC
Fare basis: RJINP9RE Seat:
Operated by: HORIZON AIR AS ALASKAHORIZON
Cabin: Economy Marketed by: QATAR AIRWAYS NVB (2): 28Jul2026
Booking status (1): OK
Frequent flyer number: 500000000
NVA (3): 25Jan2027
Duration: 00:55
Special Service Request DOCS - PASSENGER/CREW PRIMARY TRAVEL DOCUMENT INFO - CONFIRMED
SEATTLE SEATTLE TACOMA
_
INTL
DOHA HAMAD
INTERNATIONAL
QR720 16:25
01Aug2026
17:00
02Aug2026
Class: BCLASSIC, R Baggage (4): 2PC
Fare basis: RJINP9RE Seat: 03K
Operated by: QATAR AIRWAYS
Cabin: Business Marketed by: QATAR AIRWAYS NVB (2): 28Jul2026
Booking status (1): OK
Frequent flyer number: 500000000
NVA (3): 25Jan2027
Duration: 14:35
Special Service Request DOCS - PASSENGER/CREW PRIMARY TRAVEL DOCUMENT INFO - CONFIRMED
DOHA HAMAD
_
INTERNATIONAL
KOCHI COCHIN INTL
(KOCHI)
Terminal: 3
QR516 19:40
02Aug2026
02:45
03Aug2026
Class: BCLASSIC, R Baggage (4): 2PC
Fare basis: RJINP9RE Seat: 02K
Operated by: QATAR AIRWAYS
Cabin: Business Marketed by: QATAR AIRWAYS NVB (2): 28Jul2026
Booking status (1): OK
Frequent flyer number: 500000000
NVA (3): 25Jan2027
Duration: 04:35
Special Service Request DOCS - PASSENGER/CREW PRIMARY TRAVEL DOCUMENT INFO - CONFIRMED
(1) OK = Confirmed (2) NVB = Not valid before (3) NVA = Not valid after (4) Each passenger can check in a specific amount of baggage at no extra
cost as indicated on the column baggage. For more information on baggage rules and restrictions on Qatar Airways flights, please visit
qatarairways.com/en/baggage.html`,
    barcodes: [QR516_BCBP],
  },
  {
    text: `Baggage Policy
COKPDX
1st Checked Bag: Free of Charge 1 PC 32KG MAX 158LCM AND62LI
2nd Checked Bag: Free of Charge 1 PC 32KG MAX 158LCM AND62LI
PDXCOK
1st Checked Bag: Free of Charge 1 PC 32KG MAX 158LCM AND62LI
2nd Checked Bag: Free of Charge 1 PC 32KG MAX 158LCM AND62LI
CARRY-ON BAG:
COKDOH: MAX 2PC Free of Charge CARRY7KG 15LB UPTO45LI 115LCM
DOHSEA: MAX 2PC Free of Charge CARRY7KG 15LB UPTO45LI 115LCM
SEAPDX: MAX 2PC Free of Charge CARRY ON PERSONAL ITEM AND/OR CARRY ON UP TO 45 LI 115 LCM
PDXSEA: MAX 2PC Free of Charge CARRY ON PERSONAL ITEM AND/OR CARRY ON UP TO 45 LI 115 LCM
SEADOH: MAX 1PC Free of Charge CARRY7KG 15LB UPTO45LI 115LCM
DOHCOK: MAX 2PC Free of Charge CARRY7KG 15LB UPTO45LI 115LCM
BAGGAGE PROHIBITED:
COKDOH: CANOE OR KAYAK WITH OARS
LB = Weight In Pounds, KG = Weight In Kilos, LI = Linear Inches, LCM = Linear Centimeters, MAX = Maximum Allowed, PC = Number of Pieces
_
PAYMENT DETAILS FARE DETAILS
Fare Calculation: COK QR X/DOH QR X/SEA QR PDX Q Fare: INR 183535
COKPDX30.00 937.03QR X/SEA QR X/DOH QR COK Q
PDXCOK30.00 937.03NUC1934.06END ROE94.895136 XF
SEA4.5PDX4.5SEA4.5
Form of payment: EXT Taxes: INR 673IN
Form of payment: AVIOS INR 72666K3
Endorsements: /C1-6 NON END/CHNG FEE PER RULE/ INR 1352P2
CHARGEABLE SEAT T AND C APPLY -BG QR INR 3146G4
INR 288PZ
INR 2234US
INR 367XA
INR 1290XF
Carrier Imposed Fees: INR 210994YQ
INR 9168YR
Total Amount: INR 494064`,
    barcodes: [],
  },
  {
    text: `LEGAL AND PASSENGER NOTICES
_
ELECTRONIC TICKET
Fare rules and fees
•Depending on the fare rules, an additional payment may apply if you modify or cancel your booking.
•To avoid no-show fees, make sure you change or cancel your booking at least 3 hours before departure.
Check-in
•Aim to arrive at the airport at least three hours before departure
•Online check-in for Qatar Airways operated flights is available up to 48 hours before departure and up to 24 hours before departure
to USA
For Legal Notices and useful links, please visit www.qatarairways.com/terms`,
    barcodes: [],
  },
];

/** The same receipt as PDFBox sorts it by position (Android): each leg's
 * names, designator and times share a line, dates on the next. */
export const QATAR_RECEIPT_PDFBOX: DocumentPage[] = [
  {
    text: `Passenger: Doe Jane Elizabeth Mr (ADT)
Booking ref:
1A/7K2ABC
AS/QWERTY
QR/7K2ABC Itinerary Printing Office:
Ticket number: 157 2100000000 - 04 QATAR AIRWAYS MOBILE, DIGITAL OFFICE,
BOMBAY
Telephone: TBA
Date: 11Jun2026
_
ELECTRONIC TICKET RECEIPT
Qatar Airways may request additional payment verification for itineraries paid for with credit cards
_
From To Flight Departure Arrival Last check-in
KOCHI COCHIN INTL DOHA HAMAD QR517 04:15 06:05
(KOCHI) INTERNATIONAL 25Jul2026 25Jul2026
Terminal: 3
Class: BCLASSIC, R Operated by: QATAR AIRWAYS
Cabin: Business Marketed by: QATAR AIRWAYS
Baggage (4): 2PC Booking status (1): OK NVA (3): 25Jan2027
Fare basis: RJINP9RE Frequent flyer number: 500000000 Duration: 04:20
Seat: 03K
_Special Service Request DOCS - PASSENGER/CREW PRIMARY TRAVEL DOCUMENT INFO - CONFIRMED
DOHA HAMAD SEATTLE SEATTLE QR719 07:50 12:25
INTERNATIONAL TACOMA INTL 25Jul2026 25Jul2026
Class: BCLASSIC, R Operated by: QATAR AIRWAYS
Cabin: Business Marketed by: QATAR AIRWAYS
Baggage (4): 2PC Booking status (1): OK NVA (3): 25Jan2027
Fare basis: RJINP9RE Frequent flyer number: 500000000 Duration: 14:35
Seat: 06J
_Special Service Request DOCS - PASSENGER/CREW PRIMARY TRAVEL DOCUMENT INFO - CONFIRMED
SEATTLE SEATTLE TACOMA PORTLAND PORTLAND QR3387 15:55 16:55
INTL INTL 25Jul2026 25Jul2026
Class: BCLASSIC, B Operated by: ALASKA
Cabin: Economy Marketed by: QATAR AIRWAYS
Baggage (4): 2PC Booking status (1): OK NVA (3): 25Jan2027
Fare basis: RJINP9RE Frequent flyer number: 500000000 Duration: 01:00
Seat:
_Special Service Request DOCS - PASSENGER/CREW PRIMARY TRAVEL DOCUMENT INFO - CONFIRMED
PORTLAND PORTLAND INTL SEATTLE SEATTLE QR2175 13:48 14:43
TACOMA INTL 01Aug2026 01Aug2026
Class: BCLASSIC, B Operated by: HORIZON AIR AS ALASKAHORIZON
Cabin: Economy Marketed by: QATAR AIRWAYS NVB (2): 28Jul2026
Baggage (4): 2PC Booking status (1): OK NVA (3): 25Jan2027
Fare basis: RJINP9RE Frequent flyer number: 500000000 Duration: 00:55
Seat:
_Special Service Request DOCS - PASSENGER/CREW PRIMARY TRAVEL DOCUMENT INFO - CONFIRMED`,
    barcodes: [QR517_BCBP],
  },
  {
    text: `SEATTLE SEATTLE TACOMA DOHA HAMAD QR720 16:25 17:00
INTL INTERNATIONAL 01Aug2026 02Aug2026
Class: BCLASSIC, R Operated by: QATAR AIRWAYS
Cabin: Business Marketed by: QATAR AIRWAYS NVB (2): 28Jul2026
Baggage (4): 2PC Booking status (1): OK NVA (3): 25Jan2027
Fare basis: RJINP9RE Frequent flyer number: 500000000 Duration: 14:35
Seat: 03K
_Special Service Request DOCS - PASSENGER/CREW PRIMARY TRAVEL DOCUMENT INFO - CONFIRMED
DOHA HAMAD KOCHI COCHIN INTL QR516 19:40 02:45
INTERNATIONAL (KOCHI) 02Aug2026 03Aug2026
Terminal: 3
Class: BCLASSIC, R Operated by: QATAR AIRWAYS
Cabin: Business Marketed by: QATAR AIRWAYS NVB (2): 28Jul2026
Baggage (4): 2PC Booking status (1): OK NVA (3): 25Jan2027
Fare basis: RJINP9RE Frequent flyer number: 500000000 Duration: 04:35
Seat: 02K
_Special Service Request DOCS - PASSENGER/CREW PRIMARY TRAVEL DOCUMENT INFO - CONFIRMED
(1) OK = Confirmed (2) NVB = Not valid before (3) NVA = Not valid after (4) Each passenger can check in a specific amount of baggage at no extra
cost as indicated on the column baggage.`,
    barcodes: [QR516_BCBP],
  },
];

/** Delta booking confirmation: one leg, dates printed without a year, and
 * PDFKit splitting words mid-glyph ("Octo\nb\ner"). */
export const DELTA_CONFIRMATION_PDFKIT: DocumentPage[] = [
  {
    text: `San Francis
co, CA
Wed, Octo
b
er 1 One Way, 3 Passengers Refunda
le
b
Confirmation #
ABCDEF
Ticket Expiration : Septemb
er 20
, 2026
LAX SFO Wed, Oc
t 1
DL1559 Boeing 737-900 Depart
4:00pm
WED, OCT 1
Los Angeles, CA (LAX)
Terminal 3
(Gate TBD)
Nonstop
On Time
LAX SFO
Duration 1h 18m
Arrive
5:18pm
WED, OCT 1
San Francis
co, CA (SFO)
Terminal 1
(Gate TBD)
Jane Elizabeth Doe
Basic Info, Contac
t & Travel Doc
uments
Mary Roe
SkyMiles® Member
No Loyalty Added
12F 12E
Delta Comfort Extra (S)
Delta Comfort Extra (S)
eTicket: #0060000000001
eTicket: #0060000000002`,
    barcodes: [],
  },
  {
    text: `Sam Roe
No Loyalty Added
12C
Delta Comfort Extra (S)
eTicket: #0060000000003
TRIP PROTECTION
A GREAT COMBINATION: YOUR TRIP + PEACE OF MIND
Congratulations! You have chosen to protect your trip with valuable Allianz Travel Insurance. Please call 1-800-419-8016 with any questions.
Our Promise to You: If you are not satisfied, you have 15 days to cancel your plan and receive a full refund of the plan
price.`,
    barcodes: [],
  },
];

/** Delta confirmation via PDFBox. */
export const DELTA_CONFIRMATION_PDFBOX: DocumentPage[] = [
  {
    text: `Confirmation #
San Francisco, CA ABCDEF
Wed, October 1 One Way, 3 Passengers Refundable
Ticket Expiration : September 20, 2026
LAX SFO Wed, Oct 1
DL1559 Boeing 737-900 Duration 1h 18m
Depart Nonstop Arrive
4:00pm 5:18pm
On Time
WED, OCT 1 WED, OCT 1
LAX SFO
Los Angeles, CA (LAX) San Francisco, CA (SFO)
Terminal 3 Terminal 1
(Gate TBD) (Gate TBD)
Jane Elizabeth Doe Mary Roe
Basic Info, Contact & Travel Documents Basic Info, Contact & Travel Documents
SkyMiles® Member No Loyalty Added
12F Delta Comfort Extra (S) 12E Delta Comfort Extra (S)
eTicket: #0060000000001 eTicket: #0060000000002
Sam Roe
12C Delta Comfort Extra (S)
eTicket: #0060000000003`,
    barcodes: [],
  },
];

/** Alaska confirmation: a spaced designator ("AS 774"), weekday dates
 * without a year, and airports only as city names next to bare codes. */
export const ALASKA_CONFIRMATION_PDFKIT: DocumentPage[] = [
  {
    text: `Alaska Airlines
S
Menu
Confirmation code
GHJKLM
San Francisco, CA SFO 1h 42min | Nonstop | 413 miles
AS 774
Las Vegas, NV LAS
Departs
Sat, Oct 4 | 03:51 PM
San Francisco, CA
San Francisco Intl.
Main (S) | 8F Jane D.
8E Mary R.
8D Sam R.
Arrives
Sat, Oct 4 | 05:33 PM
Las Vegas, NV
Harry Reid Intl.
Seat assignments are subject to change.
Starting May 7, 2025, a state-issued REAL ID-compliant license or ID card, or passport is required to fly
within the U.S. Learn more.
Jane Elizabeth
Doe
Alaska 900000000
Ticket: 0270000000001
KTN: Add
Redress: Add
Mary Roe Ticket: 0270000000002
KTN: Add
Add loyalty program number
Redress: Add`,
    barcodes: [],
  },
  {
    text: `Sam Roe Ticket: 0270000000003
KTN: Add
Add loyalty program number
Redress: Add
Link reservation`,
    barcodes: [],
  },
  {
    text: `About Alaska
Customer service
Products and services
Get deals
Feedback
Follow us
Get the app
© 2025 Alaska Airlines. All Rights Reserved`,
    barcodes: [],
  },
];

/** Alaska confirmation via PDFBox. */
export const ALASKA_CONFIRMATION_PDFBOX: DocumentPage[] = [
  {
    text: `Alaska Airlines
S Menu
Confirmation code
GHJKLM
San Francisco, CA SFO Las Vegas, NV LAS
1h 42min | Nonstop | 413 miles
AS 774
Departs Arrives
Sat, Oct 4 |  03:51 PM Sat, Oct 4 |  05:33 PM
San Francisco, CA Las Vegas, NV
San Francisco Intl. Harry Reid Intl.
Main (S) | 8F Jane D.
8E Mary R.
8D Sam R.
Seat assignments are subject to change.
Starting May 7, 2025, a state-issued REAL ID-compliant license or ID card, or passport is required to fly
within the U.S. Learn more.
Jane Elizabeth Ticket: 0270000000001
Doe KTN: Add
Alaska 900000000 Redress: Add
Mary Roe Ticket: 0270000000002
KTN: Add
Add loyalty program number Redress: Add
Sam Roe Ticket: 0270000000003
KTN: Add
Add loyalty program number Redress: Add
 Link reservation`,
    barcodes: [],
  },
];

/** American receipt: airline name and flight number on separate lines, and a
 * PDF417 that is the record locator rather than a boarding pass. */
export const AA_RECEIPT_PDFKIT: DocumentPage[] = [
  {
    text: `AA CONFIRMATION CODE: PQRSTU
Get your boarding pass faster!
Scan this barcode at any
American Airlines Self-Service
Machine.
Las Vegas to Dallas/ Fort Worth AA Confirmation Code
PQRSTU
Your confirmation code is your reservation confirmation number
and will be needed to retrieve or reference your reservation.
3 Adults
Wednesday October 8, 2025
Reservation Name
LAS/DFW
Status: Ticketed Sep 20, 2025
Total Paid:
$736.44 USD
Flight Depart Arrive
Fare Amount
American Airlines
3018
Las Vegas (LAS)
October 8, 2025 11:59 PM
Travel Time : 2 h 35 m
Class : Economy
Seat : 18F , 18E , 18D
Dallas/ Fort Worth (DFW)
October 9, 2025 04:34 AM
Booking Code : Q
Aircraft : Airbus A321neo
Adult
3 × $214.12 USD $642.36 USD
Taxes & Carrier-Imposed Fees
Taxes and Fees $94.08 USD
Carrier-Imposed Fees $0.00 USD
Flight Subtotal
$736.44 USD
Receipt
PASSENGER TICKET NUMBER FREQUENT FLYER NUMBER FARE EQUIV FARE Tax/Fee/Charge TICKET TOTAL
DOE,JANE 0010000000001 AB1X111 $214.12 USD 0.00 USD 31.36 245.48
ROE,MARY 0010000000002 CD2X222 $214.12 USD 0.00 USD 31.36 245.48
ROE,SAM 0010000000003 EF3X333 $214.12 USD 0.00 USD 31.36 245.48
Payment Type: VISA *********0000 Total $736.44 USD
Endorsements/Restrictions
REFUNDABLE
Terms and conditions:
If you’ve already begun travel, this receipt may only show portions of your trip not flown.`,
    barcodes: ['PQRSTUAR'],
  },
];

/** American receipt via PDFBox. */
export const AA_RECEIPT_PDFBOX: DocumentPage[] = [
  {
    text: `Get your boarding pass faster!
AA CONFIRMATION CODE: PQRSTU Scan this barcode at any
American Airlines Self-Service
Machine.
Las Vegas to Dallas/ Fort Worth 3 Adults Total Paid:
Wednesday October 8, 2025
$736.44 USD
AA Confirmation Code Reservation Name
PQRSTU LAS/DFW
Your confirmation code is your reservation confirmation number Status: Ticketed Sep 20, 2025
and will be needed to retrieve or reference your reservation.
Flight Depart Arrive Fare Amount
American Airlines Las Vegas (LAS) Dallas/ Fort Worth (DFW) Adult
3  × $214.12 USD $642.36 USD
3018 October 8, 2025 11:59 PM October 9, 2025 04:34 AM
Travel Time : 2 h 35 m Booking Code : Q Taxes & Carrier-Imposed Fees
Class : Economy Aircraft : Airbus A321neo
Seat : 18F , 18E , 18D
Taxes and Fees $94.08 USD
Carrier-Imposed Fees $0.00 USD
Flight Subtotal
$736.44 USD
Receipt
PASSENGER TICKET NUMBER FREQUENT FLYER NUMBER FARE EQUIV FARE Tax/Fee/Charge TICKET TOTAL
DOE,JANE 0010000000001 AB1X111 $214.12 USD 0.00 USD 31.36 245.48
ROE,MARY 0010000000002 CD2X222 $214.12 USD 0.00 USD 31.36 245.48
ROE,SAM 0010000000003 EF3X333 $214.12 USD 0.00 USD 31.36 245.48
Payment Type:   VISA    *********0000       Total $736.44 USD
Endorsements/Restrictions
REFUNDABLE`,
    barcodes: ['PQRSTUAR'],
  },
];

/** The FIRST PAGE of the same Qatar receipt as a picture — a photo of the
 * printout, read by Vision's text recogniser rather than PDFKit (page 1 of 3,
 * so 4 of the 6 legs are on it). Kept verbatim apart from the redactions,
 * including the recogniser's slips: "25Jul2026" comes back as "25Ju|2026",
 * "Booking" loses its g, and the first leg's two clocks land in the wrong
 * order. Lines arrive row-banded, the order the module produces on both
 * platforms. Regenerate with the same Vision calls the module makes:
 *
 *   swift imageprobe.swift <page.png>   (VNRecognizeText + VNDetectBarcodes)
 */
export const QATAR_RECEIPT_PHOTO: DocumentPage[] = [
  {
    text: `Going places together
oneworld
QATAR
AIRWAYS&jbüll
Passenger: Doe Jane Elizabeth Mrs (ADT)
Bookina ref:
1A/7K2ABC
AS/RWOGPX
QR/7K2ABC
Itinerary Printing Office:
Ticket number: 157 2100000000 - 04
QATAR AIRWAYS MOBILE, DIGITAL OFFICE,
BOMBAY
Telephone: TBA
Date: 11Jun2026
ELECTRONIC TICKET RECEIPT
Qatar Airways may request additional payment verification for itineraries paid for with credit cards
From
Flight
Departure
Arrival
Last check-in
QR517
06:05
KOCHI COCHIN INTL
DOHA HAMAD
04:15
(KOCHI)
INTERNATIONAL
25Ju|2026
25Ju|2026
Terminal: 3
Class: BCLASSIC, R
Operated by: QATAR AIRWAYS
Baggage (4): 2PC
Cabin: Business
Marketed by: QATAR AIRWAYS
Booking status (1): OK
NVA (3): 25Jan2027
Fare basis: RJINPORE
Frequent flyer number: 517900000
Duration: 04:20
Seat: 03K
Special Service Request
DOCS - PASSENGER/CREW PRIMARY TRAVEL DOCUMENT INFO - CONFIRMED
DOHA HAMAD
SEATTLE SEATTLE
QR719
07:50
12:25
INTERNATIONAL
TACOMA INTL
25Ju|2026
25Ju|2026
Class: BCLASSIC, R
Operated by: QATAR AIRWAYS
Cabin: Business
Marketed by: QATAR AIRWAYS
Baggage (4): 2PC
Booking status (1): OK
NVA (3): 25Jan2027
Fare basis: RJINP9RE
Frequent flyer number: 517900000
Duration: 14:35
Seat: 06J
Special Service Request
DOCS - PASSENGER/CREW PRIMARY TRAVEL DOCUMENT INFO - CONFIRMED
SEATTLE SEATTLE TACOMA PORTLAND PORTLAND
QR3387 15:55
16:55
INTL
INTL
25Ju|2026
25Ju/2026
Class: BCLASSIC, B
Operated by: ALASKA
Cabin: Economy
Marketed by: QATAR AIRWAYS
Baggage (4): 2PC
Booking status (1): OK
NVA (3): 25Jan2027
Fare basis: RJINP9RE
Frequent flyer number: 517900000
Duration: 01:00
Seat:
Special Service Request
DOCS - PASSENGER/CREW PRIMARY TRAVEL DOCUMENT INFO - CONFIRMED
PORTLAND PORTLAND INTL SEATTLE SEATTLE
QR2175 13:48
14:43
TACOMA INTL
01Aug2026 01Aug2026`,
    barcodes: [QR517_BCBP],
  },
];

/** A Finnair (Amadeus) e-ticket receipt for a five-leg trip, as pdftotext
 * lays it out — the document that first showed the reader guessing a clock
 * hour for a year ("28Nov 11:30" → 2011) and reading a London-to-London leg
 * off two of the city's airports. Its PDF417 stripe is a single-leg M1: the
 * code covers the first flight only, which is why the text still has to
 * carry the other four. Traveller and ticket numbers replaced. */
export const FINNAIR_RECEIPT: DocumentPage[] = [
  {
    text: `Itinerary
    From               To                   Flight     Class    Date Departure Arrival Resa (1) NVB(2)           NVA(3)     Last check-in Baggage (4)         Seat

    STOCKHOLM         LONDON                BA0777       O      28Nov 11:30         13:25       Ok      28Nov     28Nov                             0PC
    ARLANDA           HEATHROW
    Terminal 2        Terminal 5                                                     Fare Basis                                 OLN7T8BW/EUSI
    Operated by                                 BRITISH AIRWAYS                      Marketed by                                BRITISH AIRWAYS
    Frequent flyer number                       700000000

_
    LONDON            LAS VEGAS       AY5435   O    28Nov 16:05                     18:50       Ok      28Nov     28Nov           15:20             0PC
    HEATHROW          HARRY REID INTL
    Terminal 5        Terminal 3                                                     Fare Basis                                 OLN7T8BW/EUSI
    Operated by                         BRITISH AIRWAYS                              Marketed by                                FINNAIR
    Frequent flyer number               700000000

_
    LAS VEGAS         LOS ANGELES           AY4121       O      04Dec 12:00         13:20       Ok      04Dec     04Dec           10:45             0PC
    HARRY REID INTL LOS ANGELES
                      INTL
    Terminal 1        Terminal 0                                                     Fare Basis                                 OLN7T8BW/EUSI
    Operated by                                 AMERICAN AIRLINES                    Marketed by                                FINNAIR
    Frequent flyer number                       700000000

_
    LOS ANGELES       HELSINKI              AY0002       O      04Dec 18:50         15:20       Ok      04Dec     04Dec           17:50             0PC
    LOS ANGELES       HELSINKI
    INTL              VANTAA
    Terminal B                                                                       Fare Basis                                 OLN7T8BW/EUSI
    Operated by                                 FINNAIR                              Marketed by                                FINNAIR
    Frequent flyer number                       700000000                            Arrival Day+1

_
    HELSINKI           STOCKHOLM            AY0815       O      05Dec 16:50         16:55       Ok      05Dec     05Dec           16:05             0PC
    HELSINKI           ARLANDA
    VANTAA
                      Terminal 2                                                     Fare Basis                                 OLN7T8BW/EUSI
    Operated by                                 FINNAIR                              Marketed by                                FINNAIR
    Frequent flyer number                       700000000

_

(1) Ok = confirmed (2) NVB = Not valid before (3) NVA = Not valid after (4)Each passenger can check in a specific amount of baggage at no extra cost as indicated
above in the column baggage.


Baggage Policy

ARNLAS
1st Checked Bag:                                       86.82EUR                        BAG MAX 23KG 51LB 208LCM 81LI

2nd Checked Bag:                                       104.19EUR                       BAG MAX 23KG 51LB 208LCM 81LI

LASARN

1st Checked Bag:                                       86.82EUR                        BAG MAX 23KG 51LB 208LCM 81LI

2nd Checked Bag:                                       104.19EUR                       BAG MAX 23KG 51LB 208LCM 81LI
CARRY-ON BAG:
ARNLHR: MAX         2PC      Free of Charge                     HANDBAG UPTO 40 X 30 X 15CM AND/OR CABIN BAG UPTO 56 X 45 X 25CM
LHRLAS: MAX`,
    barcodes: ['M1TRAVELLER/EXAMPLE MRE9ITC7L ARNLHRBA 0777 332O000 0000 043>218   0000I                251051234567890'],
  },
];

/** The PDF417 on an Emirates e-ticket receipt is not a boarding pass: it is
 * IATA's e-ticket record — an 'E', then the 13-digit ticket number (airline
 * accounting code + document number) and four more digits ("0201" on a
 * single ticket, "0202" on a two-document conjunction ticket) — repeated
 * three times across the stripe. No route, no flight, no date. */
const EK_ETICKET_STRIPE =
  'E                                           17624000000010201                      17624000000010201                      17624000000010201';
const EK_ETICKET_CONJUNCTION_STRIPE =
  'E                                           17624000001010202                      17624000001010202                      17624000001010202';

/** Emirates e-ticket receipt (UMC / Apache FOP), three legs on one ticket,
 * the last operated by Finnair — iOS row-ordered text. Two of its lines are
 * printed on leading tighter than the glyph band, so the reader interleaves
 * them ("A08rrAivparl2026" is "Arrival" over "08Apr2026"): the layout the
 * parser has to survive, not a transcription error. PDFKit hands back no
 * text at all for the legal-notices page. Traveller, agent, ticket and
 * booking numbers replaced. */
export const EMIRATES_RECEIPT_PDFKIT: DocumentPage[] = [
  {
    text: `Ticket number: 176 2400000001
Ticket & receipt  Scan the bar code or use the ticket number above at
the self check-in points in the airport.
Passenger name  Issued by / Date
DJOAENE/MS  A04GATP 8R612345678E4K5W AWEWWW DUBAI / EMIRATES IBE
Your booking reference: PLQWTZ
Your ticket is stored in our booking system. This receipt is your record  Check with your departure airport for restrictions on the carriage of
of your ticket and is part of your conditions of carriage. For more  liquids, aerosols and gels in hand baggage and check your visa
information you can read the notices and conditions of carriage.  requirements.
You might need to show this receipt to enter the airport or to prove  Please check our Dangerous Goods information to find out what you
your return or onwards travel to immigration.  can and can’t bring on board. Some substances and certain items are
restricted, like portable electronic devices, spare batteries or smart
bags.
............................................................................................................................................................................................................................................................................................................................................
Caihrpeocrkt sin y oatu  tnheee adir tpoo artr.r iAvte  m3 ohsoturs  9th0r omuignhu tpeass bsepfoorrte c toankter-ool.ff go  6re0a mdyin autt ethse b geafotere ( Ptarekme-ioufmf be  4re5a mdyin autt ethse b geafotere ( Ftiarkste -Colfafs bse,
before departure, but it can be  Economy, Economy Class).  Business Class).
up to 4 hours to complete all the
travel requirements. Please check
the best time to arrive for your
journey below.
Your travel information
All times shown are local for each city
Departing » From Kochi (Cochin), India
Leg 1 of 3 | Kochi (COK) to Dubai (DXB) | Operated by Emirates (equipment owner - Emirates)
Flight  Check-in at  Departure  KOCHI (COCHIN)
EK 533  08Apr2026  08Apr2026
Economy  00:30  04:30  DT3e pNaerwtin Tge CrmOiKna, lKochi International Airport
Saver
Seat  Status  A08rrAivparl2026  DUBAI
Confirmed
06:50  ATerrrimviinnga lD 3XB, Dubai International Airport
Coupon validity: not before 08Apr2026 / not after 08Apr2026   Baggage 25Kgs
Leg 2 of 3 | Dubai (DXB) to Brussels (BRU) | Operated by Emirates (equipment owner - Emirates)
Flight  Check-in at  Departure  DUBAI
EK 181  08Apr2026  08Apr2026
Economy  10:20  13:20  Departing DXB, Dubai International Airport
Saver  Terminal 3
Seat  Status  A08rrAivparl2026  BRUSSELS
Confirmed
19:30  Arriving BRU, Brussels Airport
Coupon validity: not before 08Apr2026 / not after 08Apr2026   Baggage 25Kgs
© Emirates. All rights reserved   Emirates Experience | Check-in Online | Manage a Booking | Baggage | Contact us   Page 1 of 3`,
    barcodes: [EK_ETICKET_STRIPE],
  },
  {
    text: `Ticket number: 176 2400000001
Scan the bar code or use the ticket number above at
the self check-in points in the airport.
Leg 3 of 3 | Brussels (BRU) to Helsinki (HEL) | Operated by Finnair Oyj (equipment owner - Nordic Regional Airlines )
Flight  Check-in at  Departure
09Apr2026  09Apr2026  BRUSSELS
AY 1550
Economy  03:00  06:30  Departing BRU, Brussels Airport
Seat  Status  A09rrAivparl2026  HELSINKI
Confirmed
10:00  Arriving HEL, Helsinki Airport
Coupon validity: not before 09Apr2026 / not after 09Apr2026   Baggage 25Kgs
Baggage allowance  Emirates Skywards  Dining  Young flyers
Enjoy discounted rates when you  Earn Miles on every flight and  Explore the world in every bite of  Kids get top flight treatment with
purchase extra baggage online.  enjoy a world of benefits.  our regionally inspired meals.  packs, special meals and more.
Fare information
Fare  Equivalent fare  Taxes / Fees / Charges (TFC)  Total fare (Incl. TFC)  Form of payment
INR43170  -  INR11916-YQ INR3718-BE  INR64945  CREDIT CARD
INR1268-F6 INR673-IN INR2755-K3
INR1318-P2 INR127-ZR
Fare calculation
COK EK X/DXB EK X/BRU AY HEL465.85QAAOPIN1/EOL4 Q COKHEL3.25NUC469.10END ROE92.025496
Additional information
NON-END/SAVER/REWARD UPGDS ALLOWED
© Emirates. All rights reserved   Emirates Experience | Check-in Online | Manage a Booking | Baggage | Contact us   Page 2 of 3`,
    barcodes: [EK_ETICKET_STRIPE],
  },
  {
    text: `Ticket number: 176 2400000001
Scan the bar code or use the ticket number above at
the self check-in points in the airport.
Hazardous materials and substance control policy
The carriage of certain hazardous materials like aerosols, fireworks and inflammable liquids aboard the aircraft is forbidden. Personal motorised vehicles such as
hoverboards, mini-Segways and smart or self-balancing wheels, are also forbidden on our flights as they contain large lithium batteries. For safety reasons, we can’t accept
these as part of checked-in baggage or as hand luggage. If you do not understand this restriction, further information may be obtained from your airline.
The United Arab Emirates (UAE) has a very strict, zero-tolerance, anti-drugs policy. All airports within the UAE conduct thorough searches using highly
sensitive equipment. Possession of any amounts of illegal drugs by travellers entering or transiting the UAE will be subject to punishment.
Emirates cabin baggage allowances
Economy Class:
One piece of carry-on baggage is permitted with maximum dimensions: 55 x 38 x 22cm (22 x 15 x 8 inches) and maximum weight: 7kg (15lb).
Note: If you’re boarding in India, your carry-on baggage may not exceed 115cm or 45.3 inches (length + width + height). If your itinerary originates from Brazil, you’re
allowed a carry-on weighing 10kg (22lb).
Premium Economy:
One piece of carry-on baggage is permitted with maximum dimensions: 55 x 38 x 22cm (22 x 15 x 8 inches) and maximum weight: 10kg (22lb).
Note: If you're boarding in India, your carry-on baggage may not exceed 115cm or 45.3 inches (length + width + height).
First Class and Business Class:
Two pieces of carry-on baggage permitted: one briefcase plus either one handbag or one garment bag. The briefcase may not exceed 45 x 35 x 20cm (18 x 14 x 8 inches);
the handbag may not exceed 55 x 38 x 22cm (22 x 15 x 8 inches); the garment bag can be no more than 20cm (8 inches) thick when folded. The weight of each piece must
not exceed 7kg (15lb). The total combined weight of both pieces may not be more than 14kg (30lb).
Infants in all cabin classes are permitted one checked-in bag that may not exceed 55 x 38 x 22 cm (22 x 15 x 8 inches) in size and 23kg (50lb) where the piece concept
applies, or 10kg (22lb) where the weight concept applies. In addition, customers travelling with infants (and without a child seat) are permitted to bring one carry-cot or one
fully collapsible stroller into the cabin if there is room. If there is no space for these items in the cabin, they will have to be checked. However, if checked, they will not count
against your baggage allowance.
Emirates checked baggage notification
Checked baggage allowances vary by fare type and class of travel. Additional baggage allowances may apply based on your Skywards tier. Make sure to add your
frequent flyer number through Manage your booking to see your total checked baggage allowance. Please note that any individual item weighing more than 32kg cannot be
accepted, for health and safety reasons.
S
ca
n  t  Ti  Inflight entertainment
the  ck
he  b  e
sear  t  Fall in love with a classic romance or immerse yourself in
lf  co  nu
chde  m  the latest edge-of-the-seat blockbuster - let our ice inflight
ec  or  b  entertainment take you to places you won't find on a map.
k-i  u  er
n  pse  :1  Choose from over 6,500 channels of movies, TV shows and
oith  7  music from around the world and in multiple languages. Or
ntse  ti  6
inck  2  challenge other passengers to a range of gripping games.
thet  20
e  nu  8
airm  7
pobe  10
rt.r  a  6
bo  1
ve  9
at
© Emirates. All rights reserved   Emirates Experience | Check-in Online | Manage a Booking | Baggage | Contact us   Page 3 of 3`,
    barcodes: [EK_ETICKET_STRIPE],
  },
];

/** The same Emirates receipt as PDFBox sorts it by position (Android). The
 * legal-notices page is cut to its header. */
export const EMIRATES_RECEIPT_PDFBOX: DocumentPage[] = [
  {
    text: `Ticket number: 176 2400000001
Ticket & receipt Scan the bar code or use the ticket number above at
the self check-in points in the airport.
Passenger name Issued by / Date
DOE/ AGT 12345678 AE
JANEMS 04APR2026EKWWWWW DUBAI / EMIRATES IBE
Your booking reference: PLQWTZ
Your ticket is stored in our booking system. This receipt is your record Check with your departure airport for restrictions on the carriage of
of your ticket and is part of your conditions of carriage. For more liquids, aerosols and gels in hand baggage and check your visa
information you can read the notices and conditions of carriage. requirements.
You might need to show this receipt to enter the airport or to prove Please check our Dangerous Goods information to find out what you
your return or onwards travel to immigration. can and can’t bring on board. Some substances and certain items are
restricted, like portable electronic devices, spare batteries or smart
bags.
............................................................................................................................................................................................................................................................................................................................................
Check in at the airport. At most 90 minutes before take-off go 60 minutes before take-off be 45 minutes before take-off be
airports you need to arrive 3 hours through passport control. ready at the gate (Premium ready at the gate (First Class,
before departure, but it can be Economy, Economy Class). Business Class).
up to 4 hours to complete all the
travel requirements. Please check
the best time to arrive for your
journey below.
Your travel information
All times shown are local for each city
Departing » From Kochi (Cochin), India
Leg 1 of 3 | Kochi  (COK) to Dubai  (DXB) | Operated by Emirates (equipment owner - Emirates)
Flight Check-in at Departure
EK 533 08Apr2026 08Apr2026 KOCHI (COCHIN)
Economy 00:30 04:30 Departing COK, Kochi International Airport
T3 New Terminal
Saver
Seat Status Arrival
Confirmed 08Apr2026 DUBAI
06:50 Arriving DXB, Dubai International Airport
Terminal 3
Coupon validity: not before 08Apr2026 /  not after 08Apr2026  Baggage 25Kgs
Leg 2 of 3 | Dubai  (DXB) to Brussels  (BRU) | Operated by Emirates (equipment owner - Emirates)
Flight Check-in at Departure
EK 181 08Apr2026 08Apr2026 DUBAI
Economy 10:20 13:20 Departing DXB, Dubai International Airport
Terminal 3
Saver
Seat Status Arrival
Confirmed 08Apr2026 BRUSSELS
19:30 Arriving BRU, Brussels Airport
Coupon validity: not before 08Apr2026 /  not after 08Apr2026  Baggage 25Kgs
© Emirates. All rights reserved Emirates Experience | Check-in Online | Manage a Booking | Baggage | Contact us Page 1 of 3`,
    barcodes: [EK_ETICKET_STRIPE],
  },
  {
    text: `Ticket number: 176 2400000001
Scan the bar code or use the ticket number above at
the self check-in points in the airport.
Leg 3 of 3 | Brussels  (BRU) to Helsinki  (HEL) | Operated by Finnair Oyj (equipment owner - Nordic Regional Airlines )
Flight Check-in at Departure
AY 1550 09Apr2026 09Apr2026 BRUSSELS
Economy 03:00 06:30 Departing BRU, Brussels Airport
Seat Status Arrival
Confirmed 09Apr2026 HELSINKI
10:00 Arriving HEL, Helsinki Airport
Coupon validity: not before 09Apr2026 /  not after 09Apr2026  Baggage 25Kgs
Baggage allowance Emirates Skywards Dining Young flyers
Enjoy discounted rates when you Earn Miles on every flight and Explore the world in every bite of Kids get top flight treatment with
purchase extra baggage online. enjoy a world of benefits. our regionally inspired meals. packs, special meals and more.
Fare information
Fare Equivalent fare Taxes / Fees / Charges (TFC) Total fare (Incl. TFC) Form of payment
INR43170 - INR11916-YQ INR3718-BE INR64945 CREDIT CARD
INR1268-F6 INR673-IN INR2755-K3
INR1318-P2 INR127-ZR
Fare calculation
COK EK X/DXB EK X/BRU AY HEL465.85QAAOPIN1/EOL4 Q COKHEL3.25NUC469.10END ROE92.025496
Additional information
NON-END/SAVER/REWARD UPGDS ALLOWED
© Emirates. All rights reserved Emirates Experience | Check-in Online | Manage a Booking | Baggage | Contact us Page 2 of 3`,
    barcodes: [EK_ETICKET_STRIPE],
  },
  {
    text: `Ticket number: 176 2400000001
Scan the bar code or use the ticket number above at
the self check-in points in the airport.`,
    barcodes: [EK_ETICKET_STRIPE],
  },
];

/** A second Emirates receipt: a conjunction ticket (two documents), four
 * legs across two pages, an overnight leg (DFW → DXB lands the next day),
 * seats assigned, Skywards number printed — iOS row-ordered text. */
export const EMIRATES_CONJUNCTION_PDFKIT: DocumentPage[] = [
  {
    text: `Ticket number: 176 2400000101-02
Ticket & receipt  Scan the bar code or use the ticket number above at
the self check-in points in the airport.
Passenger name  Emirates Skywards number  Issued by / Date
DJOAENE/MS  EK500000001  A31GATU 8G612345678E4K5 WAEWWWW DUBAI / EMIRATES IBE
Membership Tier
BLUE
Your booking reference: RX4TQ7
Your ticket is stored in our booking system. This receipt is your record  Check with your departure airport for restrictions on the carriage of
of your ticket and is part of your conditions of carriage. For more  liquids, aerosols and gels in hand baggage and check your visa
information you can read the notices and conditions of carriage.  requirements.
You might need to show this receipt to enter the airport or to prove  Please check our Dangerous Goods information to find out what you
your return or onwards travel to immigration.  can and can’t bring on board. Some substances and certain items are
restricted, like portable electronic devices, spare batteries or smart
bags.
............................................................................................................................................................................................................................................................................................................................................
Check in online, or  90 minutes  60 minutes  45 minutes
Check in at the airport. At most  90 minutes before take-off go  60 minutes before take-off be  45 minutes before take-off be
airports you need to arrive 3 hours  through passport control.  ready at the gate (Premium  ready at the gate (First Class,
before departure, but it can be  Economy, Economy Class).  Business Class).
utrpa vteol  4re hqouuirresm teon ctso.m Ppleleatsee a cllh tehcek
the best time to arrive for your
journey below.
Your travel information
All times shown are local for each city
Departing » From Kochi (Cochin), India
Leg 1 of 4 | Kochi (COK) to Dubai (DXB) | Operated by Emirates (equipment owner - Emirates)
Flight  Check-in at  Departure
27Sep2025  27Sep2025  KOCHI (COCHIN)
EK 533  00:25  04:25  Departing COK, Kochi International Airport
Economy  T3 New Terminal
Saver
Seat  Status  Arrival
29K  Confirmed  27Sep2025  DUBAI
06:50  Arriving DXB, Dubai International Airport
Terminal 3
Coupon validity: not before 27Sep2025 / not after 27Sep2025   Baggage 2Piece
Leg 2 of 4 | Dubai (DXB) to Los Angeles (LAX) | Operated by Emirates (equipment owner - Emirates)
Flight  Check-in at  Departure
27Sep2025  27Sep2025  DUBAI
EK 215  05:55  08:55  Departing DXB, Dubai International Airport
Economy  Terminal 3
Saver
Seat  Status  Arrival
63K  Confirmed  27Sep2025  LOS ANGELES
14:15  Arriving LAX, Los Angeles International Airport
Tom Bradley International
Coupon validity: not before 27Sep2025 / not after 27Sep2025   Baggage 2Piece
© Emirates. All rights reserved   Emirates Experience | Check-in Online | Manage a Booking | Baggage | Contact us   Page 1 of 4`,
    barcodes: [EK_ETICKET_CONJUNCTION_STRIPE],
  },
  {
    text: `Ticket number: 176 2400000101-02
Scan the bar code or use the ticket number above at
the self check-in points in the airport.
Your travel information
All times shown are local for each city
Departing » From Dallas, United States
Leg 3 of 4 | Dallas (DFW) to Dubai (DXB) | Operated by Emirates (equipment owner - Emirates)
Flight  Check-in at  Departure
11Oct2025  11Oct2025  DALLAS
EK 222
08:15  12:15  Departing DFW, Dallas/Fort Worth International Airport
Economy  Terminal D
Saver
Seat  Status  Arrival  DUBAI
39H  Confirmed  12Oct2025
Arriving DXB, Dubai International Airport
12:00  Terminal 3
Coupon validity: not before 11Oct2025 / not after 11Oct2025   Baggage 2Piece
Leg 4 of 4 | Dubai (DXB) to Kochi (COK) | Operated by Emirates (equipment owner - Emirates)
Flight  Check-in at  Departure
DUBAI
EK 530  13Oct2025  13Oct2025
00:20  03:20  Departing DXB, Dubai International Airport
Economy  Terminal 3
Saver
Seat  Status  Arrival
Confirmed  13Oct2025  KOCHI (COCHIN)
28H
08:55  Arriving COK, Kochi International Airport
T3 New Terminal
Coupon validity: not before 13Oct2025 / not after 13Oct2025   Baggage 2Piece
Fare information
Fare  Equivalent fare  Taxes / Fees / Charges (TFC)  Total fare (Incl. TFC)  Form of payment
INR90490  -  INR1241-P2 INR673-IN INR2148-F6  490MILES + INR146667  MILES CREDIT CARD
INR240-ZR INR4014-US INR631-YC
INR614-XY INR325-XA INR6488-K3
INR39252-YQ INR491-AY INR395-
XF
Fare calculation
COK EK X/DXB EK LAX520.64LWAAPIN1/EOL4 /-DFW EK X/DXB EK COK530.34QWAAPIN1/EOL4 Q COKCOK3.49NUC1054.47 XF DFWINR4.5END ROE85.811526
Additional information
FQEK500000001 NON-END/SAVER/REWARD UPGDS ALLOWED
© Emirates. All rights reserved   Emirates Experience | Check-in Online | Manage a Booking | Baggage | Contact us   Page 2 of 4`,
    barcodes: [EK_ETICKET_CONJUNCTION_STRIPE],
  },
  {
    text: `Ticket number: 176 2400000101-02
Scan the bar code or use the ticket number above at
the self check-in points in the airport.
Baggage allowance
Passenger type  Route  Baggage allowance
ADULT  EK COKLAX 2PC  BAG 1 NO FEE UPTO50LB 23KG MAX59IN 150CM
BAG 2 NO FEE UPTO50LB 23KG MAX59IN 150CM
BAG 3 19715 INR UPTO50LB 23KG MAX59IN 150CM
HTTPS://WWW.EMIRATES.COM/ENGLISH/BEFORE-YOU-FLY/BAGGAGE/
Passenger type  Route  Baggage allowance
ADULT  EK DFWCOK 2PC  BAG 1 NO FEE UPTO50LB 23KG MAX59IN 150CM
BAG 2 NO FEE UPTO50LB 23KG MAX59IN 150CM
BAG 3 19715 INR UPTO50LB 23KG MAX59IN 150CM
HTTPS://WWW.EMIRATES.COM/ENGLISH/BEFORE-YOU-FLY/BAGGAGE/
Passenger type  Route  Carry on baggage
ADULT  EK COKDXB 1PC  BAG 1 NO FEE CARRY7KG 15LB UPTO45LI 115LCM
Passenger type  Route  Carry on baggage
ADULT  EK DXBLAX 1PC  BAG 1 NO FEE CARRY7KG 15LB UPTO45LI 115LCM
Passenger type  Route  Carry on baggage
ADULT  EK DFWDXB 1PC  BAG 1 NO FEE CARRY7KG 15LB UPTO45LI 115LCM
Passenger type  Route  Carry on baggage
ADULT  EK DXBCOK 1PC  BAG 1 NO FEE CARRY7KG 15LB UPTO45LI 115LCM
If you go over the baggage allowance you may be charged. If you purchase extra baggage on emirates.com, you could get a discount. Alternatively you can pay for any extra baggage
charges at check-in. For more information please visit our baggage section.
Hazardous materials and substance control policy
The carriage of certain hazardous materials like aerosols, fireworks and inflammable liquids aboard the aircraft is forbidden. Personal motorised vehicles such as
hoverboards, mini-Segways and smart or self-balancing wheels, are also forbidden on our flights as they contain large lithium batteries. For safety reasons, we can’t accept
these as part of checked-in baggage or as hand luggage. If you do not understand this restriction, further information may be obtained from your airline.
The United Arab Emirates (UAE) has a very strict, zero-tolerance, anti-drugs policy. All airports within the UAE conduct thorough searches using highly
sensitive equipment. Possession of any amounts of illegal drugs by travellers entering or transiting the UAE will be subject to punishment.
Emirates cabin baggage allowances
Economy Class:
One piece of carry-on baggage is permitted with maximum dimensions: 55 x 38 x 22cm (22 x 15 x 8 inches) and maximum weight: 7kg (15lb).
Note: If you’re boarding in India, your carry-on baggage may not exceed 115cm or 45.3 inches (length + width + height). If your itinerary originates from Brazil, you’re
allowed a carry-on weighing 10kg (22lb).
Premium Economy:
One piece of carry-on baggage is permitted with maximum dimensions: 55 x 38 x 22cm (22 x 15 x 8 inches) and maximum weight: 10kg (22lb).
Note: If you're boarding in India, your carry-on baggage may not exceed 115cm or 45.3 inches (length + width + height).
First Class and Business Class:
Two pieces of carry-on baggage permitted: one briefcase plus either one handbag or one garment bag. The briefcase may not exceed 45 x 35 x 20cm (18 x 14 x 8 inches);
the handbag may not exceed 55 x 38 x 22cm (22 x 15 x 8 inches); the garment bag can be no more than 20cm (8 inches) thick when folded. The weight of each piece must
not exceed 7kg (15lb). The total combined weight of both pieces may not be more than 14kg (30lb).
Infants in all cabin classes are permitted one checked-in bag: maximum weight 23kg (50lb) with total dimensions (length + width + height) not exceeding 115cm (45 inches)
and one carry-on bag for inflight food and disposable items (weight not to exceed 5kg (11lb) and maximum dimensions: 55 x 38 x 22cm (22 x 15 x 8 inches).
© Emirates. All rights reserved   Emirates Experience | Check-in Online | Manage a Booking | Baggage | Contact us   Page 3 of 4`,
    barcodes: [EK_ETICKET_CONJUNCTION_STRIPE],
  },
  {
    text: `Ticket number: 176 2400000101-02
Scan the bar code or use the ticket number above at
the self check-in points in the airport.
S
can  Ti
th  ck  Inflight entertainment
thee  b  et
sear  nu  Fall in love with a classic romance or immerse yourself in
lf  ccod  m
hee  be  the latest edge-of-the-seat blockbuster - let our ice inflight
ck-or  u  r:1  entertainment take you to places you won't find on a map.
in  se  7  Choose from over 6,500 channels of movies, TV shows and
poi  the  6  music from around the world and in multiple languages. Or
nts  tic  23
in  tke  9  challenge other passengers to a range of gripping games.
het  n  32
airum  35
porber  4
t.  ab  67
ov  -6
e  a  8
t
© Emirates. All rights reserved   Emirates Experience | Check-in Online | Manage a Booking | Baggage | Contact us   Page 4 of 4`,
    barcodes: [EK_ETICKET_CONJUNCTION_STRIPE],
  },
];

/** The conjunction receipt via PDFBox. */
export const EMIRATES_CONJUNCTION_PDFBOX: DocumentPage[] = [
  {
    text: `Ticket number: 176 2400000101-02
Ticket & receipt Scan the bar code or use the ticket number above at
the self check-in points in the airport.
Passenger name Emirates Skywards number Issued by / Date
DOE/ EK500000001 AGT 12345678 AE
JANEMS 31AUG2025EKWWWWW DUBAI / EMIRATES IBE
Membership Tier
BLUE
Your booking reference: RX4TQ7
Your ticket is stored in our booking system. This receipt is your record Check with your departure airport for restrictions on the carriage of
of your ticket and is part of your conditions of carriage. For more liquids, aerosols and gels in hand baggage and check your visa
information you can read the notices and conditions of carriage. requirements.
You might need to show this receipt to enter the airport or to prove Please check our Dangerous Goods information to find out what you
your return or onwards travel to immigration. can and can’t bring on board. Some substances and certain items are
restricted, like portable electronic devices, spare batteries or smart
bags.
............................................................................................................................................................................................................................................................................................................................................
Check in online, or 90 minutes 60 minutes 45 minutes
Check in at the airport. At most 90 minutes before take-off go 60 minutes before take-off be 45 minutes before take-off be
airports you need to arrive 3 hours through passport control. ready at the gate (Premium ready at the gate (First Class,
before departure, but it can be Economy, Economy Class). Business Class).
up to 4 hours to complete all the
travel requirements. Please check
the best time to arrive for your
journey below.
Your travel information
All times shown are local for each city
Departing » From Kochi (Cochin), India
Leg 1 of 4 | Kochi  (COK) to Dubai  (DXB) | Operated by Emirates (equipment owner - Emirates)
Flight Check-in at Departure
EK 533 27Sep2025 27Sep2025 KOCHI (COCHIN)
Economy 00:25 04:25 Departing COK, Kochi International Airport
T3 New Terminal
Saver
Seat Status Arrival
29K Confirmed 27Sep2025 DUBAI
06:50 Arriving DXB, Dubai International Airport
Terminal 3
Coupon validity: not before 27Sep2025 /  not after 27Sep2025  Baggage 2Piece
Leg 2 of 4 | Dubai  (DXB) to Los Angeles  (LAX) | Operated by Emirates (equipment owner - Emirates)
Flight Check-in at Departure
EK 215 27Sep2025 27Sep2025 DUBAI
Economy 05:55 08:55 Departing DXB, Dubai International Airport
Terminal 3
Saver
Seat Status Arrival
63K Confirmed 27Sep2025 LOS ANGELES
14:15 Arriving LAX, Los Angeles International Airport
Tom Bradley International
Coupon validity: not before 27Sep2025 /  not after 27Sep2025  Baggage 2Piece
© Emirates. All rights reserved Emirates Experience | Check-in Online | Manage a Booking | Baggage | Contact us Page 1 of 4`,
    barcodes: [EK_ETICKET_CONJUNCTION_STRIPE],
  },
  {
    text: `Ticket number: 176 2400000101-02
Scan the bar code or use the ticket number above at
the self check-in points in the airport.
Your travel information
All times shown are local for each city
Departing » From Dallas, United States
Leg 3 of 4 | Dallas  (DFW) to Dubai  (DXB) | Operated by Emirates (equipment owner - Emirates)
Flight Check-in at Departure
EK 222 11Oct2025 11Oct2025 DALLAS
Economy 08:15 12:15 Departing DFW, Dallas/Fort Worth International Airport
Terminal D
Saver
Seat Status Arrival
39H Confirmed 12Oct2025 DUBAI
12:00 Arriving DXB, Dubai International Airport
Terminal 3
Coupon validity: not before 11Oct2025 /  not after 11Oct2025  Baggage 2Piece
Leg 4 of 4 | Dubai  (DXB) to Kochi  (COK) | Operated by Emirates (equipment owner - Emirates)
Flight Check-in at Departure
EK 530 13Oct2025 13Oct2025 DUBAI
Economy 00:20 03:20 Departing DXB, Dubai International Airport
Terminal 3
Saver
Seat Status Arrival
28H Confirmed 13Oct2025 KOCHI (COCHIN)
08:55 Arriving COK, Kochi International Airport
T3 New Terminal
Coupon validity: not before 13Oct2025 /  not after 13Oct2025  Baggage 2Piece
Fare information
Fare Equivalent fare Taxes / Fees / Charges (TFC) Total fare (Incl. TFC) Form of payment
INR90490 - INR1241-P2 INR673-IN INR2148-F6 490MILES + INR146667 MILES CREDIT CARD
INR240-ZR INR4014-US INR631-YC
INR614-XY INR325-XA INR6488-K3
INR39252-YQ INR491-AY INR395-
XF
Fare calculation
COK EK X/DXB EK LAX520.64LWAAPIN1/EOL4 /-DFW EK X/DXB EK COK530.34QWAAPIN1/EOL4 Q COKCOK3.49NUC1054.47 XF DFWINR4.5END ROE85.811526
Additional information
FQEK500000001 NON-END/SAVER/REWARD UPGDS ALLOWED
© Emirates. All rights reserved Emirates Experience | Check-in Online | Manage a Booking | Baggage | Contact us Page 2 of 4`,
    barcodes: [EK_ETICKET_CONJUNCTION_STRIPE],
  },
  {
    text: `Ticket number: 176 2400000101-02
Scan the bar code or use the ticket number above at
the self check-in points in the airport.
Baggage allowance
Passenger type Route Baggage allowance
ADULT EK COKLAX 2PC BAG 1 NO FEE UPTO50LB 23KG MAX59IN 150CM
BAG 2 NO FEE UPTO50LB 23KG MAX59IN 150CM
BAG 3 19715 INR UPTO50LB 23KG MAX59IN 150CM
HTTPS://WWW.EMIRATES.COM/ENGLISH/BEFORE-YOU-FLY/BAGGAGE/
Passenger type Route Baggage allowance
ADULT EK DFWCOK 2PC BAG 1 NO FEE UPTO50LB 23KG MAX59IN 150CM
BAG 2 NO FEE UPTO50LB 23KG MAX59IN 150CM
BAG 3 19715 INR UPTO50LB 23KG MAX59IN 150CM
HTTPS://WWW.EMIRATES.COM/ENGLISH/BEFORE-YOU-FLY/BAGGAGE/
Passenger type Route Carry on baggage
ADULT EK COKDXB 1PC BAG 1 NO FEE CARRY7KG 15LB UPTO45LI 115LCM
Passenger type Route Carry on baggage
ADULT EK DXBLAX 1PC BAG 1 NO FEE CARRY7KG 15LB UPTO45LI 115LCM
Passenger type Route Carry on baggage
ADULT EK DFWDXB 1PC BAG 1 NO FEE CARRY7KG 15LB UPTO45LI 115LCM
Passenger type Route Carry on baggage
ADULT EK DXBCOK 1PC BAG 1 NO FEE CARRY7KG 15LB UPTO45LI 115LCM
If you go over the baggage allowance you may be charged. If you purchase extra baggage on emirates.com, you could get a discount. Alternatively you can pay for any extra baggage
charges at check-in. For more information please visit our baggage section.
Hazardous materials and substance control policy
The carriage of certain hazardous materials like aerosols, fireworks and inflammable liquids aboard the aircraft is forbidden. Personal motorised vehicles such as
hoverboards, mini-Segways and smart or self-balancing wheels, are also forbidden on our flights as they contain large lithium batteries. For safety reasons, we can’t accept
these as part of checked-in baggage or as hand luggage. If you do not understand this restriction, further information may be obtained from your airline.
The United Arab Emirates (UAE) has a very strict, zero-tolerance, anti-drugs policy. All airports within the UAE conduct thorough searches using highly
sensitive equipment. Possession of any amounts of illegal drugs by travellers entering or transiting the UAE will be subject to punishment.
Emirates cabin baggage allowances
Economy Class:
One piece of carry-on baggage is permitted with maximum dimensions: 55 x 38 x 22cm (22 x 15 x 8 inches) and maximum weight: 7kg (15lb).
Note: If you’re boarding in India, your carry-on baggage may not exceed 115cm or 45.3 inches (length + width + height). If your itinerary originates from Brazil, you’re
allowed a carry-on weighing 10kg (22lb).
Premium Economy:
One piece of carry-on baggage is permitted with maximum dimensions: 55 x 38 x 22cm (22 x 15 x 8 inches) and maximum weight: 10kg (22lb).
Note: If you're boarding in India, your carry-on baggage may not exceed 115cm or 45.3 inches (length + width + height).
First Class and Business Class:
Two pieces of carry-on baggage permitted: one briefcase plus either one handbag or one garment bag. The briefcase may not exceed 45 x 35 x 20cm (18 x 14 x 8 inches);
the handbag may not exceed 55 x 38 x 22cm (22 x 15 x 8 inches); the garment bag can be no more than 20cm (8 inches) thick when folded. The weight of each piece must
not exceed 7kg (15lb). The total combined weight of both pieces may not be more than 14kg (30lb).
Infants in all cabin classes are permitted one checked-in bag: maximum weight 23kg (50lb) with total dimensions (length + width + height) not exceeding 115cm (45 inches)
and one carry-on bag for inflight food and disposable items (weight not to exceed 5kg (11lb) and maximum dimensions: 55 x 38 x 22cm (22 x 15 x 8 inches).
© Emirates. All rights reserved Emirates Experience | Check-in Online | Manage a Booking | Baggage | Contact us Page 3 of 4`,
    barcodes: [EK_ETICKET_CONJUNCTION_STRIPE],
  },
  {
    text: `Ticket number: 176 2400000101-02
Scan the bar code or use the ticket number above at
the self check-in points in the airport.`,
    barcodes: [EK_ETICKET_CONJUNCTION_STRIPE],
  },
];

/** Etihad e-ticket receipt (Amadeus "ITR - EMD Graphical"): no barcode at
 * all, a summary strip that prints every leg's date, flight and airports
 * in three column-aligned rows before the per-leg blocks, and an overnight
 * leg (AMS → AUH). The first leg is a Finnair codeshare. iOS row-ordered
 * text; traveller, ticket and booking numbers replaced. */
export const ETIHAD_RECEIPT_PDFKIT: DocumentPage[] = [
  {
    text: `Electronic ticket receipt
Ms Jane Doe  Etihad reference 3ZQTPV
Frequent Flyer Number 500000000001  Other airlines 3ZQTPV(AY)
Ticket number 607 2400000001
Thank you for your continued loyalty.  Date of issue 01 Jun 2026
We look forward to welcoming you soon.  Issuing office Etihad Airways, United Arab Emirates
_
06 Jun  06 Jun  07 Jun
AY 1305  EY 42  EY 332
HEL  AMS  AUH  COK
All times are local to each city
AY 1305 • Finnair
Helsinki  Amsterdam  Fare type  Deluxe
Seat  -
HEL  AMS  Cabin  7kg
16:40  02h 35m • Nonstop  18:15  Checked  40kg (32kg per bag)
06 Jun 2026   Airbus A321  06 Jun 2026
Helsinki Vantaa  Schiphol Airport
Status  CONFIRMED
EY 42 • Etihad Airways
Amsterdam  Abu Dhabi  Fare type  Deluxe
AMS  AUH  Seat  21H
Cabin  7kg
21:55  06h 35m • Nonstop  06:30  Checked  40kg (32kg per bag)
06 Jun 2026   Airbus A350-1000  07 Jun 2026
Schiphol Airport  Zayed International Airport
Terminal A  Status  CONFIRMED
EY 332 • Etihad Airways
Abu Dhabi  Kochi  Fare type  Deluxe
AUH  COK  Seat  09F
Cabin  7kg
08:40  04h 05m • Nonstop  14:15  Checked  40kg (32kg per bag)
07 Jun 2026   Airbus A320 (Sharklets)  07 Jun 2026
Zayed International Airport  Cochin Intl (Kochi)
Terminal A
Terminal 3  Status  CONFIRMED
For real-time travel updates and to check your Etihad Guest benefits, download the Etihad app
This E-ticket is valid for 1 year from the date of issue
_
Payment details  Fare details
Fare Calculation HEL AY X/AMS EY X/AUH EY  Fare  EUR 811.00
COK950.82NUC950.82END ROE0.852932
Form of payment  CC VI XXXXXXXXXXXX0000 XXXX X00000 - 1002.81 /  Taxes  EUR 6.27DQ
EUR  EUR 12.31FI
Endorsements NON ENDO/ REF  EUR 0.90XU
EUR 11.94CJ
EUR 14.19RN
EUR 11.71F6
EUR 1.18ZR
Carrier fees  EUR 133.31YQ`,
    barcodes: [],
  },
  {
    text: `Electronic ticket receipt
Total Amount  EUR1002.81
_`,
    barcodes: [],
  },
  {
    text: `Electronic ticket receipt
Legal and guest notices
Baggage allowance
Use our baggage calculator to determine your checked baggage and cabin baggage allowance. You’ll also find your checked baggage allowance on
your travel itinerary above.
Travel information
You’ll find everything you need to know to prepare for your trip at etihad.com.
Legal information
If you booked your ticket online, you’ll need to provide proof of identity to use this electronic ticket. Transportation and other services provided by
Etihad Airways are subject to conditions of carriage which form part of the contract of carriage between you and Etihad Airways.
Ancillary products and services are subject to the applicable terms and conditions.
If your journey involves a destination or a stop in a country other than the country of origin, the Warsaw Convention or the Montreal Convention as
stated in the conditions of carriage may apply to the entire journey, including any portion entirely within the country of origin or destination. These
conventions may limit the liability of the carrier for loss of life or bodily injury, for delays, or loss or damage to baggage. Etihad Airways has waived
the limits of liability applicable under the Warsaw Convention (or that convention as amended at The Hague 1955 or protocols nos. 1 and 2 of 1975),
with respect to loss of life or bodily injury attributable to an accident. However, under the Warsaw Convention (or that convention as amended at
The Hague 1955 or protocols nos. 1 and 2 of 1975), the liability for the loss, damage or destruction of checked baggage is limited to SDR 17 per
kilogram (approx. USD 20).
Under the Montreal Convention of 1999, no financial limits apply in the case of loss of life or bodily injury. Etihad Airways may make advance
payments to meet immediate economic needs of the person entitled to claim compensation, subject to applicable laws. The liability of Etihad
Airways in respect of damage caused by delay is limited to SDR 4,150 (approx. USD 6,200) and the liability in respect of destruction, loss, damage, or
delay of baggage is limited to SDR 1,000 (approx. USD 1,500).
Additional protection can usually be obtained by purchasing insurance from a private company. Such insurance is not affected by any limitation of
the carrier’s liability under an international treaty.
For flights originating from any member state of the European Union, Etihad Airways is committed to the specific European regulations relating to
liability in case of denied boarding, cancellation of a flight or substantial delay. For security reasons, all knives, sharp objects or cutting implements
of any kind and any length, whether of metal or other material, knitting needles, and sporting goods, must be packed in your checked baggage.
They cannot be carried in cabin baggage or on person. If you are carrying hypodermic needles they must be declared at check-in and you will be
required to present proof that they are medically required. Medication should contain a professionally printed label identifying the medication or
manufacturers name. You must not carry liquids or other substances that pose a significant risk to health, safety and property when transported by
air, including explosives, compressed gases and/or aerosols, flammable liquids, corrosives, oxidising materials, magnets, materials easily ignited,
poisonous, offensive or irritating substances, munitions of war and any further items which are prohibited by applicable laws, regulations or order of
any state to be flown from, to or over. Read our privacy policy and terms and conditions.`,
    barcodes: [],
  },
];

/** The Etihad receipt via PDFBox; the legal-notices page cut to its header. */
export const ETIHAD_RECEIPT_PDFBOX: DocumentPage[] = [
  {
    text: `Electronic ticket receipt
Ms Jane Doe Etihad reference 3ZQTPV
Frequent Flyer Number 500000000001 Other airlines 3ZQTPV(AY)
Ticket number 607 2400000001
Thank you for your continued loyalty. Date of issue 01 Jun 2026
We look forward to welcoming you soon. Issuing office Etihad Airways, United Arab Emirates
_
06 Jun 06 Jun 07 Jun
AY 1305 EY 42 EY 332
HEL AMS AUH COK
All times are local to each city
AY 1305 • Finnair
Helsinki Amsterdam Fare type Deluxe
HEL AMS Seat -
Cabin 7kg
16:40 02h 35m • Nonstop 18:15 Checked 40kg (32kg per bag)
06 Jun 2026 Airbus A321 06 Jun 2026
Helsinki Vantaa Schiphol Airport
Status CONFIRMED
EY 42 • Etihad Airways
Amsterdam Abu Dhabi Fare type Deluxe
AMS AUH Seat 21H
Cabin 7kg
21:55 06h 35m • Nonstop 06:30 Checked 40kg (32kg per bag)
06 Jun 2026 Airbus A350-1000 07 Jun 2026
Schiphol Airport Zayed International Airport
Terminal A Status CONFIRMED
EY 332 • Etihad Airways
Abu Dhabi Kochi Fare type Deluxe
AUH COK Seat 09F
Cabin 7kg
08:40 04h 05m • Nonstop 14:15 Checked 40kg (32kg per bag)
07 Jun 2026 Airbus A320 (Sharklets) 07 Jun 2026
Zayed International Airport Cochin Intl (Kochi)
Terminal A Terminal 3 Status CONFIRMED
For real-time travel updates and to check your Etihad Guest benefits, download the Etihad app
This E-ticket is valid for 1 year from the date of issue
_
Payment details Fare details
Fare Calculation HEL AY X/AMS EY X/AUH EY Fare EUR 811.00
COK950.82NUC950.82END ROE0.852932
Form of payment CC VI XXXXXXXXXXXX0000 XXXX X00000 - 1002.81 / Taxes EUR 6.27DQ
EUR EUR 12.31FI
Endorsements NON ENDO/ REF EUR 0.90XU
EUR 11.94CJ
EUR 14.19RN
EUR 11.71F6
EUR 1.18ZR
Carrier fees EUR 133.31YQ`,
    barcodes: [],
  },
  {
    text: `Electronic ticket receipt
Total Amount EUR 1002.81
_`,
    barcodes: [],
  },
  {
    text: `Electronic ticket receipt
Legal and guest notices`,
    barcodes: [],
  },
];

/** Goibibo (Indian OTA) booking confirmation: two IndiGo legs, the year
 * printed once in the heading ("SUN, 11 OCT '20"), each leg headed by its
 * codes in big type over the city names, flight numbers hyphenated
 * ("6E-6273"), no barcode — iOS text order. */
export const GOIBIBO_CONFIRMATION_PDFKIT: DocumentPage[] = [
  {
    text: `Booking Id: GOFLD0000000000000000000
Confirmed
SUN, 11 OCT '20 THIRUVANATHAPURAM TO MANGALORE 8h 30m
TRV
THIRUVANATHAPURAM
1h 20m
BLR
BENGALURU
Indigo Airlines
6E-6273
10:00 hrs, 11 Oct
Economy
11:20 hrs, 11 Oct
Trivandrum International
Airport
Terminal 1
Kempegowda
International Airport
Terminal 1
PASSENGER NAME PNR
E-TICKET NO. SEAT
1. Doe Jane, Adult 7QK2AB
7QK2AB 24A
Change of Planes. 6h 5m layover in Bengaluru (BLR)
BLR
BENGALURU
1h 5m
IXE
MANGALORE
Indigo Airlines
6E-181
17:25 hrs, 11 Oct
Economy
18:30 hrs, 11 Oct
Kempegowda
International Airport
Terminal 1
Mangalore
International Airport
PASSENGER NAME PNR
E-TICKET NO. SEAT
1. Doe Jane, Adult 7QK2AB
7QK2AB 21A
IMPORTANT INFORMATION
• Web Check-in : Web Check-in is now a mandatory step for your air travel. For a hassle-free Web Check-in on Goibibo, please click`,
    barcodes: [],
  },
  {
    text: `Here
• Check-in Time : Passenger to report 2 hours before departure. Check-in procedure and baggage drop will close 1 hour before departure.
• Valid ID proof needed : Please carry a valid Passport and Visa (mandatory for international travel). Passport should have at least 6
months of validity at the time of travel
• DGCA passenger charter : Please refer to passenger charter by clicking Here
• Beware of fraudsters : Please do not share your personal banking and security details like passwords, CVV, etc. with any third person
or party claiming to represent Goibibo. For any query, please reach out to Goibibo on our official customer care number.
• You have paid: INR 5,210
• Gosafe-certified Airport Cabs : Enjoy smooth airport transfers in sanitized cabs with trained drivers. No waiting and no surge pricing!
Book : here
BAGGAGE INFORMATION
Type Sector Cabin Check-in
Adult TRV-BLR 1 Piece (Laptop or Ladies
handbag)
Adult BLR-IXE 1 Piece (Laptop or Ladies
handbag)
20 Kgs
20 Kgs
CANCELLATION AND DATE CHANGE CHARGES
All charges below are per Pax and per Segment in INR
TRV-BLR,BLR-IXE Cancellation Charges
TRV-BLR,BLR-IXE Date Change Charges
Type Condition Airline Goibibo
Adult 3 days - 365 days 3000 300
2 hrs - 3 days 3500 300
0 hrs - 2 hrs Non-Refundable
Type Condition Airline Goibibo
Adult 3 days - 365 days 2500 300
2 hrs - 3 days 3000 300
0 hrs - 2 hrs Non-Changeable
24x7 CUSTOMER SUPPORT
Gibibo Support
Airline Support
Tel 0124-6280407
Indigo Airlines 9910383838`,
    barcodes: [],
  },
  {
    text: `for all major operators`,
    barcodes: [],
  },
];

/** The same Goibibo confirmation in Android (PDFBox sorted) order: the two
 * codes of a leg share a line ("TRV BLR"), and the passenger row ends
 * with the seat. */
export const GOIBIBO_CONFIRMATION_PDFBOX: DocumentPage[] = [
  {
    text: `Booking Id: GOFLD0000000000000000000
Confirmed
SUN, 11 OCT '20 THIRUVANATHAPURAM TO MANGALORE 8h 30m
TRV BLR
1h 20m
Indigo Airlines THIRUVANATHAPURAM BENGALURU
6E-6273
10:00 hrs, 11 Oct Economy 11:20 hrs, 11 Oct
Trivandrum International Kempegowda 
Airport International Airport
Terminal 1 Terminal 1
 
PASSENGER NAME PNR E-TICKET NO. SEAT
1. Doe Jane, Adult 7QK2AB 7QK2AB 24A
 
Change of Planes. 6h 5m layover in Bengaluru (BLR)
BLR IXE
Indigo Airlines BENGALURU 1h 5m MANGALORE
6E-181
17:25 hrs, 11 Oct Economy 18:30 hrs, 11 Oct
Kempegowda Mangalore 
International Airport International Airport
Terminal 1
 
PASSENGER NAME PNR E-TICKET NO. SEAT
1. Doe Jane, Adult 7QK2AB 7QK2AB 21A
 
IMPORTANT INFORMATION
• Web Check-in : Web Check-in is now a mandatory step for your air travel. For a hassle-free Web Check-in on Goibibo, please click 
Here
• Check-in Time : Passenger to report 2 hours before departure. Check-in procedure and baggage drop will close 1 hour before departure.
• Valid ID proof needed : Please carry a valid Passport and Visa (mandatory for international travel). Passport should have at least 6 
months of validity at the time of travel
• DGCA passenger charter : Please refer to passenger charter by clicking Here
• Beware of fraudsters : Please do not share your personal banking and security details like passwords, CVV, etc. with any third person 
or party claiming to represent Goibibo. For any query, please reach out to Goibibo on our official customer care number.
• You have paid: INR 5,210 
• Gosafe-certified Airport Cabs : Enjoy smooth airport transfers in sanitized cabs with trained drivers. No waiting and no surge pricing! 
Book : here
BAGGAGE INFORMATION
Type Sector Cabin Check-in
Adult TRV-BLR 1 Piece (Laptop or Ladies 20 Kgs
handbag)
Adult BLR-IXE 1 Piece (Laptop or Ladies 20 Kgs
handbag)
CANCELLATION AND DATE CHANGE CHARGES
All charges below are per Pax and per Segment in INR
TRV-BLR,BLR-IXE Cancellation Charges TRV-BLR,BLR-IXE Date Change Charges
Type Condition Airline Goibibo Type Condition Airline Goibibo
Adult 3 days - 365 days 3000 300 Adult 3 days - 365 days 2500 300
2 hrs - 3 days 3500 300 2 hrs - 3 days 3000 300
0 hrs - 2 hrs Non-Refundable 0 hrs - 2 hrs Non-Changeable
24x7 CUSTOMER SUPPORT
Gibibo Support Airline Support
Tel 0124-6280407 Indigo Airlines 9910383838
for all major operators`,
    barcodes: [],
  },
];

/** A screenshot of an IndiGo itinerary email as the app's iOS reader
 * returns it (Vision on the simulator, banded into rows the way the
 * module does it): the phone's status bar on top, the booking stamp with
 * seconds, a leg table whose wrapped cells land in different bands — the
 * header reads "Counter/Bag drop" above "Departa", the first leg's
 * closing time lands between its departure and arrival — "SE 388" for
 * 6E 388, the aircraft type "(A320)" in its own column, the year only as
 * "04 Oct 20" with a city on the next line, and the routes listed as a
 * chain under the table. */
export const INDIGO_EMAIL_SCREENSHOT: DocumentPage[] = [
  {
    text: `18:57
B * Ve Il © 15%
IndiGo
PNR/Booking Ref.: K7PQ2N|
Status
Date of Booking*
Payment Status
CONFIRMED
25 Sep 20 16:25:59 (UTC)
Approved
Booking Date refiects n UTC (Universal Time Coordinated), all other timings mentioned are as per Local Time
IndiGo Passenger(s)
Check-in now
Flight Status
1. Ms. Doe Jane
IndiGo Flight(s)
Flight
From
Number
Counter/Bag drop
Date
(Terminal)
Departa (Alrcraft
closes
To (Terminal)
Arrives Vla
type)
SE 388
04 Oct 20
Mangalore
13:40
(A320)
12:40
Bengaluru (T1)
14:45
6E 379
Thiruvananthapuram
04 Oct 20
Bengaluru (T1) 16:10
(A320)
15:10
(T1)
17:30
Seats and Additional Services
IXE
→ BLR
BLR → TRV
Passenger name
Seat Services Purchased
Seat
Services Purchased
Ms. Doe Jane
20A
20A
Tips for a hassle-free travel experience
Mandatory health
120 min before
60 min before
25 min before
declaration and web
departure
departure
departure
check-in
Reach the airport to allow
Drop your bags and proceed
Boarding gate closes.
Declare your health status
voursell sutticient time tot
for boarding.
and check-in online 48
necossary proceoures
hotre to 60 min hatore
flight departure.
Travel and Baggage Information
IXE
BLR
BLR → TRV
• Fare Type: Regular Fare
• Fare Type: Regular Fare
• Airport counters close 60 minutes prior to the scheduled
• Airport counters close 60 minutes prior to the scheduled
departure time.
departure time.
• Boarding gates close 25 minutes prior to the scheduled
• Boarding gates close 25 minutes prior to the scheduled
debarure timel
departure timne
• BAGGAGE INFORMATION:
• BAGGAGE INFORMATION:
• Check-in Baggage: 20 Kg per parson (One piece only).
• Check-in Baggage: 20 Kg per parson (One piece only).
Additional charges will apply for excess baggage.
Adaitional charges will apply for excess baggage.
• Disclaimer: 15kg per person (1 piece only) effective Oct 1st,
• Disclaimer: 15kg per person (1 piece onty) effective Oct 1st,
2020. For Double or MultiSeats bookings, extra 10 kg.
2020. For Double or MultiSeats bookings, extra 10 kg
Additional charoes may son y for excers osdonde. Note: rot
Additional charges may apply for excess baggage. Note: For
bookings made between May 21 to Sept 30, 2020 (inclusive)
bookings made between May 21 to Sept 30, 2020 (inclusive)
for travel up to Nov 24, 2020, the allowance will be 20kg (1
for travel up to Nov 24, 2020, the allowance will be 20kg (1
piece only) instead of 15kg.
piece only) instead of 15kg.
• Hand Baggage: One personal item like small laptop bag,
• Hand Baggage: One personal itern like small laptop bag,
Reply
Forward
99+`,
    barcodes: [],
  },
];

/** Lufthansa booking confirmation (two legs, no barcode): each leg headed
 * "Sat. 06 February 2021: Bangalore – Frankfurt" — the year followed by a
 * colon — with an "Important Notice" paragraph between the first heading
 * and its row, the departure clock BEFORE the flight number on the row
 * ("03:35 h  Bangalore … (BLR)  LH 755"), the arrival on the next line,
 * and the second heading on page two. iOS text order; pages 1–2 of 3. */
export const LUFTHANSA_CONFIRMATION_PDFKIT: DocumentPage[] = [
  {
    text: `Ticket details & travel information
Lufthansa booking code:  Q00ABC
Display/edit booking
Passenger information
DOE/JANE MS
Miles & More-Number: XXXXXXXXXXX 2025
Ticket number: 2200000000000
Receipt and Additional documents
Do you require receipts for your tax returns or your travel expenses? You will be able to access all the
receipts at the end of this message.
Download your receipts now
Option for download is valid up to 90 days after end of travel.
Your itinerary
Sat. 06 February 2021: Bangalore – Frankfurt
Important Notice
To enter the terminal, Indian authorities ask you to present a printout of the latest version of your travel itinerary and
passports before entering the check-in lobby at the airport. Please print your travel information and keep it with you.
Access to the airport building is only possible no earlier than 4 hours prior to your departure.
03:35 h   Bangalore Kempegowda International Apt (BLR)  LH 755
operated by:
09:35 h  Frankfurt Frankfurt (FRA)
Terminal 1  Lufthansa
Status: confirmed   Class: Economy Class (S)   Free baggage allowance: 1 piece of
baggage and 1 piece of hand baggage`,
    barcodes: [],
  },
  {
    text: `Sat. 06 February 2021: Frankfurt – Helsinki
10:45 h  Frankfurt Frankfurt (FRA)  LH 848
Terminal 1
operated by:
14:10 h  Helsinki Helsinki (HEL)  Lufthansa
Terminal 2
Status: confirmed   Class: Economy Class (S)   Free baggage allowance: 1 piece of
baggage and 1 piece of hand baggage
Total Price of your Ticket
Passenger Type   Price   Taxes, fees &  Passengers   Total Price of your Ticket
surcharges
Adult  INR 19250.00  INR 19946.00  1  INR 39196.00
Total Price for all Passengers   INR 39196.00
Lufthansa Online Services
You can view and amend your booking at any time online at lufthansa.com. You don't need to register to do this; just
log in with your booking code and surname.
Under Flight Status you can find out about details of your flight from as early as 5 days before departure and activate
automatic notifications for updated departure information. This applies to all flights that are operated by Lufthansa,
Lufthansa Regional, Austrian Airlines, SWISS or Eurowings.
Show booking  Rebook flight  Cancel flight  Help
Flight information
Emergency contact: before you set off on your journey, please leave us details of the person you wish us to contact in
the event of an emergency.
Simplified onboard service: In order to minimize contact between people, our current in-flight service has been adapted and
simplified. Please find more information on lufthansa.com.
Please take note of the current free baggage allowance included in your ticket price and the applicable hand baggage
regulations prior to your departure. If you are planning to take excess or special baggage with you, different conditions
may apply.
As the airfare you have chosen may be a special fare, please note that restrictions may apply regarding rebooking and
cancellation. If the fare conditions allow for a rebooking or refund, please be advised that charges may apply. In the case
of a rebooking, please be aware that, for the new travel dates, you may also need to comply with possible advance
booking deadlines, minimum and maximum stays and restrictions on the departure times. For enquiries regarding the fare
conditions applying to your chosen airfare, please contact your local Lufthansa representative.`,
    barcodes: [],
  },
];

/** The same confirmation in Android (PDFBox sorted) order, where the
 * flight numbers are set with a non-breaking space ("LH\u00a0755"). */
export const LUFTHANSA_CONFIRMATION_PDFBOX: DocumentPage[] = [
  {
    text: ` 
Ticket details & travel information
Lufthansa booking code: Q00ABC
 
Display/edit booking
  Passenger information
DOE/JANE MS
Miles & More-Number: XXXXXXXXXXX 2025
Ticket number: 2200000000000
  Receipt and Additional documents
Do you require receipts for your tax returns or your travel expenses? You will be able to access all the
receipts at the end of this message.
 Download your receipts now
Option for download is valid up to 90 days after end of travel.
  Your itinerary
Sat. 06 February 2021: Bangalore – Frankfurt  
Important Notice
To enter the terminal, Indian authorities ask you to present a printout of the latest version of your travel itinerary and
passports before entering the check-in lobby at the airport. Please print your travel information and keep it with you.
Access to the airport building is only possible no earlier than 4 hours prior to your departure.
03:35 h Bangalore Kempegowda International Apt (BLR) LH 755
operated by:
09:35 h Frankfurt Frankfurt (FRA) Lufthansa
Terminal 1
 
Status: confirmed Class: Economy Class (S) Free baggage allowance: 1 piece of
baggage and 1 piece of hand baggage
 
Sat. 06 February 2021: Frankfurt – Helsinki  
10:45 h Frankfurt Frankfurt (FRA) LH 848
Terminal 1
operated by:
14:10 h Helsinki Helsinki (HEL) Lufthansa
Terminal 2
Status: confirmed Class: Economy Class (S) Free baggage allowance: 1 piece of
baggage and 1 piece of hand baggage
 
Total Price of your Ticket
Passenger Type Price Taxes, fees & Passengers Total Price of your Ticket
   
    surcharges    
 Adult INR 19250.00 INR 19946.00 1 INR 39196.00  
   
 
  Total Price for all Passengers INR 39196.00  
 
Lufthansa Online Services
You can view and amend your booking at any time online at lufthansa.com. You don't need to register to do this; just
log in with your booking code and surname.
  Under Flight Status you can find out about details of your flight from as early as 5 days before departure and activate
automatic notifications for updated departure information. This applies to all flights that are operated by Lufthansa,
Lufthansa Regional, Austrian Airlines, SWISS or Eurowings.
Show booking Rebook flight Cancel flight Help
  Flight information
Emergency contact: before you set off on your journey, please leave us details of the person you wish us to contact in
the event of an emergency.
Simplified onboard service: In order to minimize contact between people, our current in-flight service has been adapted and
simplified. Please find more information on lufthansa.com.
Please take note of the current free baggage allowance included in your ticket price and the applicable hand baggage
regulations prior to your departure. If you are planning to take excess or special baggage with you, different conditions
  may apply.
As the airfare you have chosen may be a special fare, please note that restrictions may apply regarding rebooking and
cancellation. If the fare conditions allow for a rebooking or refund, please be advised that charges may apply. In the case
of a rebooking, please be aware that, for the new travel dates, you may also need to comply with possible advance
booking deadlines, minimum and maximum stays and restrictions on the departure times. For enquiries regarding the fare
conditions applying to your chosen airfare, please contact your local Lufthansa representative.
 
Please check the applicable health, entry and visa requirements, and ensure that you obtain the necessary visa according
to your itinerary because it contains at least a double transfer within Germany/Europe.
An electronic ticket has been issued for you. Your boarding pass will be available at lufthansa.com from 23 hours prior to
departure. For identification please have your booking reference and your Miles & More Credit Card or the credit card which
has been used at the time of booking ready.
In case you should travel with an airline other than Lufthansa please check here or contact the respective carrier for the
applicable check-in conditions.
Flight services
Current entry regulations
Please note that it is your responsibility to adhere to the entry regulations of all countries you are visiting on your trip.
Currently, these regulations change very frequently. Kindly inform yourself in due time, and again shortly before the trip.
Find more detailed information here.
Note on obligatory facemasks
For Lufthansa, the safety of passengers and employees has the highest priority. Therefore, you will find here the latest
information on the compulsory use of masks.
On lufthansa.com, you will find more information about traveling in times of Corona, the current flight program or the flexible
rebooking options.
Offset CO2 emissions
Invest in innovative, sustainable aviation fuel and reforestation. Offset your flight with Compensaid at lufthansa.com.
Baggage services via the Lufthansa app
With the Lufthansa app you know where your baggage is at all times. Once your bags have been checked in at the counter
or self-service kiosk you can call up a digital baggage receipt via the app. Clicking on the link in the receipt displays the
  loading status of your baggage.
A helpful function: at several airports you will receive a push notification on your phone after landing, telling when you can
reclaim your luggage and which carousel it will be on. More information at lufthansa.com.
Lufthansa on your mobile
The Lufthansa app offers you easy access to all the major Lufthansa services: check in and mobile boarding passes, check
flight status, book flights, reserve seats and much more. Push messages provide useful information about your upcoming
flight. The Lufthansa app is available for iOS and Android for smartphones and tablets. Further information can be found on
lufthansa.com.
Free eJournals for your journey with Lufthansa
As a Lufthansa passenger, many newspapers and magazines of different kinds and in various languages are available to
you as free eJournals. Simply enter your booking code or ticket number and last name on lufthansa.com/eJournals and
download your favourite titles to your mobile device before departure. Your choice of eJournals can be downloaded from
three days before departure until the last day of your journey.
Easy flight data transmission
Together with your booking details you are provided with iCalendar files which can be easily transferred into your electronic
calendar.
Receipts and other documents
If you require receipts for your tax returns or your travel expenses, you can create these by clicking on the relevant
document number.
Passenger Document type Document
 
PADINJARECHALIL SHAJI / SHANAVAS Ticket  2200000000000 *
MR
* You have access to the passenger receipt by clicking the ticket number up to 90 days after end of travel.
 
  Thank you for your booking and have a pleasant journey.
Best regards,
Your Lufthansa team
Lufthansa German Airlines is not liable for any changes of the transmitted data undertaken by you or a third party. No liability can be accepted for the accuracy
  of the information included in this document.
Please note that all flight times are local times.
created: 05 February 2021
 
Corporate Headquarters: Registration: lufthansa.com
Deutsche Lufthansa Amtsgericht Köln HRB 2168 Imprint
Aktiengesellschaft, Köln  
Executive Board:  
Chairman of the Supervisory Board: Carsten Spohr (Vorsitzender / Chairman),
Dr. Karl-Ludwig Kley Christina Foerster,
Harry Hohmeister,
  Dr. Detlef Kayser,
Dr. Michael Niggemann,
Remco Steenbergen
 
 `,
    barcodes: [],
  },
];
