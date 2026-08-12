import { ComponentType } from 'react';
import {
  LayoutDashboard,
  MapPin,
  ClipboardCheck,
  BarChart3,
  Users as UsersIcon,
  Activity,
  Target,
  Calculator,
  Wallet,
  Star,
  BookOpen,
  PackageCheck,
  History,
  Building2
} from 'lucide-react';

export type PageKey =
  | 'dashboard'
  | 'monitoring'
  | 'geofence'
  | 'attendance'
  | 'reports'
  | 'users'
  | 'computation'
  | 'reviews'
  | 'payroll'
  | 'settings'
  | 'audit_logs'
  | 'daily_parcels'
  | 'parcel_history'
  | 'payroll_history'
  | 'hubs';

export type SidebarRole = 'admin' | 'hr' | 'payroll';

export interface SidebarUser {
  name: string;
  email: string;
  avatar: string;
}

export type SidebarItem =
  | {
      type: 'link';
      key: PageKey;
      label: string;
      icon: ComponentType<{ className?: string }>;
    }
  | {
      type: 'section';
      title: string;
      icon: ComponentType<{ className?: string }>;
      items: {
        key: PageKey;
        label: string;
        icon: ComponentType<{ className?: string }>;
      }[];
    };

export const ADMIN_ITEMS: SidebarItem[] = [
  {
    type: 'link',
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard
  },
  {
    type: 'section',
    title: 'Tracking & Zones',
    icon: MapPin,
    items: [
      { key: 'monitoring', label: 'Live Monitoring', icon: Activity },
      { key: 'geofence', label: 'Geofence / Zones', icon: Target },
      { key: 'hubs', label: 'Hub Management', icon: Building2 }
    ]
  },
  {
    type: 'section',
    title: 'HR & Employees',
    icon: ClipboardCheck,
    items: [
      { key: 'attendance', label: 'Attendance logs', icon: ClipboardCheck },
      { key: 'users', label: 'Users Registry', icon: UsersIcon },
      { key: 'reviews', label: 'Courier Reviews', icon: Star },
      { key: 'audit_logs', label: 'Audit Logs', icon: BookOpen }
    ]
  },
  {
    type: 'section',
    title: 'Parcel Operations',
    icon: PackageCheck,
    items: [
      { key: 'daily_parcels', label: 'Daily Parcel Entry', icon: PackageCheck },
      { key: 'parcel_history', label: 'Parcel History', icon: History }
    ]
  },
  {
    type: 'section',
    title: 'Finance & Reports',
    icon: Wallet,
    items: [
      { key: 'payroll', label: 'Payroll Checklist', icon: Wallet },
      { key: 'payroll_history', label: 'Payroll History', icon: History },
      { key: 'reports', label: 'Insights & Reports', icon: BarChart3 }
    ]
  }
];

export const HR_ITEMS: SidebarItem[] = [
  {
    type: 'link',
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard
  },
  {
    type: 'section',
    title: 'Tracking & Zones',
    icon: MapPin,
    items: [
      { key: 'monitoring', label: 'Live Monitoring', icon: Activity }
    ]
  },
  {
    type: 'section',
    title: 'HR & Employees',
    icon: ClipboardCheck,
    items: [
      { key: 'attendance', label: 'Attendance logs', icon: ClipboardCheck },
      { key: 'users', label: 'Employee Management', icon: UsersIcon },
      { key: 'reviews', label: 'Courier Reviews', icon: Star },
      { key: 'audit_logs', label: 'Audit Logs', icon: BookOpen }
    ]
  },
  {
    type: 'section',
    title: 'Parcel Operations',
    icon: PackageCheck,
    items: [
      { key: 'daily_parcels', label: 'Daily Parcel Entry', icon: PackageCheck },
      { key: 'parcel_history', label: 'Parcel History', icon: History }
    ]
  },
  {
    type: 'section',
    title: 'Finance & Reports',
    icon: Wallet,
    items: [
      { key: 'payroll', label: 'Payroll Checklist', icon: Wallet },
      { key: 'payroll_history', label: 'Payroll History', icon: History },
      { key: 'reports', label: 'Insights & Reports', icon: BarChart3 }
    ]
  }
];

export const PAYROLL_ITEMS: SidebarItem[] = [
  {
    type: 'link',
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard
  },
  {
    type: 'section',
    title: 'Compensation',
    icon: Calculator,
    items: [
      { key: 'computation', label: 'Salary Computation', icon: Calculator },
      { key: 'reports', label: 'Payroll Reports', icon: Wallet },
      { key: 'payroll_history', label: 'Payroll History', icon: History }
    ]
  },
  {
    type: 'section',
    title: 'Reference',
    icon: PackageCheck,
    items: [
      { key: 'parcel_history', label: 'Parcel History', icon: PackageCheck }
    ]
  }
];

export const ROLE_LABEL: Record<SidebarRole, string> = {
  admin: 'Admin',
  hr: 'HR',
  payroll: 'Payroll'
};

export type AccentTheme = {
  text: string;
  badgeBg: string;
  badgeBorder: string;
  badgeDot: string;
  activeBg: string;
  activeBar: string;
  iconActive: string;
  chevron: string;
  profileRing: string;
  profileHover: string;
};

export const ACCENTS: Record<SidebarRole, AccentTheme> = {
  admin: {
    text: 'text-accent-foreground',
    badgeBg: 'bg-accent',
    badgeBorder: 'border-primary/30',
    badgeDot: 'bg-primary',
    activeBg: 'bg-accent',
    activeBar: 'bg-primary',
    iconActive: 'text-primary',
    chevron: 'text-primary',
    profileRing: 'ring-primary/15',
    profileHover: 'hover:bg-accent/60'
  },
  hr: {
    text: 'text-accent-foreground',
    badgeBg: 'bg-accent',
    badgeBorder: 'border-primary/30',
    badgeDot: 'bg-primary',
    activeBg: 'bg-accent',
    activeBar: 'bg-primary',
    iconActive: 'text-primary',
    chevron: 'text-primary',
    profileRing: 'ring-primary/15',
    profileHover: 'hover:bg-accent/60'
  },
  payroll: {
    text: 'text-[#a16207]',
    badgeBg: 'bg-[#FEF3C7]',
    badgeBorder: 'border-[#ca8a04]/40',
    badgeDot: 'bg-[#ca8a04]',
    activeBg: 'bg-[#FEF9C3]',
    activeBar: 'bg-[#ca8a04]',
    iconActive: 'text-[#ca8a04]',
    chevron: 'text-[#ca8a04]',
    profileRing: 'ring-[#ca8a04]/20',
    profileHover: 'hover:bg-[#FEF9C3]/70'
  }
};

export function getSidebarNavigation(role: SidebarRole) {
  const items = role === 'admin' ? ADMIN_ITEMS : role === 'hr' ? HR_ITEMS : PAYROLL_ITEMS;
  const badgeLabel = ROLE_LABEL[role];
  const accents = ACCENTS[role];
  return { items, badgeLabel, accents };
}
