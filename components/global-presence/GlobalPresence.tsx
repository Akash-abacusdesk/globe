"use client";

import { AnimatePresence, MotionConfig, motion, useInView, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { countries as defaultCountries, type Country } from "./data/locations";
import SVGGlobe from "./globe/SVGGlobe";
import WebGLGlobeLoader from "./globe/WebGLGlobeLoader";
import { EASE } from "./utils/geo";

type Props = { renderer?: "svg" | "webgl"; countries?: Country[] };

const collapse = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1, transition: { opacity: { delay: 0.2, duration: 0.5 } } },
  exit: { height: 0, opacity: 0, transition: { duration: 0.3 } },
};

export default function GlobalPresence({ renderer = "svg", countries = defaultCountries }: Props) {
  const [activeCountryId, setActiveCountryId] = useState<string | null>(null);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const globeRef = useRef<HTMLDivElement>(null);
  const near = useInView(globeRef, { once: true, margin: "400px 0px" });
  const inView = useInView(globeRef);
  const reducedMotion = useReducedMotion() ?? false;

  const activeCountry = countries.find((c) => c.id === activeCountryId);
  const activeStore = activeCountry?.stores.find((s) => s.id === activeStoreId);
  const storeCount = countries.reduce((n, c) => n + c.stores.length, 0);
  const Globe = renderer === "webgl" ? WebGLGlobeLoader : SVGGlobe;
  const preview = (id: string | null) => () => setHoveredId(id);

  // Accordion: opening a country zooms to it, opening it again closes it and zooms back out.
  const toggleCountry = (id: string) => {
    setActiveCountryId((current) => (current === id ? null : id));
    setActiveStoreId(null);
  };
  // Picking the open store again steps back to the country view.
  const toggleStore = (id: string) => setActiveStoreId((current) => (current === id ? null : id));

  return (
    <MotionConfig reducedMotion="user" transition={{ ease: EASE, duration: 0.5 }}>
      <section
        aria-labelledby="global-presence-title"
        className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)] gap-10 px-4 py-16 md:px-8 lg:min-h-[88dvh] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[auto_1fr] lg:gap-x-16 lg:gap-y-12 lg:py-16"
      >
        <header className="lg:col-start-1 lg:row-start-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Global presence</p>
          <h2
            id="global-presence-title"
            className="mt-5 max-w-[15ch] text-4xl font-medium leading-[1.05] tracking-tight md:text-5xl"
          >
            Built around the world. Designed to feel local.
          </h2>
          <p className="mt-5 max-w-[40ch] text-base leading-relaxed text-muted">
            {storeCount} stores in {countries.length} countries, each one planned around the street it sits on.
          </p>
        </header>

        {/* Decorative: every fact on the globe is also in the list. */}
        <div
          ref={globeRef}
          aria-hidden
          className="relative mx-auto aspect-square w-full max-w-[640px] lg:sticky lg:top-[max(1.5rem,calc(50dvh-320px))] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start"
        >
          <div className="absolute inset-[5%] rounded-full bg-globe" />
          {near && (
            <Globe
              countries={countries}
              activeCountryId={activeCountryId}
              activeStoreId={activeStoreId}
              hoveredId={hoveredId}
              inView={inView}
              reducedMotion={reducedMotion}
            />
          )}
          <AnimatePresence>
            {activeStore && (
              <motion.p
                key={activeStore.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: { delay: reducedMotion ? 0 : 0.75, duration: 0.5 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="pointer-events-none absolute left-1/2 top-[calc(50%+18px)] -translate-x-1/2 whitespace-nowrap text-sm font-medium tracking-tight text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.45)]"
              >
                {activeStore.name}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile and tablet: globe first, then a horizontal country rail. */}
        <div className="lg:hidden">
          <div className="-mx-4 flex snap-x gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:-mx-8 md:px-8">
            {countries.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-expanded={c.id === activeCountryId}
                onClick={() => toggleCountry(c.id)}
                className={`relative min-h-11 shrink-0 snap-start px-3 text-base tracking-tight transition-colors duration-300 active:scale-[0.98] ${c.id === activeCountryId ? "text-ink" : "text-ink/60"}`}
              >
                {c.name}
                {c.id === activeCountryId && (
                  <motion.span layoutId="rail-underline" className="absolute inset-x-3 bottom-1.5 h-px bg-signal" />
                )}
              </button>
            ))}
          </div>
          <div className="mt-6 min-h-32 border-t border-line pt-6">
            <AnimatePresence mode="wait" initial={false}>
              {activeCountry ? (
                <motion.div
                  key={activeCountry.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
                >
                  <p className="text-2xl font-medium tracking-tight">{activeCountry.name}</p>
                  <p className="mt-1 text-sm text-muted">{storeLabel(activeCountry)}</p>
                  <StoreList country={activeCountry} activeStoreId={activeStoreId} onSelect={toggleStore} className="mt-4" />
                </motion.div>
              ) : (
                <motion.p key="empty" exit={{ opacity: 0 }} className="text-sm text-muted">
                  Choose a country to see its stores.
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Desktop: country accordion. */}
        <ol className="hidden self-start lg:col-start-1 lg:row-start-2 lg:block">
          {countries.map((c, i) => {
            const open = c.id === activeCountryId;
            return (
              <li key={c.id} className="relative border-b border-line">
                <h3>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`stores-${c.id}`}
                    onClick={() => toggleCountry(c.id)}
                    onPointerEnter={preview(c.id)}
                    onPointerLeave={preview(null)}
                    onFocus={preview(c.id)}
                    onBlur={preview(null)}
                    className="group grid w-full cursor-pointer grid-cols-[2.75rem_1fr_auto] items-baseline gap-x-4 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
                  >
                    <span
                      className={`font-mono text-xs tabular-nums transition-colors duration-300 ${open ? "text-signal" : "text-muted"}`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`text-xl font-medium tracking-tight transition-colors duration-300 ${open ? "text-ink" : "text-ink/60 group-hover:text-ink"}`}
                    >
                      {c.name}
                    </span>
                    <span className="flex items-center gap-4 text-sm text-muted">
                      {storeLabel(c)}
                      <PlusMinus open={open} />
                    </span>
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div id={`stores-${c.id}`} {...collapse} className="overflow-hidden">
                      <StoreList country={c} activeStoreId={activeStoreId} onSelect={toggleStore} className="pb-4 pl-11" />
                    </motion.div>
                  )}
                </AnimatePresence>
                {open && (
                  <motion.span
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1, transition: { duration: 0.9 } }}
                    className="absolute inset-x-0 -bottom-px h-px origin-left bg-ink"
                  />
                )}
              </li>
            );
          })}
        </ol>

        <p className="sr-only" aria-live="polite">
          {activeStore
            ? `Store location: ${activeStore.name}, ${activeStore.city}. ${activeStore.address ?? ""}`
            : activeCountry
              ? `${activeCountry.name}: ${storeLabel(activeCountry)}.`
              : ""}
        </p>
      </section>
    </MotionConfig>
  );
}

const storeLabel = (c: Country) => `${c.stores.length} ${c.stores.length === 1 ? "store" : "stores"}`;

function StoreList({
  country,
  activeStoreId,
  onSelect,
  className = "",
}: {
  country: Country;
  activeStoreId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <ul className={className}>
      {country.stores.map((s) => {
        const active = s.id === activeStoreId;
        return (
          <li key={s.id}>
            <button
              type="button"
              aria-expanded={active}
              onClick={() => onSelect(s.id)}
              className="group flex min-h-11 w-full items-baseline justify-between gap-4 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span
                className={`text-base tracking-tight transition-colors duration-300 ${active ? "text-ink" : "text-ink/60 group-hover:text-ink"}`}
              >
                {s.name}
              </span>
              <span className={`text-sm transition-colors duration-300 ${active ? "text-signal" : "text-muted"}`}>
                {s.city}
              </span>
            </button>
            <AnimatePresence initial={false}>
              {active && (
                <motion.div {...collapse} className="overflow-hidden">
                  <div className="pb-3">
                    {s.address && (
                      <address className="text-sm not-italic leading-relaxed text-muted">{s.address}</address>
                    )}
                    {s.url && (
                      <a
                        href={s.url}
                        className="group/link inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink"
                      >
                        View store
                        <span aria-hidden className="transition-transform duration-300 group-hover/link:translate-x-1">
                          &rarr;
                        </span>
                      </a>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}

function PlusMinus({ open }: { open: boolean }) {
  return (
    <span aria-hidden className="relative block size-3 text-ink">
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-current" />
      <span
        className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-current transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? "scale-y-0" : ""}`}
      />
    </span>
  );
}
