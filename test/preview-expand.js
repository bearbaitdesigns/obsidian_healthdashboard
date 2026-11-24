{
  const EXP = __EXP__;
  const st = document.createElement('style');
  st.textContent = '.lp-ov{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:60;display:flex;align-items:center;justify-content:center;padding:16px}.lp-ov-box{background:var(--background-primary,#fff);border-radius:12px;padding:16px 20px;width:min(1000px,96vw);max-height:92vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.3)}.lp-ov-box .hd-expand-btn{display:none}';
  document.head.appendChild(st);
  for (const card of document.querySelectorAll('.hd-card,.pt-card,.hk-card,.mt-card')) {
    if (!card.querySelector('.hd-cal-day,.pt-cal-day,.mt-cal-cell,.hk-cal-day,svg.hd-chart,svg.pt-chart,svg.hk-chart,.mt-vbars')) continue;
    if (card.querySelector(':scope > .hd-expand-btn')) continue;
    card.classList.add('hd-has-expand');
    if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
    const b = document.createElement('button');
    b.className = 'clickable-icon hd-expand-btn';
    b.setAttribute('aria-label', 'Expand');
    b.innerHTML = EXP.replace('<svg ', '<svg width="16" height="16" ');
    b.onclick = (e) => {
      e.stopPropagation();
      const ov = document.createElement('div'); ov.className = 'lp-ov theme-light';
      const box = document.createElement('div'); box.className = 'lp-ov-box hd-root';
      const c = card.cloneNode(true); c.classList.add('hd-expand-body');
      c.querySelectorAll('.hd-cal-nav button,.pt-cal-nav button,.hk-cal-nav button,.mt-cal-head button').forEach((n) => n.remove());
      box.appendChild(c); ov.appendChild(box);
      ov.onclick = (ev) => { if (ev.target === ov) ov.remove(); };
      document.body.appendChild(ov);
    };
    card.appendChild(b);
  }
}
