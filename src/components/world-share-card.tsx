import { Image } from 'expo-image';
import { forwardRef } from 'react';
import { StyleSheet, Text, View, type TextProps } from 'react-native';
import Svg, { Circle, Defs, Image as SvgImage, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { WORLD } from '@/services/geo';
import {
  POSTER,
  SHARE_CARD,
  type PosterTheme,
  type ShareCopy,
  type ShareFormat,
  type ShareMapModel,
} from '@/services/world-share';

/** The poster is a picture that gets shared, not text read in the app: it
 * must look the same whatever the sharer's text size, so it ignores it. */
function PosterText(props: TextProps) {
  return <Text allowFontScaling={false} {...props} />;
}

/** The shareable poster: the atlas across the top, edge to edge and fading
 * into the card, with the headline on it; the numbers, the records and the
 * brand below. Plain `Text`, the poster theme's fixed colours (see POSTER) —
 * never the phone's. `heatUri` is the GPU-drawn route-density glow for this
 * exact map (services/route-heat), laid under the routes; null draws the
 * plain atlas. Pass the ref on to `captureRef`. */
export const WorldShareCard = forwardRef<
  View,
  {
    model: ShareMapModel;
    copy: ShareCopy;
    format: ShareFormat;
    theme: PosterTheme;
    heatUri: string | null;
  }
>(function WorldShareCard({ model, copy, format, theme, heatUri }, ref) {
  const story = format === 'story';
  const palette = POSTER[theme];
  const height = SHARE_CARD.height[format];
  const band = SHARE_CARD.band[format];
  const pad = story ? 24 : 20;
  const tile = { backgroundColor: theme === 'dark' ? `${palette.surface}99` : palette.surface, borderColor: palette.border };
  const text = { color: palette.text };
  const muted = { color: palette.muted };
  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.card, { width: SHARE_CARD.width, height, backgroundColor: palette.bg }]}>
      {/* The square has no room to stack headline above map, so its band
          starts lower and the top scrim holds longer: the title sits on
          solid card, not on the glow. */}
      <View style={[styles.band, { top: story ? 0 : 20, height: band }]}>
        <ShareAtlas model={model} theme={theme} heatUri={heatUri} />
        <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: scrim(palette.bg, story) }]} />
      </View>

      <View style={[styles.block, { top: 0, padding: pad, paddingTop: story ? pad : 18 }]}>
        <View style={[styles.brandRow, !story && styles.brandRowTight]}>
          <PosterText style={[styles.brand, { color: palette.green }]}>FLYRIGHT</PosterText>
          {!story && (
            <PosterText style={[styles.eyebrowInline, muted]} numberOfLines={1}>
              {copy.eyebrow}
            </PosterText>
          )}
        </View>
        {story && <PosterText style={[styles.eyebrow, muted]}>{copy.eyebrow}</PosterText>}
        <PosterText
          style={[
            styles.title,
            text,
            story ? { fontSize: copy.single ? 40 : 36, lineHeight: 44 } : { fontSize: 22, lineHeight: 28 },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}>
          {copy.title}
        </PosterText>
        {copy.subtitle && (
          <PosterText style={[styles.subtitle, muted]} numberOfLines={story ? 2 : 1}>
            {copy.subtitle}
          </PosterText>
        )}
      </View>

      <View
        style={[
          styles.block,
          story ? { top: band - 28 } : { bottom: copy.details.length > 0 ? 80 : 36 },
          { paddingHorizontal: pad },
        ]}>
        <View style={styles.stats}>
          {copy.stats.map((stat) => (
            <View key={stat.label} style={[styles.stat, tile, !story && styles.statTight]}>
              <PosterText
                style={[styles.statValue, text, { fontSize: story ? 24 : 20 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}>
                <StatValue value={stat.value} size={story ? 24 : 20} />
              </PosterText>
              <PosterText style={[styles.statLabel, muted]} numberOfLines={1}>
                {stat.label}
              </PosterText>
            </View>
          ))}
        </View>
        {story && copy.details.length > 0 && (
          <View style={[styles.details, tile]}>
            {copy.details.map((detail, i) => (
              <View
                key={detail.label}
                style={[styles.detail, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.divider }]}>
                <PosterText style={[styles.detailLabel, muted]}>{detail.label.toUpperCase()}</PosterText>
                <PosterText
                  style={[styles.detailValue, text]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}>
                  {detail.value}
                </PosterText>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={[styles.footer, !story && styles.footerStacked, { bottom: story ? 24 : 14, left: pad, right: pad }]}>
        {!story && copy.details.length > 0 ? (
          // One record per line at full width, the brand on its own line under
          // them: "Longest flight · DXB → LAX · 16 hrs 18 min" clipped when it
          // shared the row with getflyright.com.
          <View style={styles.detailsLines}>
            {copy.details.slice(0, 2).map((d) => (
              <PosterText key={d.label} style={[styles.detailsLine, muted]} numberOfLines={1}>
                {d.label} · <PosterText style={[styles.detailsLineValue, text]}>{d.value}</PosterText>
              </PosterText>
            ))}
          </View>
        ) : (
          <View />
        )}
        <View style={[styles.footerBrand, !story && styles.footerBrandStacked]}>
          <View style={[styles.footerDot, { backgroundColor: palette.green }]} />
          <PosterText style={[styles.footerText, muted]}>getflyright.com</PosterText>
        </View>
      </View>
    </View>
  );
});

/** A number with its unit the way type wants it: the digits at full size,
 * the unit smaller and a hair apart, on the same baseline — "70 hrs" with a
 * small "hrs". "45 min" and "9 hrs 40 min" work the same way; a bare number
 * or a word passes through. */
function StatValue({ value, size }: { value: string; size: number }) {
  const parts = value.match(/\d[\d,.]*|[^\d\s,.]+/g) ?? [value];
  return (
    <>
      {parts.map((part, i) =>
        /^[^\d\s,.]+$/.test(part) ? (
          <PosterText key={i} style={{ fontSize: Math.round(size * 0.58), fontWeight: '700', letterSpacing: 0 }}>
            {' '}
            {part}
          </PosterText>
        ) : (
          <PosterText key={i}>
            {i > 0 ? ' ' : ''}
            {part}
          </PosterText>
        ),
      )}
    </>
  );
}

/** The band's fade: solid card colour behind the headline, clear over the
 * middle, solid again where the numbers start. Hex-8 stops — RN's gradient
 * parser takes those; rgba() strings it does not. */
function scrim(bg: string, story: boolean): string {
  const stop = (alpha: number) => `${bg}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
  return story
    ? `linear-gradient(180deg, ${stop(0.9)} 0%, ${stop(0.3)} 24%, ${stop(0)} 40%, ${stop(0)} 78%, ${stop(1)} 100%)`
    : `linear-gradient(180deg, ${stop(1)} 0%, ${stop(0.88)} 20%, ${stop(0)} 48%, ${stop(0)} 62%, ${stop(1)} 82%)`;
}

/** The poster's backdrops (scripts/generate-poster-textures.mjs): the Earth
 * by day for the light poster, at night with its city lights for the dark
 * one — the same NASA imagery the World globe shows. */
const BACKDROP: Record<PosterTheme, number> = {
  dark: require('../../assets/images/poster-night.jpg'),
  light: require('../../assets/images/poster-day.jpg'),
};

/** Where a full equirectangular image (latitude 90 → −90) sits in the
 * atlas's viewBox, which is the same projection cropped to WORLD.latTop …
 * latBottom: above the top edge and below the bottom one, in map units. */
const BACKDROP_FRAME = (() => {
  const perDegree = WORLD.height / (WORLD.latTop - WORLD.latBottom);
  return { y: -(90 - WORLD.latTop) * perDegree, height: 180 * perDegree };
})();

/** A band taller than the world (the whole-world story poster) runs past
 * both poles. What continues there is each backdrop's own edge colour —
 * the Arctic sea at the top, Antarctica's ice at the bottom (the mean of
 * the image's outermost rows) — fading into the card, so the imagery ends
 * in a fade, not in a hard line against the card. */
const POLE: Record<PosterTheme, { top: string; bottom: string }> = {
  dark: { top: '#0F1D3A', bottom: '#4A5569' },
  light: { top: '#09193B', bottom: '#EFEFEF' },
};

/** The atlas fitted to the model's box: the Earth imagery first, the heat
 * over it (so the coast shows through the glow), the lines and dots on top.
 * The SVG crops the imagery to the viewBox; `preserveAspectRatio="none"`
 * stretches the whole image onto the frame so longitude and latitude land
 * where the routes are projected. */
function ShareAtlas({ model, theme, heatUri }: { model: ShareMapModel; theme: PosterTheme; heatUri: string | null }) {
  const palette = POSTER[theme];
  const { map, box, width, height } = model;
  const viewBox = `${box.x} ${box.y} ${box.width} ${box.height}`;
  const u = box.width / width; // map units per point
  return (
    <>
      <Svg width={width} height={height} viewBox={viewBox} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="pole-top" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.bg} />
            <Stop offset="1" stopColor={POLE[theme].top} />
          </LinearGradient>
          <LinearGradient id="pole-bottom" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={POLE[theme].bottom} />
            <Stop offset="1" stopColor={palette.bg} />
          </LinearGradient>
        </Defs>
        {BACKDROP_FRAME.y > box.y && (
          <Rect x={box.x} y={box.y} width={box.width} height={BACKDROP_FRAME.y - box.y} fill="url(#pole-top)" />
        )}
        {box.y + box.height > BACKDROP_FRAME.y + BACKDROP_FRAME.height && (
          <Rect
            x={box.x}
            y={BACKDROP_FRAME.y + BACKDROP_FRAME.height}
            width={box.width}
            height={box.y + box.height - BACKDROP_FRAME.y - BACKDROP_FRAME.height}
            fill="url(#pole-bottom)"
          />
        )}
        <SvgImage
          href={BACKDROP[theme]}
          x={0}
          y={BACKDROP_FRAME.y}
          width={WORLD.width}
          height={BACKDROP_FRAME.height}
          preserveAspectRatio="none"
        />
      </Svg>
      {heatUri && (
        <Image
          source={{ uri: heatUri }}
          style={StyleSheet.absoluteFill}
          contentFit="fill"
          cachePolicy="none"
          accessibilityIgnoresInvertColors
        />
      )}
      <Svg width={width} height={height} viewBox={viewBox} style={StyleSheet.absoluteFill}>
        {map.routes.map((route) =>
          route.paths.map((d, i) => (
            <Path
              key={`${route.key}-${i}`}
              d={d}
              fill="none"
              stroke={palette.tint}
              strokeWidth={(1.4 + Math.min(route.count - 1, 4) * 0.3) * u}
              strokeLinecap="round"
              strokeOpacity={route.upcomingOnly ? 0.7 : 0.95}
              strokeDasharray={route.upcomingOnly ? `${4.5 * u},${3.5 * u}` : undefined}
            />
          )),
        )}
        {map.airports.map((airport) => (
          <Circle
            key={`halo-${airport.iata}`}
            cx={airport.x}
            cy={airport.y}
            r={(4 + Math.min(airport.count, 6) * 0.4) * u}
            fill={palette.tint}
            opacity={0.25}
          />
        ))}
        {map.airports.map((airport) => (
          <Circle
            key={`dot-${airport.iata}`}
            cx={airport.x}
            cy={airport.y}
            r={2 * u}
            fill={palette.dot}
            stroke={palette.tint}
            strokeWidth={1.2 * u}
          />
        ))}
      </Svg>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  band: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  block: {
    position: 'absolute',
    left: 0,
    right: 0,
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
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.4,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  eyebrowInline: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    flexShrink: 1,
    textAlign: 'right',
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
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
    borderWidth: 1,
  },
  statTight: {
    paddingVertical: 7,
  },
  statValue: {
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  details: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  detailsLines: {
    flexShrink: 1,
    gap: 2,
  },
  detailsLine: {
    fontSize: 11,
    lineHeight: 14,
  },
  detailsLineValue: {
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  footerStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
  },
  footerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerBrandStacked: {
    alignSelf: 'flex-end',
  },
  footerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
