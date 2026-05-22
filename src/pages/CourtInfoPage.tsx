import AppLayout from '../app/AppLayout';

function CourtInfoPage() {
  return (
    <AppLayout>
      <section className="mx-auto w-full max-w-4xl space-y-5">
        <header className="hero-panel dashboard-hero rounded-[2rem] p-6 text-center shadow-sm sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-court-700">
            Court Info
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-ink-900 sm:text-4xl">
            Court Reservations
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-ink-700">
            After both players agree on a time, please contact the tennis office
            to reserve the court.
          </p>
        </header>

        <section className="premium-card rounded-[2rem] p-5 sm:p-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <a
              className="rounded-2xl border border-line-200 bg-white px-5 py-5 text-center shadow-sm transition hover:border-court-500 hover:bg-court-50"
              href="mailto:teniss@rotonpoint.org"
            >
              <p className="text-xs font-black uppercase tracking-[0.14em] text-court-700">
                Email
              </p>
              <p className="mt-2 text-lg font-black text-ink-900">
                teniss@rotonpoint.org
              </p>
            </a>
            <a
              className="rounded-2xl border border-line-200 bg-white px-5 py-5 text-center shadow-sm transition hover:border-court-500 hover:bg-court-50"
              href="tel:2038381606"
            >
              <p className="text-xs font-black uppercase tracking-[0.14em] text-court-700">
                Phone
              </p>
              <p className="mt-2 text-lg font-black text-ink-900">
                203-838-1606 ext. 101
              </p>
            </a>
          </div>
        </section>
      </section>
    </AppLayout>
  );
}

export default CourtInfoPage;
