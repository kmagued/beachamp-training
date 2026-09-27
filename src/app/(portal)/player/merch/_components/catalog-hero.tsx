/** The page's opening: a band of sand crossed by court tape. Full-bleed on phones. */
export function CatalogHero({ subtitle }: { subtitle: string }) {
  return (
    <section className="relative overflow-hidden bg-sand -mx-4 -mt-4 px-5 pt-7 pb-6 sm:mx-0 sm:mt-0 sm:rounded-2xl sm:px-9 sm:py-10">
      {/* Boundary tape, like the lines on a sand court */}
      <span
        aria-hidden="true"
        className="absolute -right-16 top-[38%] h-3.5 w-72 origin-right -rotate-[32deg] bg-primary/90 sm:h-5 sm:w-[34rem] sm:top-[4%] sm:-right-10"
      />
      <span
        aria-hidden="true"
        className="absolute -right-16 top-[64%] h-3.5 w-72 origin-right -rotate-[32deg] bg-secondary/55 sm:h-5 sm:w-[34rem] sm:top-[34%] sm:-right-10"
      />
      <div className="relative">
        <h1 className="font-display text-[2.75rem] leading-[0.9] text-primary-900 max-w-[6ch] sm:max-w-none sm:text-6xl">
          Beachamp kit
        </h1>
        <p className="mt-2.5 max-w-[30ch] text-sm text-primary-700 sm:max-w-md sm:text-base">{subtitle}</p>
      </div>
    </section>
  );
}
