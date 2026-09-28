# Days by country

How many days a traveller spent in each country per calendar year, worked out
from the journal and the home base. People use it for the day counts in tax
rules, so the counting follows those rules. Design canvas:
https://claude.ai/artifact/6WZiSSo5VVmQRyq7x6hE1U

## Counting (`src/services/country-days.ts`)

- **A day counts if the traveller was in the country for any part of it.**
  This is the rule of the OECD model's 183-day test (Commentary on Article
  15, used by most tax treaties), the US substantial presence test (IRS
  Publication 519), Canada's 183-day rule and Schengen's 90/180. Arrival and
  departure days both count, so a travel day counts in two countries and a
  year's countries add up to more than 365.
- **Midnights** are counted too, because the UK's statutory residence test
  (HMRC RDR3) counts a day only if the traveller is in the UK at midnight.
  The UK row and page show them.
- **Connections under 24 hours are transit** and count nowhere (the legs of
  one `chainLegs` itinerary are merged door to door). The OECD and US rules
  exclude transit the same way.
- **A stay** runs from a landing to the next take-off. Days at home are the
  same thing: the landing home to the next take-off from home.
- **Missing flights are never guessed.** When the next take-off leaves from
  another country than the last landing, the landing day and the take-off
  day count, and the days between are "Not sure", listed with their dates
  and an "Add the missing flight" button.
- **Before the first flight** in the journal the traveller is at home only if
  that flight leaves from the home country (`homeByDay`: set periods, else
  the automatic home). After the last flight they are where it landed, up to
  today. Future flights are ignored; the current year runs to today.
- A flight logged twice (same route, same take-off) counts once.

The app counts days; it does not decide tax residence, which also depends on
work days, ties and weighting the app cannot see. Every screen says "From
your logged flights. Not tax advice."

## Screens

| Where | What |
|---|---|
| Travel stats | `CountryDaysCard` under the Home base card: this year so far (or the latest year with days abroad) as a bar, home days, abroad, not sure, the top three countries. Opens Places › Days. |
| Places › Days (`stats/places?tab=days&year=`) | Year chips, every country with its days and a bar, UK midnights, the "Not sure" spans, the counting note. |
| One country (`stats/days/[country]?year=`) | The days, stays newest first with the flights that began and ended them; a stay opens its trip. |

Friends never see it: days at home would reveal time the traveller never
shared. It is free; an export for an accountant is the natural Pro extra
later.

## Test

`src/services/country-days.test.ts` runs the canvas example (a Helsinki
traveller's 2025: Finland 313, US 18, Japan 15, Spain 12, UK 9 with 8
midnights, Sweden 1, Estonia 1, 5 not sure) plus New Year, partial year,
duplicates and the first flight.
