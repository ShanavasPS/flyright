# Samsung Galaxy Store listing (en-US)

Paste each block into Seller Portal → Apps → Add New App → App Information.
Plain text only (same lesson as the Play listing: no JSON-escaped `\n`, no
fancy bullets). The Galaxy build is FREE with billing disabled
(`EXPO_PUBLIC_STORE_VARIANT=galaxy`, see eas.json): RevenueCat has no Samsung
IAP, so Pro is not sold here — claims are un-gated instead. Select
"Free" and answer "No" to in-app purchases on the submission form.

## App title (max 50 chars)

FlyRight: Flight Compensation

## Short-form description (used in search/feature slots)

Track flights, spot delays, and claim the airline compensation you are owed.

## Description (max 4000 chars)

FlyRight watches your flights and tells you the moment a delay or cancellation makes you eligible for airline compensation, and exactly how much you are owed.

Add a flight in seconds. FlyRight tracks it live and applies EU air passenger rights (Regulation EU 261/2004) to every disruption. If your delayed or cancelled flight qualifies, you get a clear verdict of up to 600 EUR per passenger and a ready-to-send claim letter.

WHAT FLYRIGHT DOES

- Track your flights with live status updates
- Get an instant compensation verdict under EU 261/2004 when a flight is delayed, cancelled, or you are denied boarding
- See exactly how much money you can claim
- Generate a ready-to-send claim letter addressed to the airline
- Get deadline reminders so you never miss a claim window
- Keep a history of all your journeys and travel stats

HOW IT WORKS

1. Add your flight by flight number and date.
2. FlyRight monitors the flight and checks every disruption against EU passenger rights rules.
3. If you are eligible, the app shows the amount you can claim and prepares a claim letter you can send to the airline.

WHO IT IS FOR

Anyone flying to, from, or within the EU. If your flight lands three or more hours late, is cancelled at short notice, or you are denied boarding, the airline may owe you between 250 and 600 EUR per passenger. Most travellers never claim it. FlyRight makes sure you do.

NO ACCOUNT NEEDED

All core features work without signing up. Create an account only if you want to keep your data across devices.

Delayed, cancelled, or bumped from your flight? Airlines owe you real money. FlyRight helps you collect it.

## Submission form answers

- Category: Travel (Apps → Travel/Local)
- Price: Free
- In-app purchases: No
- Age rating questionnaire: everyone / no objectionable content (mirror Play answers)
- Supported devices: Phone + Tablet (Galaxy Z foldables included via phone)
- Countries: all available (mirror Play distribution)
- Support email: sshanavas@coinmotion.com
- Privacy policy URL: https://getflyright.com/privacy
- Support URL: https://flyright.expo.app/support

## Assets (reuse from store-assets/)

- Icon 512x512: store-assets/play-icon-512.png
- Screenshots (min 4, 1080x1920 OK): store-assets/phone-01.png … phone-04.png
- Optional feature banner: store-assets/feature-graphic-1024x500.png (resize if Samsung asks for a different ratio)

## Shipaton "Best App for Galaxy" entry notes (20% = Galaxy optimization)

- Provide the live Galaxy Store URL in the Devpost submission once published.
- Optimization story to write up (and ideally ship): large-screen/foldable
  layout for Travel Day Live (Flex mode: boarding pass top half, live status
  bottom half), tablet layouts already supported on iPad, cover-screen
  glanceability.
