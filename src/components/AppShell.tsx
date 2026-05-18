import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

interface AppShellProps {
  children: ReactNode;
  rightSlot?: ReactNode;
}

export function AppShell({ children, rightSlot }: AppShellProps) {
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
          {rightSlot}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
