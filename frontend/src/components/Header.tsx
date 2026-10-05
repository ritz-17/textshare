"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";

export default function Header() {
  const { user, loading, logout } = useAuth();

  return (
    <header className="border-b border-[var(--border)]">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Text<span className="text-[var(--accent)]">Share</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {loading ? null : user ? (
            <>
              <Link href="/notes" className="btn-secondary">
                My notes
              </Link>
              <span className="hidden text-[var(--muted)] sm:inline">{user.name}</span>
              <button onClick={logout} className="btn">
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn">
                Log in
              </Link>
              <Link href="/register" className="btn-primary">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
