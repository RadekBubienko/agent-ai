"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AgentPageHeaderProps = {
  title: string;
  description: string;
  primaryAction?: {
    href: string;
    label: string;
  };
};

const navigationLinks = [
  { href: "/", label: "Strona główna" },
  { href: "/agent", label: "Dashboard" },
  { href: "/agent/leads", label: "Leady" },
];

function linkClasses(isActive: boolean) {
  return isActive
    ? "rounded-full bg-black px-4 py-2 text-sm font-medium text-white shadow-sm"
    : "rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50";
}

export default function AgentPageHeader({
  title,
  description,
  primaryAction,
}: AgentPageHeaderProps) {
  const pathname = usePathname();

  return (
    <div className="mb-8 rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {navigationLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={linkClasses(pathname === link.href)}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">
              {title}
            </h1>
            <p className="max-w-2xl text-sm text-gray-600 sm:text-base">
              {description}
            </p>
          </div>
        </div>

        {primaryAction ? (
          <Link
            href={primaryAction.href}
            className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            {primaryAction.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
