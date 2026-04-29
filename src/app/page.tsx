import Link from "next/link";

export default function Home() {
  return (
    <main className="retro-bg flex min-h-screen flex-1 items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-3xl bg-white/90 p-8 text-slate-900 shadow-2xl backdrop-blur md:p-10">
        <h1 className="font-display text-3xl font-black tracking-tight md:text-5xl">
          Who Is Most Likely To?
        </h1>
        <p className="mt-3 text-sm text-slate-600 md:text-base">
          Run the game from the admin panel, display questions on a TV, and let players vote
          from their phones in real time.
        </p>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          <Link
            href="/admin"
            className="rounded-2xl bg-indigo-600 px-4 py-5 text-center font-bold text-white transition hover:bg-indigo-700"
          >
            Open Admin
          </Link>
          <Link
            href="/tv"
            className="rounded-2xl bg-fuchsia-600 px-4 py-5 text-center font-bold text-white transition hover:bg-fuchsia-700"
          >
            Open TV View
          </Link>
          <Link
            href="/play"
            className="rounded-2xl bg-emerald-600 px-4 py-5 text-center font-bold text-white transition hover:bg-emerald-700"
          >
            Open Player View
          </Link>
        </div>
      </div>
    </main>
  );
}
