import { NavLink, Outlet } from 'react-router-dom';
import {
  BarChart3,
  Code2,
  CreditCard,
  Database,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { useAuthStore } from '../../modules/auth/auth.store';
import { isEnabled } from '../../lib/flags';

const sidebarItems = [
  ...(isEnabled('newDashboard') ? [{ icon: Sparkles, label: 'Overview', href: '/overview' }] : []),
  { icon: LayoutDashboard, label: 'Projects', href: '/projects' },
  { icon: Database, label: 'Database', href: '/database' },
  { icon: FolderOpen, label: 'Storage', href: '/storage' },
  { icon: Code2, label: 'API Keys', href: '/api' },
  { icon: BarChart3, label: 'Growth', href: '/analytics' },
  { icon: CreditCard, label: 'Billing', href: '/billing' },
];

export function DashboardLayout() {
  const { logout, user } = useAuthStore();

  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      <aside className="relative overflow-hidden border-b border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.78))] lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.14),_transparent_32%)]" />

        <div className="relative flex h-full flex-col">
          <div className="flex items-center justify-between gap-4 px-6 pb-4 pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/90 text-primary-foreground shadow-[0_12px_30px_rgba(249,115,22,0.32)]">
                <span className="text-lg font-bold">B</span>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-300/65">Platform</div>
                <div className="text-xl font-semibold tracking-tight text-white">BACKFORGE</div>
              </div>
            </div>

            <Button variant="ghost" size="icon" className="rounded-2xl text-slate-300 hover:bg-white/10 hover:text-white lg:hidden" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>

          <nav className="relative flex gap-2 overflow-x-auto px-4 pb-4 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-4">
            {sidebarItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                className={({ isActive }) => cn(
                  'group inline-flex min-w-fit items-center gap-3 rounded-[1.15rem] px-4 py-3 text-sm font-medium transition',
                  'lg:w-full',
                  isActive
                    ? 'bg-white text-slate-950 shadow-[0_18px_40px_rgba(255,255,255,0.14)]'
                    : 'text-slate-300/74 hover:bg-white/8 hover:text-white'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="relative hidden border-t border-white/8 p-4 lg:block">
            <div className="rounded-[1.4rem] border border-white/8 bg-white/6 p-4 shadow-[0_18px_34px_rgba(2,6,23,0.18)]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
                  {user?.name?.[0] || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{user?.name || 'User'}</p>
                  <p className="truncate text-xs text-slate-300/68">{user?.email}</p>
                </div>
              </div>
              <Button variant="ghost" className="mt-4 w-full justify-start gap-3 rounded-2xl text-slate-300 hover:bg-white/10 hover:text-white" onClick={logout}>
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </aside>

      <main className="relative flex-1 overflow-y-auto">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(249,115,22,0.06),_transparent_26%),radial-gradient(circle_at_top_left,_rgba(14,165,233,0.08),_transparent_22%)]" />
        <div className="relative mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
