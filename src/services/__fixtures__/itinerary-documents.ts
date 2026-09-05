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
