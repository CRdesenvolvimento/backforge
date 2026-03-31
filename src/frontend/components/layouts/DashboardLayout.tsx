import { Link, Outlet, useLocation } from 'react-router-dom';
import { 
  Sparkles,
  LayoutDashboard, 
  Database, 
  FolderOpen, 
  Code2, 
  BarChart3, 
  CreditCard, 
  LogOut,
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
  const location = useLocation();
  const { logout, user } = useAuthStore();

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-6 flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
            <span className="text-primary-foreground font-bold">B</span>
          </div>
          <span className="font-bold text-xl tracking-tight">BACKFORGE</span>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {sidebarItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                location.pathname === item.href
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t space-y-4">
          <div className="flex items-center gap-3 px-3">
            <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center text-xs font-bold">
              {user?.name?.[0] || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || 'User'}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={logout}>
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
