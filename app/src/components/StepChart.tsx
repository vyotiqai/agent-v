import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme/theme.tsx';
import { fonts, radius } from '../theme/tokens.ts';
import { Text } from './Text.tsx';

export interface StepChartProps {
  title: string;
  /** What the chart shows, in words, for screen readers. */
  summary: string;
  points: number[];
  min: number;
  max: number;
  /** The watch's alert value, drawn as a dashed line. */
  alert: number;
  alertLabel: string;
  from: string;
  to: string;
  format: (value: number) => string;
  width?: number;
  height?: number;
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * A value over time, drawn as steps (a price holds until it changes), with a dashed alert line: the
 * watch page (D67). The first and last values are labelled; the rest is the shape.
 */
export function StepChart({
  title,
  summary,
  points,
  min,
  max,
  alert,
  alertLabel,
  from,
  to,
  format,
  width = 330,
  height = 128,
}: StepChartProps) {
  const { colors } = useTheme();
  const top = 22;
  const bottom = height - 6;
  const y = (v: number) => round(bottom - ((v - min) / (max - min)) * (bottom - top));
  const step = (width - 12) / (points.length - 1);
  const first = points[0] ?? min;
  const last = points[points.length - 1] ?? first;
  let d = `M0 ${y(first)}`;
  for (let i = 1; i < points.length; i++) d += ` H${round(i * step)} V${y(points[i] as number)}`;
  const xe = round((points.length - 1) * step);
  const ya = y(alert);
  return (
    <View
      accessibilityLabel={title}
      style={{
        paddingTop: 14,
        paddingHorizontal: 18,
        paddingBottom: 12,
        borderRadius: radius.block,
        backgroundColor: colors.surface,
        gap: 10,
      }}
    >
      <Text
        variant="caption"
        color="inkMuted"
        natural
        accessibilityRole="header"
        style={{ fontFamily: fonts.sans500, marginBottom: 2 }}
      >
        {title}
      </Text>
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        accessible
        accessibilityRole="image"
        accessibilityLabel={summary}
        style={{ overflow: 'visible' }}
      >
        <Line
          x1={0}
          y1={ya}
          x2={width}
          y2={ya}
          stroke={colors.inkMuted}
          strokeWidth={1}
          strokeDasharray="3 4"
        />
        <SvgText
          x={0}
          y={ya - 7}
          fontSize={12}
          fontFeatureSettings="'tnum'"
          fontFamily={fonts.sans400}
          fill={colors.inkMuted}
        >
          {alertLabel}
        </SvgText>
        <SvgText
          x={0}
          y={y(first) - 9}
          fontSize={12}
          fontFeatureSettings="'tnum'"
          fontFamily={fonts.sans400}
          fill={colors.inkMuted}
        >
          {format(first)}
        </SvgText>
        <Path
          d={d}
          fill="none"
          stroke={colors.ink}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle
          cx={xe}
          cy={y(last)}
          r={5}
          fill={colors.ink}
          stroke={colors.surface}
          strokeWidth={2}
        />
        <SvgText
          x={xe + 5}
          y={y(last) + 20}
          textAnchor="end"
          fontSize={12}
          fontFeatureSettings="'tnum'"
          fontFamily={fonts.sans500}
          fill={colors.ink}
        >
          {format(last)}
        </SvgText>
      </Svg>
      <View
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', justifyContent: 'space-between' }}
      >
        <Text variant="micro" color="inkMuted" natural>
          {from}
        </Text>
        <Text variant="micro" color="inkMuted" natural>
          {to}
        </Text>
      </View>
    </View>
  );
}
