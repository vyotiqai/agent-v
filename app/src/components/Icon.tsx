import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { type IconName, icons } from '../theme/icons.ts';

export interface IconProps {
  name: IconName;
  /** 20 in buttons, 18 in marks, 15 in chips (stage 5, section 5). */
  size?: number;
  stroke?: number;
  color: string;
  /** Only when the icon stands alone and means something; otherwise screen readers skip it. */
  label?: string;
}

/** One icon from Agent V's set: a 24-unit grid, drawn in one colour, 1.75 stroke, round ends. */
export function Icon({ name, size = 20, stroke = 1.75, color, label }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={label !== undefined}
      accessibilityLabel={label}
      accessibilityRole={label ? 'image' : undefined}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    >
      {icons[name].map(([tag, a], i) => {
        const fill = 'fill' in a && a.fill ? color : 'none';
        const key = `${tag}${i}`;
        if (tag === 'path') return <Path key={key} d={a.d} fill={fill} />;
        if (tag === 'circle') return <Circle key={key} cx={a.cx} cy={a.cy} r={a.r} fill={fill} />;
        return (
          <Rect key={key} x={a.x} y={a.y} width={a.width} height={a.height} rx={a.rx} fill="none" />
        );
      })}
    </Svg>
  );
}
