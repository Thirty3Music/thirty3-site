(async function(){
  const wrap = document.querySelector('#events-wrap');
  if(!wrap) return;
  const res = await fetch('data/events.json');
  const all = await res.json();

  const today = new Date().toISOString().slice(0,10);
  const upcoming = all.filter(e => e.date >= today)
                      .sort((a,b)=> a.date.localeCompare(b.date));
  const past = all.filter(e => e.date < today)
                  .sort((a,b)=> b.date.localeCompare(a.date));

  function f(d){
    const dt = new Date(d+'T12:00:00');
    return dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  }

  function row(e){
    return `
      <li class="evt">
        <span class="d">${f(e.date)}</span>
        <span class="t">${e.title}</span>
        <span class="v">${e.venue}${e.city? ' — '+e.city:''}</span>
        <a class="lnk" href="${e.url}" target="_blank" rel="noopener">View</a>
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
