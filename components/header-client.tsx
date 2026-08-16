"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import mpfflLogo from "@/public/mpffl-logo-white.png";

type NavItem = { title: string; href: string; attention?: boolean };
type User = { name: string; isCommissioner: boolean; teamId: number | null };

export function HeaderClient({ items, user }: { items: NavItem[]; user: User | null }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (path: string) =>
    pathname === path || pathname?.startsWith(`${path}/`);

  const allItems = user?.isCommissioner
    ? [...items, { title: "Commissioner", href: "/admin" }]
    : items;

  const linkClass = (item: NavItem) =>
    cn(
      "transition-colors hover:text-primary",
      item.attention
        ? "text-attention hover:text-attention/80 font-medium"
        : isActive(item.href)
          ? "font-bold text-foreground"
          : "text-muted-foreground"
    );

  const renderItem = (item: NavItem, onClick?: () => void) =>
    item.href.startsWith("http") ? (
      <a
        key={item.href}
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground transition-colors hover:text-primary"
        onClick={onClick}
      >
        {item.title}
      </a>
    ) : (
      <Link key={item.href} href={item.href} className={linkClass(item)} onClick={onClick}>
        {item.title}
      </Link>
    );

  const authBlock = (
    <>
      {user ? (
        <>
          <span className="text-sm text-muted-foreground">{user.name}</span>
          <form action="/api/auth/sign-out" method="post">
            <button className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
              Sign Out
            </button>
          </form>
        </>
      ) : (
        <Link
          // Come back to whatever they were looking at.
          href={pathname && pathname !== "/" ? `/sign-in?next=${encodeURIComponent(pathname)}` : "/sign-in"}
          className={cn(
            "text-sm font-medium transition-colors hover:text-primary",
            isActive("/sign-in") ? "font-bold text-foreground" : "text-muted-foreground"
          )}
        >
          Sign In
        </Link>
      )}
    </>
  );

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-shadow duration-200",
        scrolled ? "shadow-md" : "shadow-sm"
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
        <div className="flex items-center">
          <Link
            href="/"
            className="mr-6 flex items-center space-x-2"
            /* A mouse click was leaving the :focus-visible ring drawn around
               the crest after navigation. Suppressing focus on mousedown keeps
               the ring for keyboard users, where it's the whole point. */
            onMouseDown={(e) => e.preventDefault()}
          >
            {/*
              Imported rather than referenced by path so the URL is content-
              hashed: optimized images are served immutable for a year, so a
              same-named file would keep showing the old art in every browser
              that had already cached it.
            */}
            <Image
              src={mpfflLogo}
              alt="MPFFL"
              width={25}
              height={36}
              priority
              className="h-9 w-auto"
            />
            <span className="font-bold text-primary">MPFFL</span>
          </Link>
          <nav className="hidden items-center space-x-6 text-sm font-medium md:flex">
            {allItems.map((item) => renderItem(item))}
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          <div className="hidden items-center space-x-4 md:flex">{authBlock}</div>
          <button
            className="ml-auto md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close Menu" : "Open Menu"}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-b bg-background px-4 pb-4 md:hidden">
          <nav className="flex flex-col space-y-4 py-4 text-sm">
            {allItems.map((item) => renderItem(item, () => setMenuOpen(false)))}
            <div className="mt-2 flex items-center gap-4 border-t pt-4">{authBlock}</div>
          </nav>
        </div>
      )}
    </header>
  );
}
