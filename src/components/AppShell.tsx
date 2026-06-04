import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AppShellProps {
  children: ReactNode;
  rightSlot?: ReactNode;
}

export function AppShell({ children, rightSlot }: AppShellProps) {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const onSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-primary text-primary-foreground font-mono font-semibold text-sm">
              SGT
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight leading-none">Student Genuineness Test</p>
              <p className="label-mono mt-1">Admissions Intelligence Platform</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            {rightSlot}
            {signedIn && (
              <button
                onClick={onSignOut}
                className="inline-flex items-center gap-2 rounded-[10px] border border-border px-3 py-2 text-sm hover:bg-elevated"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
