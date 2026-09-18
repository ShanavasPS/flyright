#!/usr/bin/env node
/**
 * The website's social card (public/og-image.png, 1200×630) and the
 * apple-touch-icon (public/apple-touch-icon.png, 180×180), from the brand
 * icon and a current capture. Re-run after changing the tagline or the
 * captures under assets/images/landing:
 *   node scripts/generate-og-image.mjs
 */
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const W = 1200;
const H = 630;
const NAVY_DEEP = '#0B1D3E';
const NAVY = '#16345F';
const GREEN = '#2FD68C';
const COBALT = '#4E9BF5';
const FONT = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";

await mkdir('public', { recursive: true });

// A phone-shaped capture on the right, the words on the left.
const shot = await sharp('assets/images/landing/travel-day.png')
  .resize({ width: 250 })
  .toBuffer();
const shotMeta = await sharp(shot).metadata();
const bezel = Buffer.from(
  `<svg width="${shotMeta.width + 20}" height="${shotMeta.height + 20}"><rect width="100%" height="100%" rx="50" fill="#0F1420"/></svg>`,
);
const phone = await sharp(bezel)
  .composite([{ input: await sharp(shot).composite([{ input: Buffer.from(`<svg width="${shotMeta.width}" height="${shotMeta.height}"><rect width="100%" height="100%" rx="40" fill="#fff"/></svg>`), blend: 'dest-in' }]).png().toBuffer(), left: 10, top: 10 }])
  .png()
  .toBuffer();

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${NAVY}"/><stop offset="1" stop-color="${NAVY_DEEP}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.78" cy="0.55" r="0.5">
      <stop offset="0" stop-color="${COBALT}" stop-opacity="0.35"/><stop offset="1" stop-color="${COBALT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#sky)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <text x="80" y="150" font-family="${FONT}" font-size="22" font-weight="700" letter-spacing="4" fill="${GREEN}">FLYRIGHT</text>
  <text x="80" y="255" font-family="${FONT}" font-size="76" font-weight="800" letter-spacing="-2.5" fill="#FFFFFF">Your travel day,</text>
  <text x="80" y="340" font-family="${FONT}" font-size="76" font-weight="800" letter-spacing="-2.5" fill="${COBALT}">live.</text>
  <text x="80" y="410" font-family="${FONT}" font-size="26" fill="#B9C8DE">Gates, delays and boarding, shared with the people</text>
  <text x="80" y="446" font-family="${FONT}" font-size="26" fill="#B9C8DE">waiting for you. And what you’re owed when it goes wrong.</text>
  <text x="80" y="540" font-family="${FONT}" font-size="22" font-weight="600" fill="#FFFFFF">getflyright.com</text>
  <text x="290" y="540" font-family="${FONT}" font-size="22" fill="#8FA2BB">· free on the App Store and Google Play</text>
</svg>`;

await sharp(Buffer.from(svg))
  .composite([{ input: phone, left: W - shotMeta.width - 20 - 90, top: 44 }])
  .png()
  .toFile('public/og-image.png');

await sharp('assets/images/icon.png').resize(180, 180).png().toFile('public/apple-touch-icon.png');
console.log('wrote public/og-image.png and public/apple-touch-icon.png');
