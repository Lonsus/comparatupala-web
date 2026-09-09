'use strict';

(() => {
  const STYLE_ID = 'catalog-card-polish-style';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .catalog-card-savings{display:grid;gap:6px;margin:4px 0 10px}
      .catalog-card-savings .card-saving{margin:0;border:1px solid transparent}
      .catalog-card-savings .card-saving-vs-store{background:#e1f7ea;border-color:#b4dfc5}
      .catalog-card-savings .card-saving-vs-pvp{background:#eef9f3;border-color:#cce8d7}
      .catalog-list-decision .catalog-card-savings{flex-basis:100%;width:100%;margin-top:6px}
      .catalog-list-decision .catalog-card-savings .card-saving{width:100%}

      .decision-card:not(.catalog-list-row){
        --catalog-action-size:36px;
        --catalog-action-right:12px;
        --catalog-action-top:12px;
        --catalog-action-gap:8px;
      }
      .decision-card:not(.catalog-list-row) .card-visual>.save-button,
      .decision-card.catalog-history-card:not(.catalog-list-row)>.catalog-history-trigger{
        right:var(--catalog-action-right);
        width:var(--catalog-action-size);
        height:var(--catalog-action-size);
        min-width:var(--catalog-action-size);
        min-height:var(--catalog-action-size);
        padding:0;
        display:grid;
        place-items:center;
      }
      .decision-card:not(.catalog-list-row) .card-visual>.save-button{
        top:var(--catalog-action-top);
        font-size:19px;
        line-height:1;
      }
      .decision-card.catalog-history-card:not(.catalog-list-row)>.catalog-history-trigger{
        top:calc(var(--catalog-action-top) + var(--catalog-action-size) + var(--catalog-action-gap));
      }
      .decision-card.catalog-history-card:not(.catalog-list-row)>.catalog-history-trigger svg{
        width:18px;
        height:18px;
      }

      @media(max-width:800px){
        .decision-card:not(.catalog-list-row){
          --catalog-action-size:31px;
          --catalog-action-top:12px;
          --catalog-action-gap:7px;
        }
        .decision-card:not(.catalog-list-row) .card-visual>.save-button{
          font-size:18px;
        }
        .decision-card.catalog-history-card:not(.catalog-list-row)>.catalog-history-trigger svg{
          width:16px;
          height:16px;
        }
        .catalog-list-row .catalog-list-visual>.save-button{
          width:30px;
          height:30px;
          min-height:30px;
          padding:0;
          place-items:center;
          font-size:18px;
          line-height:1;
        }
        .catalog-list-row>.catalog-history-trigger{
          width:30px;
          height:30px;
          min-height:30px;
          padding:0;
          display:grid;
          place-items:center;
        }
      }

      @media(max-width:540px){
        .decision-card:not(.catalog-list-row){
          --catalog-action-size:30px;
          --catalog-action-top:11px;
          --catalog-action-gap:8px;
        }
        .decision-card:not(.catalog-list-row) .card-visual>.save-button{
          font-size:17px;
        }
        .decision-card.catalog-history-card:not(.catalog-list-row)>.catalog-history-trigger svg{
          width:15px;
          height:15px;
        }
        .catalog-card-savings{gap:5px}
        .catalog-card-savings .card-saving{padding:8px 9px;font-size:11px;line-height:1.35}
        .catalog-card-savings .card-saving strong{font-size:12px}
      }
    `;
    document.head.appendChild(style);
  }

  function splitSavings(html) {
    return String(html).replace(/<p class="card-saving([^"]*)">([\s\S]*?)<\/p>/g, (full, suffix, body) => {
      const lines = body.split(/<br\s*\/?>/i).map(line => line.trim()).filter(Boolean);
      if (lines.length < 2) return full;

      const extraClasses = String(suffix || '').trim();
      const isList = extraClasses.split(/\s+/).includes('catalog-list-saving');
      const items = lines.map(line => {
        const kind = /sobre el PVP/i.test(line) ? 'card-saving-vs-pvp' : 'card-saving-vs-store';
        const listClass = isList ? ' catalog-list-saving' : '';
        return `<p class="card-saving ${kind}${listClass}">${line}</p>`;
      }).join('');

      return `<div class="catalog-card-savings${isList ? ' catalog-card-savings-list' : ''}">${items}</div>`;
    });
  }

  ensureStyles();

  const baseCard = card;
  card = function cardWithMobileActionsAndSplitSavings(row) {
    return splitSavings(baseCard(row));
  };
})();
