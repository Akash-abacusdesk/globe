import Link from "next/link";

const options = [
  { href: "/", label: "SVG", id: "svg" },
  { href: "/webgl", label: "WebGL", id: "webgl" },
] as const;

// Demo chrome for comparing the two renderers; not part of the section itself.
export default function RendererSwitch({ current }: { current: "svg" | "webgl" }) {
  return (
    <nav
      aria-label="Globe renderer"
      className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 pt-4 text-sm md:px-8"
    >
      <span className="text-muted">Renderer</span>
      <div className="flex gap-1">
        {options.map((o) => (
          <Link
            key={o.id}
            href={o.href}
            aria-current={o.id === current ? "page" : undefined}
            className={`inline-flex min-h-11 items-center px-3 transition-colors duration-300 ${o.id === current ? "text-ink underline decoration-signal underline-offset-8" : "text-muted hover:text-ink"}`}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
