(async function(){
  const wrap = document.querySelector('#events-wrap');
  if(!wrap) return;
  const res = await fetch('data/events.json');
  const all = await res.json();

  const today = new Date().toISOString().slice(0, 10);
  const trimmed = all.map(e => ({ ...e, date: (e.date || '').trim() }));
  const upcoming = trimmed
    .filter(e => !e.date || e.date >= today)
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
  const past = trimmed
    .filter(e => e.date && e.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));

  function formatDate(d) {
    const dt = new Date(`${d}T12:00:00`);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function row(e) {
    const hasDate = Boolean(e.date);
    const location = [e.venue, e.city, e.country].filter(Boolean).join(' — ');
    const subtitle = e.subtitle ? `<p class="evt-sub">${e.subtitle}</p>` : '';
    const meta = location ? `<p class="evt-meta">${location}</p>` : '';

    return `
      <li class="evt">
        ${hasDate ? `<span class="evt-badge">${formatDate(e.date)}</span>` : ''}
        <div class="evt-body">
          <h4 class="evt-title">${e.title}</h4>
          ${subtitle}
          ${meta}
        </div>
        <a class="evt-link" href="${e.link}" target="_blank" rel="noopener">View details</a>
      </li>`;
  }

  wrap.innerHTML = `
    <div class="events-head">
      <h3 class="events-title">Events</h3>
      <a class="chip" href="https://ra.co/dj/thirty3" target="_blank" rel="noopener">View all on RA</a>
    </div>
    <ul class="events-list">${upcoming.map(row).join('') || '<li class="muted">No upcoming events yet.</li>'}</ul>
    <details class="events-past"><summary>Past events</summary>
      <ul class="events-list past">${past.map(row).join('') || '<li class="muted">—</li>'}</ul>
    </details>`;
})();
