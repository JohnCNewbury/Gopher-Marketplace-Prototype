/* gopher-header.js — shared site header component.
   Generated from the canonical inline block (was duplicated on 121 pages).
   Per-page logo: set window.GopherHeader={logo:'connect'} BEFORE this script. */
(function(){
  if(!document.getElementById('gopher-header-css')){
    var st=document.createElement('style'); st.id='gopher-header-css';
    st.textContent="\n  .gh-header *{ box-sizing:border-box; }\n  .gh-header{\n    --gh-navy:#2a3654; --gh-navy-mid:#253a7e; --gh-green:#33d975; --gh-green-dark:#1fb85f;\n    --gh-green-light:#e0faea; --gh-muted:#6b7280; --gh-line:#eef0f4; --gh-radius:14px;\n    --gh-gutter:28px; /* consistent left/right side padding for the full-bleed bar */\n    --gh-deals-tag:#e8743b; /* deals tagline accent \u2014 set to your exact brand hex */\n    --gh-tag-size:19px;     /* deals tagline font size */\n    position:sticky; top:0; left:0; right:0; z-index:1000;\n    background:#fff; border-bottom:1px solid var(--gh-line);\n    font-family:'DM Sans',sans-serif;\n    transition:box-shadow .2s;\n  }\n  .gh-header.gh-scrolled{ box-shadow:0 8px 30px -16px rgba(42,54,84,0.28); }\n  /* FULL-BLEED bar: no max-width / no auto margins. Logo hugs the true left\n     edge, the right cluster hugs the true right edge, and the absolutely-\n     centered nav lands on the real viewport center at EVERY width. The only\n     inset is a consistent side gutter (--gh-gutter). */\n  .gh-inner{\n    position:relative;\n    width:100%; margin:0; padding:0 var(--gh-gutter); height:66px;\n    display:flex; align-items:center; justify-content:space-between; gap:18px;\n  }\n  /* ---- logo (left zone, vertically centered, height-capped so every brand\n          variant occupies the same vertical space) ---- */\n  .gh-logo{ display:inline-flex; align-items:center; gap:9px; text-decoration:none; flex:0 0 auto; }\n  .gh-logo img{ height:32px; width:auto; max-height:38px; display:block; }\n  .gh-logo-sub{\n    font-family:'Nunito',sans-serif; font-weight:800; font-size:21px; color:var(--gh-green-dark);\n    line-height:1; letter-spacing:-.01em;\n  }\n  /* ---- DEALS TAGLINE (Caveat script, two-page only). The deals MARK keeps the\n          standard height, so the bar's height/alignment never change. The tagline\n          just trails to the right and is REVEALED ONLY when the dead-center nav has\n          room \u2014 so it can never overlap the nav. Two reveal widths below are the\n          only tuning knobs (raise them if your nav is wider). ---- */\n  .gh-logo-tag{\n    font-family:'Caveat', cursive; font-weight:700; font-size:var(--gh-tag-size,19px);\n    line-height:1; color:var(--gh-deals-tag,#e8743b); white-space:nowrap;\n    margin-left:8px; transform:translateY(4px);\n    display:none;            /* hidden by default (mobile/narrow) -> clean mark only */\n  }\n  /* short tagline (\"for neighbors\") needs little room -> show on standard desktop */\n  @media (min-width:1280px){ .gh-logo .gh-logo-tag--short{ display:inline-block; } }\n  /* long tagline (\"for merchants and service providers\") needs more room -> show only when wide */\n  @media (min-width:1560px){ .gh-logo .gh-logo-tag{ display:inline-block; } }\n  /* ---- primary nav (CENTER zone \u2014 absolutely centered so it never shifts\n          when the per-page logo changes width) ---- */\n  .gh-nav{\n    position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);\n    display:flex; align-items:center; gap:4px; white-space:nowrap;\n  }\n  .gh-navlink{\n    position:relative; display:inline-flex; align-items:center; gap:5px;\n    font-family:'Nunito',sans-serif; font-weight:700; font-size:14.5px; color:var(--gh-navy);\n    text-decoration:none; padding:9px 12px; border-radius:9px; cursor:pointer; background:none; border:none;\n    transition:color .15s, background .15s;\n  }\n  .gh-navlink:hover, .gh-navlink.gh-open{ color:var(--gh-green-dark); background:#f2fdf6; }\n  .gh-chev{ width:14px; height:14px; transition:transform .2s; }\n  .gh-navlink.gh-open .gh-chev{ transform:rotate(180deg); }\n  /* ---- dropdown ---- */\n  .gh-dd{ position:relative; }\n  .gh-menu{\n    position:absolute; top:calc(100% + 8px); left:0; min-width:264px;\n    background:#fff; border:1px solid var(--gh-line); border-radius:var(--gh-radius);\n    box-shadow:0 22px 50px -18px rgba(42,54,84,0.4); padding:8px;\n    opacity:0; visibility:hidden; transform:translateY(-6px); transition:opacity .16s, transform .16s, visibility .16s; z-index:5;\n  }\n  .gh-dd.gh-open .gh-menu{ opacity:1; visibility:visible; transform:none; }\n  .gh-menu-item{ display:block; text-decoration:none; padding:10px 12px; border-radius:10px; transition:background .14s; }\n  .gh-menu-item:hover{ background:var(--gh-green-light); }\n  .gh-menu-title{ font-family:'Nunito',sans-serif; font-weight:800; font-size:14.5px; color:var(--gh-navy); }\n  .gh-menu-sub{ font-size:12px; color:var(--gh-muted); margin-top:2px; }\n  /* ---- right cluster ---- */\n  .gh-right{ display:flex; align-items:center; gap:10px; flex:0 0 auto; }\n  .gh-login{\n    font-family:'Nunito',sans-serif; font-weight:800; font-size:14px; cursor:pointer;\n    color:var(--gh-navy); background:none; border:none; padding:9px 10px; border-radius:9px;\n    transition:color .15s, background .15s;\n  }\n  .gh-login:hover{ color:var(--gh-green-dark); background:#f2fdf6; }\n\n  /* ---- hamburger: 3 BARE bars (no box), top+bottom BOLD, middle REGULAR ---- */\n  .gh-burger{\n    display:inline-flex; flex-direction:column; justify-content:center; gap:5px; cursor:pointer;\n    width:28px; height:26px; padding:0; border:none; background:none;\n  }\n  .gh-burger span{ display:block; width:100%; height:3px; border-radius:2px; background:var(--gh-navy);\n    transition:transform .3s ease, opacity .2s ease, background .2s; }\n  .gh-burger span:nth-child(2){ height:2px; }              /* middle bar = regular (thinner) */\n  .gh-burger:hover span{ background:var(--gh-green-dark); }\n  /* morph into an \"X\" while the menu is open: the two BOLD bars rotate to meet,\n     the regular middle bar fades out (the X is formed by the two bold bars) */\n  .gh-burger.gh-open span:nth-child(1){ transform:translateY(7.5px) rotate(45deg); }\n  .gh-burger.gh-open span:nth-child(2){ opacity:0; }\n  .gh-burger.gh-open span:nth-child(3){ transform:translateY(-7.5px) rotate(-45deg); }\n\n  /* ---- top-right dropdown panels (shared by Login + Hamburger menu) ---- */\n  .gh-pop{\n    /* These panels are mounted on <body> (outside .gh-header) for robust fixed\n       positioning, so they carry their own copy of the design tokens \u2014 otherwise\n       var(--gh-*) would be undefined here and links would fall back to default blue. */\n    --gh-navy:#2a3654; --gh-green:#33d975; --gh-green-dark:#1fb85f;\n    --gh-green-light:#e0faea; --gh-muted:#6b7280; --gh-line:#eef0f4;\n    position:fixed; top:64px; right:16px; z-index:1003;          /* 'right'/'top' are tunable */\n    width:264px; max-width:calc(100vw - 24px); max-height:calc(100vh - 84px); overflow-y:auto;\n    background:#fff; border:1px solid var(--gh-line); border-radius:16px;\n    box-shadow:0 22px 54px -18px rgba(20,28,48,0.34); padding:10px;\n    opacity:0; visibility:hidden; transform:translateY(-8px) scale(.98); transform-origin:top right;\n    transition:opacity .18s ease, transform .18s ease, visibility .18s;\n  }\n  .gh-pop.gh-open{ opacity:1; visibility:visible; transform:none; }\n  /* login portals: underlined title link + subtitle */\n  .gh-pop-link{ display:block; text-decoration:none; padding:10px 12px; border-radius:11px; transition:background .14s; }\n  .gh-pop-link:hover{ background:var(--gh-green-light); }\n  .gh-pop-title{ display:block; font-family:'Nunito',sans-serif; font-weight:800; font-size:15px; color:var(--gh-navy);\n    text-decoration:underline; text-underline-offset:3px; text-decoration-thickness:1.5px; }\n  .gh-pop-link:hover .gh-pop-title{ color:var(--gh-green-dark); }\n  .gh-pop-sub{ display:block; font-family:'DM Sans',sans-serif; font-size:12px; color:var(--gh-muted); margin-top:2px; }\n  /* menu links: centered navy underlined */\n  .gh-pop-mlink{ display:block; width:100%; text-align:center; padding:11px 12px; border-radius:11px;\n    font-family:'Nunito',sans-serif; font-weight:800; font-size:15px; color:var(--gh-navy);\n    text-decoration:underline; text-underline-offset:3px; text-decoration-thickness:1.5px;\n    background:none; border:none; cursor:pointer; transition:background .14s, color .14s; }\n  .gh-pop-mlink:hover{ background:var(--gh-green-light); color:var(--gh-green-dark); }\n  .gh-pop-sep{ height:1px; background:var(--gh-line); border:0; margin:8px 6px; }\n  .gh-pop-primary{ display:none; }   /* primary nav inside menu \u2014 only when inline nav is hidden */\n  /* Tutorials / Deals accordion inside the menu pop */\n  .gh-acc-toggle{ display:flex; align-items:center; justify-content:center; gap:7px; }\n  .gh-acc-toggle .gh-chev{ flex:0 0 auto; opacity:.7; }\n  .gh-acc-toggle.gh-open .gh-chev{ transform:rotate(180deg); }\n  .gh-acc-panel{ overflow:hidden; max-height:0; transition:max-height .24s ease; }\n  .gh-acc-panel .gh-pop-mlink{ font-size:13.5px; font-weight:600; color:var(--gh-muted); text-decoration:none; padding:9px; }\n  .gh-acc-panel .gh-pop-mlink:hover{ color:var(--gh-green-dark); }\n  /* ---- responsive ---- */\n  @media (max-width:1080px){\n    .gh-nav{ display:none; }            /* inline nav collapses into the hamburger menu */\n    .gh-pop-primary{ display:block; }   /* ...which then also carries the primary nav */\n  }\n  @media (max-width:520px){ .gh-header{ --gh-gutter:16px; } }\n";
    (document.head||document.documentElement).appendChild(st);
  }
})();

(function bootGopherHeader(){
  var CFG = (typeof window!=='undefined' && window.GopherHeader) || {};

  // ---- ALL ROUTES IN ONE PLACE (page can override via window.GopherHeader.links) ----
  var LINKS = Object.assign({
    homepage:        'index.html',
    request:         'gopher-request.html',
    connect:         'gopher-connect.html',
    go:              'gopher-go.html',            // "Service Providers"
    customerDeals:   'gopher-customer-deals.html',
    merchantDeals:   'gopher-deals.html',
    services:        'gopher-services.html',      // "Services" nav
    faqs:            'gopher-faqs.html',
    contact:         'gopher-contact-us.html',
    ourStory:        'gopher-our-story.html',
    blog:            'gopher-blog.html',
    tutorialRequest: 'gopher-request-101.html',
    tutorialConnect: 'gopher-connect-101.html',
    tutorialGo:      'gopher-go-101.html',
    tutorialDeals:   'gopher-deals-101.html'
  }, CFG.links || {});

  // Optional anchor appended to each LOGIN link so it jumps to the sign-in SECTION
  // of that page (the element whose id matches, e.g. <section id="login">). Pages
  // without a sign-in section yet are left as '' (link lands at the top of the page).
  // Override per page via:  window.GopherHeader = { logo:'...', loginHash:{ request:'#signin' } };
  var LOGIN_HASH = Object.assign({
    request: '#login',   // -> gopher-request.html#login
    connect: '#login',   // -> gopher-connect.html#login
    go:      '#login',   // -> gopher-go.html#login (worker portal)
    deals:   '#login'    // -> gopher-deals.html#login
  }, CFG.loginHash || {});

  var DEFAULT_LOGO = {
    src: 'assets/img/gopher-logo.svg',
    href: LINKS.homepage, alt: 'Gopher'
  };

  // ---- PER-PAGE BRAND LOGOS ----------------------------------------------
  // The five brand pages each show their own logo. Drop the real art in (set
  // `src` to the image URL/path) and it's used; if the image is missing it
  // gracefully falls back to the `text` wordmark so nothing ever looks broken.
  // A page selects its logo with one line:  window.GopherHeader = { logo:'request' };
  // (or pass a full object for a custom logo). Replace the src paths below with
  // your real asset URLs once you have them.
  // ---- REAL BRAND LOGOS (base64-embedded so the header is one self-contained
  //      file with no external asset dependencies). Source art = the supplied
  //      SVGs. 'deals' is the CLEAN mark+wordmark (no tagline) per spec. ----
  var LOGOS = {
    request: 'assets/img/gopher-request-logo.svg',
    connect: 'assets/img/gopher-connect-logo.svg',
    go: 'assets/img/gopher-go-logo.svg',
    deals: 'assets/img/gopher-deals-logo.svg',
  };

  var BRANDS = {
    // Only the LEFT logo changes per page; everything from the nav rightward is constant.
    'default':       { src: DEFAULT_LOGO.src,        alt:'Gopher',         href: LINKS.homepage },
    'request':       { src: LOGOS.request, h:32, text:'Request', alt:'Gopher Request', href: LINKS.homepage },
    'connect':       { src: LOGOS.connect, h:32, text:'Connect', alt:'Gopher Connect', href: LINKS.homepage },
    'go':            { src: LOGOS.go,      h:24, text:'Go',      alt:'Gopher Go',      href: LINKS.homepage },
    // customerDeals + merchantDeals share the one clean "deals" logo (tagline lives
    // only in the full marketing lockup, never in the bar — it breaks height/alignment).
    'customerDeals': { src: LOGOS.deals, h:32, text:'Deals', tag:'— for neighbors',                       alt:'Gopher Deals', href: LINKS.homepage },
    'merchantDeals': { src: LOGOS.deals, h:32, text:'Deals', tag:'— for merchants', alt:'Gopher Deals', href: LINKS.homepage }
  };
  if(CFG.brands) for(var k in CFG.brands){ BRANDS[k] = CFG.brands[k]; }   // page can override asset paths

  // Accept a brand-key string ("request") OR a full logo object; null -> default.
  function resolveLogo(logo){
    if(!logo) return BRANDS['default'];
    if(typeof logo === 'string') return BRANDS[logo] || BRANDS['default'];
    return logo;
  }

  // ---------- small svg helpers ----------
  function chev(){ return '<svg class="gh-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

  // ---------- logo (the only per-page difference) ----------
  function logoHTML(logo){
    logo = resolveLogo(logo);
    var href = logo.href || LINKS.homepage;
    var inner;
    if(logo.html){ inner = logo.html; }
    else if(logo.src){
      // real art preferred; if it 404s, JS swaps in the wordmark fallback (wired after mount)
      var fb = logo.text ? ' data-fallback-text="'+esc(logo.text)+'"' : '';
      var hs = logo.h ? ' style="height:'+logo.h+'px"' : '';
      inner = '<img src="'+esc(logo.src)+'" alt="'+esc(logo.alt||'Gopher')+'"'+fb+hs+'>';
    }
    else if(logo.text){
      // wordmark: main mark + accent label (e.g. "gopher Request")
      inner = '<img src="'+esc(DEFAULT_LOGO.src)+'" alt="Gopher"><span class="gh-logo-sub">'+esc(logo.text)+'</span>';
    } else { inner = '<img src="'+esc(DEFAULT_LOGO.src)+'" alt="'+esc(DEFAULT_LOGO.alt)+'">'; }
    if(logo.tag){
      var _short = String(logo.tag).length <= 20 ? ' gh-logo-tag--short' : '';
      inner += '<span class="gh-logo-tag'+_short+'">'+esc(logo.tag)+'</span>';
    }
    return '<a class="gh-logo" href="'+esc(href)+'" aria-label="Gopher home">'+inner+'</a>';
  }
  // If a brand image is missing, fall back to the default mark + wordmark text.
  function wireLogoFallback(root){
    (root||document).querySelectorAll('.gh-logo img[data-fallback-text]').forEach(function(img){
      img.addEventListener('error', function onErr(){
        img.removeEventListener('error', onErr);
        img.src = DEFAULT_LOGO.src;
        var s = document.createElement('span');
        s.className = 'gh-logo-sub';
        s.textContent = img.getAttribute('data-fallback-text');
        if(img.parentNode && !img.parentNode.querySelector('.gh-logo-sub')) img.parentNode.appendChild(s);
      });
    });
  }

  // ---------- markup ----------
  function buildHeader(logo){
    return ''
    + '<header class="gh-header" id="ghHeader">'
    +   '<div class="gh-inner">'
    +     logoHTML(logo)
    +     '<nav class="gh-nav" aria-label="Primary">'
    +       '<a class="gh-navlink" href="'+LINKS.homepage+'">Home</a>'
    +       '<a class="gh-navlink" href="'+LINKS.request+'">Gopher Request</a>'
    +       '<a class="gh-navlink" href="'+LINKS.connect+'">Gopher Connect</a>'
    +       '<a class="gh-navlink" href="'+LINKS.go+'">Service Providers</a>'
    +       '<div class="gh-dd" data-dd>'
    +         '<button class="gh-navlink" data-dd-toggle aria-haspopup="true" aria-expanded="false">Deals'+chev()+'</button>'
    +         '<div class="gh-menu" role="menu">'
    +           '<a class="gh-menu-item" role="menuitem" href="'+LINKS.customerDeals+'"><div class="gh-menu-title">View Local Deals</div><div class="gh-menu-sub">Gopher Users</div></a>'
    +           '<a class="gh-menu-item" role="menuitem" href="'+LINKS.merchantDeals+'"><div class="gh-menu-title">Offer a Deal</div><div class="gh-menu-sub">Merchants &amp; Service Providers</div></a>'
    +         '</div>'
    +       '</div>'
    +       '<a class="gh-navlink" href="'+LINKS.services+'">Services</a>'
    +     '</nav>'
    +     '<div class="gh-right">'
    +       '<button class="gh-login" data-open-login>Login/Sign-Up</button>'
    +       '<button class="gh-burger" data-open-drawer aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button>'
    +     '</div>'
    +   '</div>'
    + '</header>'
    // ----- Login / Sign-Up dropdown (anchored top-right) -----
    + '<div class="gh-pop gh-pop--login" id="ghLoginPop" role="menu" aria-label="Login or sign up" aria-hidden="true">'
    +   popLink('request','Gopher Request','For neighbors hiring help', LINKS.request + (LOGIN_HASH.request||''))
    +   popLink('go','Gopher Go','For workers earning', LINKS.go + (LOGIN_HASH.go||''))
    +   popLink('connect','Gopher Connect','For businesses', LINKS.connect + (LOGIN_HASH.connect||''))
    +   popLink('deals','Gopher Deals','For merchants and service providers', LINKS.merchantDeals + (LOGIN_HASH.deals||''))
    + '</div>'
    // ----- Hamburger menu dropdown (anchored top-right) -----
    + '<div class="gh-pop gh-pop--menu" id="ghMenuPop" role="menu" aria-label="Menu" aria-hidden="true">'
    +   '<div class="gh-pop-primary">'
    +     '<a class="gh-pop-mlink" href="'+LINKS.homepage+'">Home</a>'
    +     '<a class="gh-pop-mlink" href="'+LINKS.request+'">Gopher Request</a>'
    +     '<a class="gh-pop-mlink" href="'+LINKS.connect+'">Gopher Connect</a>'
    +     '<a class="gh-pop-mlink" href="'+LINKS.go+'">Service Providers</a>'
    +     '<button class="gh-pop-mlink gh-acc-toggle" data-acc>Deals'+chev()+'</button>'
    +     '<div class="gh-acc-panel">'
    +       '<a class="gh-pop-mlink" href="'+LINKS.customerDeals+'">View Local Deals</a>'
    +       '<a class="gh-pop-mlink" href="'+LINKS.merchantDeals+(LOGIN_HASH.deals||'')+'" data-login-portal="deals">Offer a Deal</a>'
    +     '</div>'
    +     '<a class="gh-pop-mlink" href="'+LINKS.services+'">Services</a>'
    +     '<hr class="gh-pop-sep">'
    +   '</div>'
    +   '<a class="gh-pop-mlink" href="'+LINKS.faqs+'">FAQs</a>'
    +   '<a class="gh-pop-mlink" href="'+LINKS.contact+'">Contact Us</a>'
    +   '<button class="gh-pop-mlink gh-acc-toggle" data-acc>Tutorials'+chev()+'</button>'
    +   '<div class="gh-acc-panel">'
    +     '<a class="gh-pop-mlink" href="'+LINKS.tutorialRequest+'">Gopher Request 101</a>'
    +     '<a class="gh-pop-mlink" href="'+LINKS.tutorialConnect+'">Gopher Connect 101</a>'
    +     '<a class="gh-pop-mlink" href="'+LINKS.tutorialGo+'">Gopher Go 101</a>'
    +     '<a class="gh-pop-mlink" href="'+LINKS.tutorialDeals+'">Gopher Deals 101</a>'
    +   '</div>'
    +   '<a class="gh-pop-mlink" href="'+LINKS.ourStory+'">Our Story</a>'
    +   '<a class="gh-pop-mlink" href="'+LINKS.blog+'">Gopher Blog</a>'
    + '</div>';
  }
  function popLink(which, title, sub, href){
    // Plain navigating anchor: the href is the source of truth, so the link ALWAYS
    // works — even under a strict CSP (which blocks inline onclick) or if the host
    // page reassigns window.GopherHeader. The optional sign-in seam is attached in
    // wire() via addEventListener and only intercepts if it explicitly opts to.
    return '<a class="gh-pop-link" role="menuitem" href="'+href+'" data-login-portal="'+which+'">'
      + '<span class="gh-pop-title">'+esc(title)+'</span>'
      + '<span class="gh-pop-sub">'+esc(sub)+'</span>'
    + '</a>';
  }

  // ---------- mount ----------
  function mount(){
    var host = document.getElementById('gopher-header');
    var holder = document.createElement('div');
    holder.innerHTML = buildHeader(CFG.logo);
    var nodes = Array.prototype.slice.call(holder.childNodes);
    if(host){ nodes.forEach(function(n){ host.parentNode.insertBefore(n, host); }); host.parentNode.removeChild(host); }
    else { for(var i=nodes.length-1;i>=0;i--){ document.body.insertBefore(nodes[i], document.body.firstChild); } }
    // Re-home the fixed dropdown panels to <body> so their position:fixed can never
    // be broken by a transformed / clipping ancestor on the host page.
    ['ghLoginPop','ghMenuPop'].forEach(function(id){ var el=document.getElementById(id); if(el) document.body.appendChild(el); });
    wireLogoFallback(document);
    wire();
  }

  // ---------- behavior ----------
  var lastFocus=null;
  function lockScroll(on){ document.documentElement.style.overflow = on?'hidden':''; }
  function q(s,r){ return (r||document).querySelector(s); }
  function qa(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }

  function wire(){
    var header = q('#ghHeader');
    var onScroll=function(){ header.classList.toggle('gh-scrolled', (window.scrollY||window.pageYOffset)>4); };
    window.addEventListener('scroll', onScroll, {passive:true}); onScroll();

    var dd=q('[data-dd]'), ddBtn=q('[data-dd-toggle]');
    var loginPop=q('#ghLoginPop'), menuPop=q('#ghMenuPop'), burger=q('[data-open-drawer]');

    function ddOpen(o){ dd.classList.toggle('gh-open',o); ddBtn.classList.toggle('gh-open',o); ddBtn.setAttribute('aria-expanded',o?'true':'false'); }
    function popOpen(pop,o){ pop.classList.toggle('gh-open',o); pop.setAttribute('aria-hidden',o?'false':'true'); }
    function burgerX(o){ burger.classList.toggle('gh-open',o); burger.setAttribute('aria-expanded',o?'true':'false'); }
    function closeAll(){ ddOpen(false); popOpen(loginPop,false); popOpen(menuPop,false); burgerX(false); }

    // top-bar Deals dropdown (hover on desktop + click)
    ddBtn.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); var open=!dd.classList.contains('gh-open'); closeAll(); ddOpen(open); });
    dd.addEventListener('mouseenter', function(){ if(window.innerWidth>1080){ popOpen(loginPop,false); popOpen(menuPop,false); burgerX(false); ddOpen(true); } });
    dd.addEventListener('mouseleave', function(){ if(window.innerWidth>1080) ddOpen(false); });

    // Login / Sign-Up dropdown
    qa('[data-open-login]').forEach(function(b){ b.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); var open=!loginPop.classList.contains('gh-open'); closeAll(); popOpen(loginPop,open); }); });

    // Login portal links: ALWAYS navigate to their href. The integration seam may
    // intercept by returning false (e.g. to launch a real auth flow); any error in
    // the seam is swallowed so the link still navigates.
    qa('[data-login-portal]').forEach(function(a){
      a.addEventListener('click', function(e){
        var go=true; try{ go=API._login(a.getAttribute('data-login-portal'), a.getAttribute('href')); }catch(err){}
        if(go===false) e.preventDefault(); else closeAll();
      });
    });

    // Hamburger menu dropdown (button morphs to X)
    burger.addEventListener('click', function(e){ e.stopPropagation(); var open=!menuPop.classList.contains('gh-open'); closeAll(); popOpen(menuPop,open); burgerX(open); });

    // accordions inside the menu pop (Tutorials; Deals on mobile)
    qa('[data-acc]').forEach(function(btn){
      var panel=btn.nextElementSibling;
      btn.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation();
        var open=btn.classList.toggle('gh-open');
        panel.style.maxHeight = open ? (panel.scrollHeight+'px') : '0px';
      });
    });

    // dismiss: click outside any menu, or Escape
    document.addEventListener('click', function(e){
      if(e.target.closest('.gh-pop')||e.target.closest('[data-dd]')||e.target.closest('[data-open-login]')||e.target.closest('[data-open-drawer]')) return;
      closeAll();
    });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeAll(); });

    // expose controls
    API._drawer=function(o){ closeAll(); if(o!==false){ popOpen(menuPop,true); burgerX(true); } };
    API._loginToggle=function(o){ closeAll(); if(o!==false) popOpen(loginPop,true); };
  }

  // ---------- public API ----------
  var API = window.GopherHeader = CFG;
  API.links = LINKS;
  API.openDrawer = function(){ API._drawer && API._drawer(true); };
  API.closeDrawer= function(){ API._drawer && API._drawer(false); };
  API.openLogin  = function(){ API._loginToggle && API._loginToggle(true); };
  API.closeLogin = function(){ API._loginToggle && API._loginToggle(false); };
  // Re-render the logo at runtime (used by the demo; handy for SPA-style nav).
  API.setLogo = function(logo){
    var a = q('.gh-header .gh-logo'); if(!a) return;
    var holder=document.createElement('div'); holder.innerHTML = logoHTML(logo||CFG.logo);
    a.parentNode.replaceChild(holder.firstChild, a);
    wireLogoFallback(document);
  };
  // INTEGRATION SEAM: real auth/portal routing goes here. Returning true lets the
  // link navigate to the chosen portal page; wire your sign-in flow as needed.
  API._login = function(which, href){
    try{ window.__gopherLoginChoice = { which:which, at:Date.now() }; }catch(e){}
    if(typeof API.onLogin==='function'){ return API.onLogin(which, href) !== false; }
    return true; // default: navigate to the portal page
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();

