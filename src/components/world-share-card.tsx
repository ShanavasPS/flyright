import { forwardRef, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { WORLD, buildWorldMap, fitViewBox } from '@/services/geo';
import type { JourneyRow } from '@/services/journeys';
import type { ShareCopy, ShareFormat } from '@/services/world-share';

/** Design size of the card in logical points. It is captured at three times
 * this (1080 px wide), the size Instagram and Facebook want. */
export const CARD_WIDTH = 360;
export const CARD_HEIGHT: Record<ShareFormat, number> = { story: 640, square: 360 };

/** The card never follows the phone's theme: it is the brand's night flight
 * wherever it lands, so a feed of shared cards reads as one product. */
const BRAND = {
  bg: '#070F20',
  surface: '#101D34',
  land: '#1B2C4A',
  tint: '#4E9BF5',
  green: '#2FD68C',
  text: '#F2F6FB',
  muted: '#8FA2BB',
};

/** The shareable poster: headline, the offline atlas fitted to the routes,
 * the numbers, the records, the brand. Plain `Text`, fixed colours — see
 * BRAND. Pass the ref on to `captureRef`. */
export const WorldShareCard = forwardRef<
  View,
  { rows: JourneyRow[]; copy: ShareCopy; format: ShareFormat; now: Date }
>(function WorldShareCard({ rows, copy, format, now }, ref) {
  const story = format === 'story';
  const height = CARD_HEIGHT[format];
  const pad = story ? 24 : 20;
  const mapHeight = story ? (copy.single ? 250 : 220) : 128;
  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.card, { width: CARD_WIDTH, height, padding: pad }]}>
      <View style={[styles.brandRow, !story && styles.brandRowTight]}>
        <Text style={styles.brand}>FLYRIGHT</Text>
        {!story && <Text style={styles.eyebrowInline}>{copy.eyebrow}</Text>}
      </View>

      {story && <Text style={styles.eyebrow}>{copy.eyebrow}</Text>}
      <Text
        style={[
          styles.title,
          story ? { fontSize: copy.single ? 40 : 36, lineHeight: 44 } : { fontSize: 26, lineHeight: 32 },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}>
        {copy.title}
      </Text>
      {copy.subtitle && (
        <Text style={styles.subtitle} numberOfLines={story ? 2 : 1}>
          {copy.subtitle}
        </Text>
      )}

      <View style={[styles.map, { height: mapHeight, marginVertical: story ? 16 : 12 }]}>
        <ShareAtlas
          rows={rows}
          now={now}
          width={CARD_WIDTH - pad * 2}
          height={mapHeight}
          pad={copy.single ? 0.7 : 0.3}
        />
      </View>

      <View style={styles.stats}>
        {copy.stats.map((stat) => (
          <View key={stat.label} style={[styles.stat, !story && styles.statTight]}>
            <Text style={[styles.statValue, { fontSize: story ? 24 : 20 }]} numberOfLines={1}>
              {stat.value}
            </Text>
            <Text style={styles.statLabel} numberOfLines={1}>
              {stat.label}
            </Text>
          </View>
        ))}
      </View>

      {story && copy.details.length > 0 && (
        <View style={styles.details}>
          {copy.details.map((detail, i) => (
            <View key={detail.label} style={[styles.detail, i > 0 && styles.detailDivider]}>
              <Text style={styles.detailLabel}>{detail.label.toUpperCase()}</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {detail.value}
              </Text>
            </View>
          ))}
        </View>
      )}
      {!story && copy.details.length > 0 && (
        <Text style={styles.detailsLine} numberOfLines={1}>
          {copy.details
            .slice(0, 2)
            .map((d) => `${d.label} · ${d.value}`)
            .join('   ')}
        </Text>
      )}

      <View style={styles.spacer} />
      <View style={styles.footer}>
        <View style={styles.footerDot} />
        <Text style={styles.footerText}>getflyright.com</Text>
      </View>
    </View>
  );
});

/** The offline SVG atlas in brand colours, fitted to the rows. */
function ShareAtlas({
  rows,
  now,
  width,
  height,
  pad,
}: {
  rows: JourneyRow[];
  now: Date;
  width: number;
  height: number;
  pad: number;
}) {
  const data = useMemo(() => buildWorldMap(rows, now), [rows, now]);
  const box = useMemo(
    () => fitViewBox(data.fitPoints, width / height, pad, WORLD.width / 12),
    [data, width, height, pad],
  );
  const u = box.width / width; // map units per point
  return (
    <Svg width={width} height={height} viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}>
      <Path d={WORLD.land} fill={BRAND.land} fillRule="evenodd" />
      {data.routes.map((route) =>
        route.paths.map((d, i) => (
          <Path
            key={`${route.key}-${i}`}
            d={d}
            fill="none"
            stroke={BRAND.tint}
            strokeWidth={(1.8 + Math.min(route.count - 1, 4) * 0.3) * u}
            strokeLinecap="round"
            strokeOpacity={route.upcomingOnly ? 0.7 : 1}
            strokeDasharray={route.upcomingOnly ? `${4.5 * u},${3.5 * u}` : undefined}
          />
        )),
      )}
      {data.airports.map((airport) => (
        <Circle
          key={`halo-${airport.iata}`}
          cx={airport.x}
          cy={airport.y}
          r={(4 + Math.min(airport.count, 6) * 0.4) * u}
          fill={BRAND.tint}
          opacity={0.25}
        />
      ))}
      {data.airports.map((airport) => (
        <Circle
          key={`dot-${airport.iata}`}
          cx={airport.x}
          cy={airport.y}
          r={2 * u}
          fill="#FFFFFF"
          stroke={BRAND.tint}
          strokeWidth={1.2 * u}
        />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BRAND.bg,
    overflow: 'hidden',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  brandRowTight: {
    marginBottom: 6,
  },
  brand: {
    color: BRAND.green,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.4,
  },
  eyebrow: {
    color: BRAND.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  eyebrowInline: {
    color: BRAND.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    flexShrink: 1,
    textAlign: 'right',
  },
  title: {
    color: BRAND.text,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: BRAND.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  map: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: BRAND.bg,
    borderWidth: 1,
    borderColor: BRAND.surface,
  },
  stats: {
    flexDirection: 'row',
    gap: 8,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: BRAND.surface,
  },
  statTight: {
    paddingVertical: 7,
  },
  statValue: {
    color: BRAND.text,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  statLabel: {
    color: BRAND.muted,
    fontSize: 11,
    marginTop: 2,
  },
  details: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: BRAND.surface,
    paddingHorizontal: 14,
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
  },
  detailDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BRAND.land,
  },
  detailLabel: {
    color: BRAND.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  detailValue: {
    color: BRAND.text,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  detailsLine: {
    color: BRAND.muted,
    fontSize: 11,
    marginTop: 10,
  },
  spacer: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  footerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BRAND.green,
  },
  footerText: {
    color: BRAND.muted,
    fontSize: 11,
    fontWeight: '600',
  },
});
