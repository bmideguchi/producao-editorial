import { createElement, type ReactNode } from 'react'
import { Platform, View } from 'react-native'

type IconProps = { color?: string; size?: number }

function Glyph({ size = 18, color = 'currentColor', children }: IconProps & { children: ReactNode }) {
  if (Platform.OS !== 'web') {
    return <View style={{ width: size, height: size, borderRadius: 4, backgroundColor: color === 'currentColor' ? '#94a3b8' : color }} />
  }
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: color,
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
    },
    children,
  )
}

function path(d: string) {
  return createElement('path', { d })
}

export function IconProjects(props: IconProps) {
  return <Glyph {...props}>{path('M4 7h16v12H4z')}{path('M4 7l3-3h10l3 3')}{path('M9 11h6')}</Glyph>
}

export function IconClients(props: IconProps) {
  return <Glyph {...props}>{path('M4 20V8l8-4 8 4v12')}{path('M9 20v-6h6v6')}</Glyph>
}

export function IconSuppliers(props: IconProps) {
  return <Glyph {...props}>{path('M3 7h11v10H3z')}{path('M14 10h4l3 3v4h-7')}{path('M6 17a1.5 1.5 0 1 0 0.01 0')}{path('M17 17a1.5 1.5 0 1 0 0.01 0')}</Glyph>
}

export function IconAllocation(props: IconProps) {
  return <Glyph {...props}>{path('M4 19V5')}{path('M4 19h16')}{path('M8 16v-5')}{path('M12 16V8')}{path('M16 16v-3')}</Glyph>
}

export function IconTemplates(props: IconProps) {
  return <Glyph {...props}>{path('M8 4h9a2 2 0 0 1 2 2v14H8a2 2 0 0 0-2 2')}{path('M6 4h0a2 2 0 0 0-2 2v14')}</Glyph>
}

export function IconTeam(props: IconProps) {
  return <Glyph {...props}>{path('M16 20v-1a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v1')}{path('M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6')}{path('M20 20v-1a3 3 0 0 0-2-2.83')}{path('M16 5.13a3 3 0 0 1 0 5.75')}</Glyph>
}

export function IconServices(props: IconProps) {
  return <Glyph {...props}>{path('M12 3l8 4.5v9L12 21l-8-4.5v-9z')}{path('M12 12l8-4.5')}{path('M12 12v9')}{path('M12 12L4 7.5')}</Glyph>
}

export function IconCalendar(props: IconProps) {
  return <Glyph {...props}>{path('M5 5h14v15H5z')}{path('M8 3v4')}{path('M16 3v4')}{path('M5 10h14')}</Glyph>
}

export function IconArchive(props: IconProps) {
  return <Glyph {...props}>{path('M3 6h18v4H3z')}{path('M5 10v9h14v-9')}{path('M10 14h4')}</Glyph>
}

export function IconLogout(props: IconProps) {
  return <Glyph {...props} size={props.size ?? 16}>{path('M9 6H6v12h3')}{path('M10 12h9')}{path('M16 9l3 3-3 3')}</Glyph>
}

export function IconPencil(props: IconProps) {
  return <Glyph {...props} color={props.color ?? '#2563eb'}>{path('M4 20h4l10-10-4-4L4 16z')}{path('M13 7l4 4')}</Glyph>
}
