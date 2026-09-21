export default function Home() {
  return (
    <main className="flex min-h-screen items-center bg-[var(--warm-white)] px-6 py-20 text-[var(--ink)] sm:px-10">
      <section className="mx-auto w-full max-w-7xl border-y border-[var(--line)] py-16 sm:py-24">
        <p className="text-sm font-semibold uppercase text-[var(--graphite)]">
          Elysha Works for service professionals
        </p>
        <h1 className="mt-6 max-w-6xl text-5xl font-semibold leading-[1.02] sm:text-7xl lg:text-8xl">
          Websites and client systems built to turn interest into action.
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-[var(--graphite)]">
          The Next.js foundation is ready. The existing static portfolio remains
          the approved reference while its full experience is migrated.
        </p>
      </section>
    </main>
  );
}
