/** The iOS "Next flight" home-screen and Lock Screen widget (expo-widgets).
 *
 * The function below runs in the widget extension's own JS runtime, not the
 * app's: the 'widget' directive ships its body as a string, so it can use
 * only @expo/ui/swift-ui components and modifiers (globals there), no hooks,
 * and nothing declared outside it — every colour and helper lives inside.
 * Its props come from services/home-widget-content.ts, which also decides
 * when the card changes; the clocks here tick in SwiftUI between entries.
 *
 * Colours are the Live Activity's (targets/FlyRightWidget): the card is
 * navy in both appearances, like the lock-screen card it sits beside. */

import {
  HStack,
  Image,
  ProgressView,
  Spacer,
  Text,
  VStack,
} from '@expo/ui/swift-ui';
import {
  containerBackground,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  labelsHidden,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  multilineTextAlignment,
  opacity,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { NextFlightProps } from '@/services/home-widget-content';

const NextFlight = (props: NextFlightProps, environment: WidgetEnvironment) => {
  'widget';
  const NAVY = '#0C1B36';
  const NAVY_DEEP = '#070F20';
  const WHITE = '#F2F6FB';
  const COBALT = '#7FB1F2';
  const AMBER = '#F2B441';
  const GREEN = '#2FD68C';

  const family = environment.widgetFamily;
  const now = environment.date;
  const live = props.kind === 'live';
  const accent = props.tone === 'delay' ? AMBER : props.tone === 'landed' ? GREEN : COBALT;
  const route = `${props.fromCode} → ${props.toCode}`;
  const when = [props.dayLabel, props.depTime].filter(Boolean).join(' · ');
  // Within a day of take-off the words "Today" give way to a ticking
  // "in 3 hr, 12 min".
  const soon = props.departsAt > 0 && props.departsAt - now.getTime() < 86400000;
  const ticking = live && props.countdownEnd > now.getTime();
  const inAir = live && props.clockLabel === 'LANDS IN';

  const background = containerBackground(
    {
      type: 'linearGradient',
      colors: [NAVY, NAVY_DEEP],
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 1, y: 1 },
    },
    'widget',
  );

  const label = (text: string, color: string) => (
    <Text modifiers={[font({ size: 11, weight: 'heavy', design: 'rounded' }), foregroundStyle(color), lineLimit(1)]}>
      {text}
    </Text>
  );

  const dim = (text: string, size: number) => (
    <Text modifiers={[font({ size, weight: 'semibold' }), foregroundStyle(WHITE), opacity(0.62), lineLimit(1)]}>
      {text}
    </Text>
  );

  // A timer Text reserves its widest width; `align` decides which side of
  // that box the digits sit on.
  const clock = (size: number, align: 'leading' | 'trailing' = 'leading') =>
    ticking ? (
      <Text
        timerInterval={{ lower: now, upper: new Date(props.countdownEnd) }}
        countsDown
        modifiers={[font({ size, weight: 'heavy', design: 'rounded' }), monospacedDigit(), foregroundStyle(WHITE), minimumScaleFactor(0.6), lineLimit(1), multilineTextAlignment(align)]}
      />
    ) : (
      <Text modifiers={[font({ size, weight: 'heavy', design: 'rounded' }), foregroundStyle(WHITE), minimumScaleFactor(0.6), lineLimit(1)]}>
        {props.clockLabel.startsWith('LANDED') ? 'Landed' : props.clockLabel}
      </Text>
    );

  const countdown = (size: number) =>
    soon ? (
      <Text
        date={new Date(props.departsAt)}
        dateStyle="relative"
        modifiers={[font({ size, weight: 'bold' }), foregroundStyle(WHITE), minimumScaleFactor(0.7), lineLimit(1)]}
      />
    ) : (
      <Text modifiers={[font({ size, weight: 'bold' }), foregroundStyle(WHITE), lineLimit(1)]}>{props.whenLabel}</Text>
    );

  // The plane's share of the flight, advancing on its own in the air.
  const progress = () =>
    inAir && props.departsAt > 0 && props.arrivesAt > props.departsAt ? (
      <ProgressView
        timerInterval={{ lower: new Date(props.departsAt), upper: new Date(props.arrivesAt) }}
        countsDown={false}
        // Without this SwiftUI prints the elapsed time under the bar.
        modifiers={[tint(accent), labelsHidden()]}
      />
    ) : null;

  // The codes never truncate ("D… → LHR"): they keep their width and the
  // plane between them gives way.
  const codes = (size: number) => (
    <HStack spacing={5} alignment="center">
      <Text modifiers={[font({ size, weight: 'heavy', design: 'rounded' }), foregroundStyle(WHITE), fixedSize()]}>{props.fromCode}</Text>
      <Image systemName="airplane" color={accent} size={size * 0.5} />
      <Text modifiers={[font({ size, weight: 'heavy', design: 'rounded' }), foregroundStyle(WHITE), fixedSize()]}>{props.toCode}</Text>
    </HStack>
  );

  // ── Lock Screen ────────────────────────────────────────────────────────
  if (family === 'accessoryInline') {
    if (props.kind === 'none') return <Text>No flights ahead</Text>;
    return (
      <Text modifiers={[widgetURL(props.url)]}>
        {live ? `${route} · ${props.clockLabel.toLowerCase()}` : `${route} · ${props.whenLabel}`}
      </Text>
    );
  }

  if (family === 'accessoryRectangular') {
    if (props.kind === 'none') {
      return (
        <VStack alignment="leading" spacing={1} modifiers={[widgetURL(props.url)]}>
          <Text modifiers={[font({ size: 15, weight: 'bold' })]}>No flights ahead</Text>
          <Text modifiers={[font({ size: 13 }), opacity(0.7)]}>Add your next trip</Text>
        </VStack>
      );
    }
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(props.url), frame({ maxWidth: 9999, alignment: 'leading' })]}>
        <HStack spacing={4}>
          <Image systemName="airplane" size={12} />
          <Text modifiers={[font({ size: 15, weight: 'bold' }), lineLimit(1)]}>{route}</Text>
        </HStack>
        {live ? (
          ticking ? (
            <HStack spacing={4}>
              <Text modifiers={[font({ size: 13, weight: 'semibold' })]}>{props.clockLabel === 'LANDS IN' ? 'Lands in' : 'Departs in'}</Text>
              <Text timerInterval={{ lower: now, upper: new Date(props.countdownEnd) }} countsDown modifiers={[font({ size: 13, weight: 'semibold' }), monospacedDigit()]} />
            </HStack>
          ) : (
            <Text modifiers={[font({ size: 13, weight: 'semibold' }), lineLimit(1)]}>{props.subtitle}</Text>
          )
        ) : (
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), lineLimit(1)]}>{props.whenLabel}</Text>
        )}
        <Text modifiers={[font({ size: 13 }), opacity(0.7), lineLimit(1)]}>
          {live && props.leadValue ? `${props.leadLabel} ${props.leadValue}` : when}
        </Text>
      </VStack>
    );
  }

  // ── Home Screen ────────────────────────────────────────────────────────
  if (props.kind === 'none') {
    return (
      <VStack alignment="leading" spacing={4} modifiers={[background, widgetURL(props.url), frame({ maxWidth: 9999, maxHeight: 9999, alignment: 'topLeading' })]}>
        {label('FLYRIGHT', COBALT)}
        <Spacer />
        <Image systemName="airplane.departure" color={COBALT} size={26} />
        <Text modifiers={[font({ size: 17, weight: 'bold' }), foregroundStyle(WHITE)]}>No flights ahead</Text>
        {dim('Tap to add your next trip', 12)}
      </VStack>
    );
  }

  if (family === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={3} modifiers={[background, widgetURL(props.url), frame({ maxWidth: 9999, maxHeight: 9999, alignment: 'topLeading' })]}>
        <HStack spacing={4}>
          {label(live ? props.clockLabel.replace(/ \d.*$/, '') : 'NEXT FLIGHT', live ? accent : COBALT)}
          <Spacer />
          {props.delayChip ? label(props.delayChip, AMBER) : null}
        </HStack>
        {live ? clock(26) : codes(22)}
        {/* The times, not the cities: a city name never fits the small card.
            No arrow — each time sits under its own airport. */}
        {live ? (
          codes(15)
        ) : props.depTime ? (
          <HStack spacing={4}>
            {dim(props.depTime, 11)}
            <Spacer />
            {dim(props.arrTime, 11)}
          </HStack>
        ) : null}
        <Spacer />
        {live ? (
          <VStack alignment="leading" spacing={2}>
            {progress()}
            {props.leadValue ? (
              <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(accent), lineLimit(1)]}>
                {`${props.leadLabel} ${props.leadValue}`}
              </Text>
            ) : null}
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(WHITE), opacity(0.75), lineLimit(2)]}>
              {props.subtitle}
            </Text>
          </VStack>
        ) : (
          <VStack alignment="leading" spacing={1}>
            {countdown(16)}
            {dim(props.dayLabel, 11)}
          </VStack>
        )}
      </VStack>
    );
  }

  // systemMedium
  const timeColumn = (code: string, city: string, time: string, align: 'leading' | 'trailing') => (
    <VStack alignment={align} spacing={0}>
      <Text modifiers={[font({ size: 30, weight: 'heavy', design: 'rounded' }), foregroundStyle(WHITE)]}>{code}</Text>
      {dim(city, 11)}
      {time ? (
        <Text modifiers={[font({ size: 13, weight: 'bold' }), monospacedDigit(), foregroundStyle(WHITE)]}>{time}</Text>
      ) : null}
    </VStack>
  );

  return (
    <VStack alignment="leading" spacing={6} modifiers={[background, widgetURL(props.url), frame({ maxWidth: 9999, maxHeight: 9999, alignment: 'topLeading' })]}>
      <HStack spacing={6}>
        {label(live ? props.clockLabel.replace(/ \d.*$/, '') : 'NEXT FLIGHT', live ? accent : COBALT)}
        {label(props.flightLabel, WHITE)}
        <Spacer />
        {props.delayChip ? label(props.delayChip, AMBER) : null}
        {live ? clock(20, 'trailing') : countdown(15)}
      </HStack>
      <HStack alignment="center" spacing={8}>
        {timeColumn(props.fromCode, props.fromCity, props.depTime, 'leading')}
        <VStack spacing={4} modifiers={[frame({ maxWidth: 9999 })]}>
          <Image systemName="airplane" color={accent} size={16} />
          {progress()}
        </VStack>
        {timeColumn(props.toCode, props.toCity, props.arrTime, 'trailing')}
      </HStack>
      <Spacer />
      <HStack spacing={6}>
        {live ? (
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(WHITE), opacity(0.8), lineLimit(1)]}>
            {props.leadValue ? `${props.leadLabel} ${props.leadValue} · ${props.subtitle}` : props.subtitle}
          </Text>
        ) : (
          dim(props.dayLabel, 12)
        )}
        <Spacer />
        {props.laterCount > 0
          ? dim(props.laterCount === 1 ? '+1 more flight' : `+${props.laterCount} more flights`, 11)
          : null}
      </HStack>
    </VStack>
  );
};

export default createWidget<NextFlightProps>('NextFlight', NextFlight);
