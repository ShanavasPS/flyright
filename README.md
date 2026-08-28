# FlyRight ✈️

**Your travel buddy on the day you fly — and your advocate when the flight goes wrong.**

Flight trackers tell you your flight is late. FlyRight tells you what the airline owes you for it — and helps you claim it.

## What FlyRight is really about

Most travel apps stop at information: gate changes, delay predictions, where your plane is. FlyRight starts there, but its job isn't done until you're paid. When a disruption happens, FlyRight is already tracking your flight — so the same moment you learn about a 3-hour delay, you learn it's worth up to €600 under EU261, and you can start the claim right from the notification.

That position is unique because the two halves reinforce each other:

- **Claims services** (web forms you find after the fact) don't know you're flying until you come to them days later, receipts in hand.
- **Flight trackers** know you're flying but have no compensation engine — their value ends at "your flight is delayed."

FlyRight sits in both seats. Being with you on travel day is what earns it the right to act for you when the day goes wrong.

The timing matters too: since the 2026 EU passenger-rights reform, airlines are legally required to disclose your rights during a disruption — while compensation of €250–600 stays intact. Awareness of passenger rights is going up, but exercising them still mostly means a web form built a decade ago. FlyRight puts that process in your pocket, at the airport, at the moment it applies.

And the value is denominated in money recovered, not information delivered: the app pays for itself the first time a flight goes wrong.

## What it does

- **Travel Day Live** — a boarding-pass style hero card and iOS Live Activity that follow your flight through the day: check-in, gate, boarding, delays.
- **Know what you're owed** — disruption detection mapped to passenger-rights rules (EU261 and friends), with a clear payout estimate instead of legalese.
- **Claim, don't decode** — guided claim flow so you exercise your rights without reading regulations or drafting airline correspondence.
- **Anonymous-first** — start using it without an account; sign in (email, Apple, Google) when you want your travels to follow you across devices.

## Tech stack

- [Expo](https://expo.dev) SDK 57 / React Native, [Expo Router](https://docs.expo.dev/router/introduction/), iOS Live Activities
- [Convex](https://convex.dev) backend, [Clerk](https://clerk.com) auth, [RevenueCat](https://revenuecat.com) subscriptions ("Owed Pro")
- OneSignal push, i18next localization, Drizzle + SQLite on-device storage

## Development

```bash
npm install
npx expo start
```

Run on a device or simulator with a development build (`npx expo prebuild -p ios && npx expo run:ios`, same for `android`). Release builds go through EAS — see `AGENTS.md` for the release flow.
